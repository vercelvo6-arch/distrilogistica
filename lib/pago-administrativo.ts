import { getDB } from './db'

// Observación del abono que nace cuando un pago administrativo se confirma DIRECTO en
// Cuadre Administrativo (sin pasar por el cuadre de caja). Lo distingue de los cobros
// que el entregador trae a su cuadre:
//   - no se precarga en el cuadre de caja (no es plata que él traiga);
//   - no cuenta como "duplicado coherente" de un cobro posterior: ya está confirmado,
//     y un pago igual más adelante es otro pago real;
//   - el Resumen del Historial lo cuenta como cobro administrativo de ese entregador.
export const OBSERVACION_PAGO_ADMINISTRATIVO_DIRECTO = 'Pago administrativo confirmado en Cuadre Administrativo'

type Resultado =
  | { ok: true; mensaje: string; aviso?: string }
  | { ok: false; error: string; status: number; codigo?: 'posible_duplicado' }

// Base de una referencia para compararla con otras: sin el agregado que pone caja al
// repartir un comprobante entre varias facturas (-1, -2, _, __…), sin símbolos, y con la
// letra O leída como cero (error típico al digitar). Debe coincidir con BASE_REFERENCIA_SQL.
const BASE_REFERENCIA_SQL = (col: string) =>
  `translate(regexp_replace(regexp_replace(upper(${col}), '[-_ ]+[0-9]{0,2}$', ''), '[^A-Z0-9]', '', 'g'), 'O', '0')`

// Busca otro pago administrativo que parezca el MISMO pago registrado dos veces: misma
// referencia base, misma deuda y mismo monto. Repartir un comprobante entre deudas distintas
// (otra factura, otro fiado) es válido y no se marca. Solo se compara contra pagos ya
// confirmados o registrados antes, para que el primero de los dos sí se pueda confirmar.
export async function buscarPosiblePagoRepetido(pago: any): Promise<any | null> {
  const ref = String(pago.referencia || '').trim()
  if (!/\d/.test(ref)) return null
  const deuda = pago.tipo === 'pedido_asesor' ? pago.pedido_id : pago.fiado_id
  if (!deuda) return null
  const sql = getDB()
  const [otro] = (await sql.query(
    `SELECT id, referencia, monto, estado, registrado_en FROM pagos_anticipados
     WHERE id <> $1
       AND (estado = 'vinculado' OR id < $1)
       AND COALESCE(fiado_id, pedido_id) = $2
       AND monto = $3
       AND referencia IS NOT NULL
       AND ${BASE_REFERENCIA_SQL('referencia')} = ${BASE_REFERENCIA_SQL('$4::text')}
     ORDER BY id LIMIT 1`,
    [pago.id, String(deuda), Number(pago.monto), ref]
  )) as any[]
  return otro || null
}

// Confirma un pago administrativo ya identificado (fiado o pedido de asesor, y entregador):
// baja el fiado y deja su abono a nombre del entregador, o marca entregado el pedido de
// asesor. También le registra la comisión de ese cobro. El pago pasa a 'vinculado'.
//
// Primero se "toma" el pago (identificado → vinculado en una sola sentencia): si dos
// personas confirman a la vez, solo una lo aplica. Bajar el fiado y crear el abono van
// en una sola sentencia (todo o nada); si esa sentencia falla, el pago vuelve a
// 'identificado' para que no quede confirmado sin haberse aplicado.
//
// forzarDuplicado: quien confirma revisó el aviso de "posible pago repetido" y declara
// que es un pago distinto. Queda anotado en las observaciones del pago.
export async function confirmarPagoAdministrativo(
  pagoId: number,
  usuario: { id: string | number; nombre: string },
  opciones: { forzarDuplicado?: boolean } = {}
): Promise<Resultado> {
  const sql = getDB()

  const [pago] = (await sql`SELECT * FROM pagos_anticipados WHERE id = ${pagoId}`) as any[]
  if (!pago) return { ok: false, error: 'Pago administrativo no encontrado', status: 404 }
  if (pago.estado === 'vinculado') return { ok: false, error: 'Este pago ya fue confirmado', status: 409 }
  if (pago.estado !== 'identificado' || !(pago.tipo === 'fiado' ? pago.fiado_id : pago.pedido_id)) {
    return { ok: false, error: 'Primero identifique a qué fiado o pedido corresponde', status: 400 }
  }

  const monto = Number(pago.monto) || 0
  const esEfectivo = pago.medio_pago === 'Efectivo'
  const efectivo = esEfectivo ? monto : 0
  const nequi = esEfectivo ? 0 : monto

  // A quién le suma el cobro (Resumen y comisión) es aparte de bajar el saldo: si no se
  // eligió, le suma a quien tiene el fiado, o al asesor del pedido.
  let entregador = String(pago.entregador_vinculado || '').trim()
  if (!entregador && pago.tipo === 'fiado') {
    const [f] = (await sql`SELECT COALESCE(NULLIF(entregador_asignado, ''), entregador) AS e FROM fiados WHERE id = ${Number(pago.fiado_id)}`) as any[]
    entregador = String(f?.e || '').trim()
  } else if (!entregador && pago.tipo === 'pedido_asesor') {
    const [p] = (await sql`SELECT asesor_manual AS e FROM pedidos WHERE id = ${String(pago.pedido_id)}`) as any[]
    entregador = String(p?.e || '').trim()
  }
  if (!entregador) {
    return { ok: false, error: 'No se sabe a quién le suma este cobro: elija el entregador o asesor', status: 400 }
  }
  if (!pago.entregador_vinculado) {
    await sql`UPDATE pagos_anticipados SET entregador_vinculado = ${entregador} WHERE id = ${pagoId}`
  }

  if (!opciones.forzarDuplicado) {
    const otro = await buscarPosiblePagoRepetido(pago)
    if (otro) {
      return {
        ok: false,
        codigo: 'posible_duplicado',
        error: `Posible pago repetido: ya hay otro pago de ${formatoPesos(Number(otro.monto))} a la misma deuda con la referencia ${otro.referencia} (${otro.estado === 'vinculado' ? 'ya confirmado' : 'registrado antes'}). Verifique en el extracto; si es un pago distinto, confírmelo indicándolo.`,
        status: 409,
      }
    }
  }

  if (pago.tipo === 'fiado') {
    const fiadoId = Number(pago.fiado_id)
    const [fiado] = (await sql`
      SELECT id, cliente, saldo_pendiente, estado FROM fiados
      WHERE id = ${fiadoId} AND (eliminado IS NULL OR eliminado = false)
    `) as any[]
    if (!fiado) return { ok: false, error: 'El fiado de este pago ya no existe', status: 409 }
    if (!['pendiente', 'abono_parcial'].includes(fiado.estado)) {
      return { ok: false, error: `El fiado de ${fiado.cliente} ya está pagado: no se aplicó el pago`, status: 409 }
    }
    // Hasta $1.000 de más es redondeo de la factura (el pago cierra el fiado); más que eso
    // es un sobrepago real: mismo límite que usaba el cuadre de caja.
    if (monto > Number(fiado.saldo_pendiente) + 1000) {
      return { ok: false, error: `El pago excede el saldo del fiado de ${fiado.cliente}: ajústelo o pártalo`, status: 409 }
    }
    // Si el entregador ya registró en ruta un cobro igual de este fiado (y aún no se
    // cuadró), puede ser el mismo pago anotado dos veces. No se adivina: se avisa.
    const [igual] = (await sql`
      SELECT id, fecha_abono, entregador_cobro FROM abonos_fiados
      WHERE pedido_id = ${String(fiadoId)}
        AND monto_abono = ${efectivo}
        AND monto_nequi = ${nequi}
        AND planilla_cobro_id IS NULL
        AND COALESCE(observaciones, '') <> ${OBSERVACION_PAGO_ADMINISTRATIVO_DIRECTO}
      LIMIT 1
    `) as any[]
    if (igual) {
      return {
        ok: false,
        error: `${igual.entregador_cobro || 'El entregador'} ya registró en ruta un cobro igual de este fiado, aún sin cuadrar. Si es el mismo pago, no lo confirme aquí: se cuadra con el entregador.`,
        status: 409,
      }
    }
  }

  const tomado = (await sql`
    UPDATE pagos_anticipados SET
      estado        = 'vinculado',
      vinculado_en  = NOW(),
      vinculado_por = ${usuario.nombre}
    WHERE id = ${pagoId} AND estado = 'identificado'
    RETURNING id
  `) as any[]
  if (tomado.length === 0) return { ok: false, error: 'Este pago ya fue confirmado', status: 409 }

  const devolverAIdentificado = () =>
    sql`UPDATE pagos_anticipados SET estado = 'identificado', vinculado_en = NULL, vinculado_por = NULL WHERE id = ${pagoId}`

  try {
    if (pago.tipo === 'fiado') {
      const aplicado = (await sql`
        WITH upd AS (
          UPDATE fiados SET
            monto_pagado    = COALESCE(monto_pagado, 0) + ${monto}::numeric,
            saldo_pendiente = CASE WHEN saldo_pendiente - ${monto}::numeric < 1 THEN 0
                                   ELSE ROUND((saldo_pendiente - ${monto}::numeric)::numeric, 2) END,
            estado          = CASE WHEN saldo_pendiente - ${monto}::numeric < 1 THEN 'pagado_completo'
                                   ELSE 'abono_parcial' END,
            updated_at      = NOW()
          WHERE id = ${Number(pago.fiado_id)}
            AND (eliminado IS NULL OR eliminado = false)
            AND estado IN ('pendiente', 'abono_parcial')
          RETURNING id
        )
        INSERT INTO abonos_fiados (
          pedido_id, monto_abono, monto_nequi, metodo_pago, referencia_pago,
          fecha_abono, observaciones, registrado_por, entregador_cobro, origen_tabla, created_at
        )
        SELECT upd.id::text, ${efectivo}::numeric, ${nequi}::numeric, ${esEfectivo ? 'efectivo' : 'nequi'}::text,
               ${pago.referencia || null}::text, NOW(), ${OBSERVACION_PAGO_ADMINISTRATIVO_DIRECTO}::text,
               ${String(usuario.id)}::varchar, ${entregador}::varchar, 'fiados', NOW()
        FROM upd
        RETURNING id
      `) as any[]
      if (aplicado.length === 0) {
        // El fiado cambió entre la revisión y ahora: el pago vuelve a quedar identificado.
        await devolverAIdentificado()
        return { ok: false, error: 'El fiado cambió mientras se confirmaba. Revíselo e intente de nuevo.', status: 409 }
      }
    } else if (pago.tipo === 'pedido_asesor') {
      await sql`UPDATE pedidos SET estado = 'entregado', updated_at = NOW() WHERE id = ${String(pago.pedido_id)}`
    }
  } catch (error) {
    // Nada se aplicó (la sentencia es todo o nada): el pago no puede quedar confirmado.
    await devolverAIdentificado()
    const msg = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      error: /duplicate key|unique/i.test(msg)
        ? 'Esa referencia ya está registrada en un abono de este mismo fiado. Verifique el comprobante.'
        : `No se pudo aplicar el pago: ${msg}`,
      status: 409,
    }
  }

  if (opciones.forzarDuplicado) {
    await sql`
      UPDATE pagos_anticipados
      SET observaciones = TRIM(COALESCE(observaciones, '') || ' ' || ${`[Confirmado como pago distinto (no repetido) por ${usuario.nombre}]`})
      WHERE id = ${pagoId}
    `
  }

  // Comisión del cobro: el pago administrativo ya no pasa por el cuadre de caja, así que
  // su comisión se registra aquí, a nombre del entregador, el día que se confirma.
  // Los asesores (Harold, Jensi, Edwin…) no tienen porcentaje configurado: el cobro les
  // suma en el Resumen, pero no generan comisión.
  const [config] = (await sql`
    SELECT porcentaje_comision FROM comisiones_config
    WHERE entregador = ${entregador} AND activo = true
    LIMIT 1
  `) as any[]
  if (!config) {
    return { ok: true, mensaje: `Pago confirmado y aplicado — cuenta como cobro de ${entregador} (sin comisión)` }
  }
  try {
    const porcentaje = Number(config.porcentaje_comision)
    await sql`
      INSERT INTO comisiones (
        entregador, fecha, planilla_id,
        total_entregas_efectivas, total_devoluciones,
        base_comisionable, porcentaje_aplicado, monto_comision,
        estado, cuadre_agrupado_id
      ) VALUES (
        ${entregador}, (NOW() AT TIME ZONE 'America/Bogota')::date, NULL,
        ${monto}, 0,
        ${monto}, ${porcentaje}, ${Math.round(monto * (porcentaje / 100) * 100) / 100},
        'pendiente', NULL
      )
    `
  } catch (error) {
    // El pago ya quedó bien aplicado; solo falló registrar la comisión.
    console.error('[PAGO ADMINISTRATIVO] No se registró la comisión:', error)
    return {
      ok: true,
      mensaje: `Pago confirmado y aplicado — cuenta como cobro de ${entregador}`,
      aviso: 'No se pudo registrar la comisión de este cobro: revísela en Comisiones.',
    }
  }

  return { ok: true, mensaje: `Pago confirmado y aplicado — cuenta como cobro y comisión de ${entregador}` }
}

function formatoPesos(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO')
}
