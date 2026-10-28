import { getDB } from './db'

// Observación del abono que nace cuando un pago administrativo se confirma DIRECTO en
// Cuadre Administrativo (sin pasar por el cuadre de caja). Lo distingue de los cobros
// que el entregador trae a su cuadre:
//   - no se precarga en el cuadre de caja (no es plata que él traiga);
//   - no cuenta como "duplicado coherente" de un cobro posterior: ya está confirmado,
//     y un pago igual más adelante es otro pago real;
//   - el Resumen del Historial lo cuenta como cobro administrativo de ese entregador.
export const OBSERVACION_PAGO_ADMINISTRATIVO_DIRECTO = 'Pago administrativo confirmado en Cuadre Administrativo'

type Resultado = { ok: true; mensaje: string } | { ok: false; error: string; status: number }

// Confirma un pago administrativo ya identificado (fiado o pedido de asesor, y entregador):
// baja el fiado y deja su abono a nombre del entregador, o marca entregado el pedido de
// asesor. También le registra la comisión de ese cobro. El pago pasa a 'vinculado'.
//
// Primero se "toma" el pago (identificado → vinculado en una sola sentencia): si dos
// personas confirman a la vez, solo una lo aplica. Bajar el fiado y crear el abono van
// en una sola sentencia (todo o nada).
export async function confirmarPagoAdministrativo(
  pagoId: number,
  usuario: { id: string | number; nombre: string }
): Promise<Resultado> {
  const sql = getDB()

  const [pago] = (await sql`SELECT * FROM pagos_anticipados WHERE id = ${pagoId}`) as any[]
  if (!pago) return { ok: false, error: 'Pago administrativo no encontrado', status: 404 }
  if (pago.estado === 'vinculado') return { ok: false, error: 'Este pago ya fue confirmado', status: 409 }
  if (pago.estado !== 'identificado' || !pago.entregador_vinculado) {
    return { ok: false, error: 'Primero identifique a qué fiado o pedido corresponde y qué entregador', status: 400 }
  }

  const monto = Number(pago.monto) || 0
  const esEfectivo = pago.medio_pago === 'Efectivo'
  const efectivo = esEfectivo ? monto : 0
  const nequi = esEfectivo ? 0 : monto
  const entregador = String(pago.entregador_vinculado)

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
      await sql`UPDATE pagos_anticipados SET estado = 'identificado', vinculado_en = NULL, vinculado_por = NULL WHERE id = ${pagoId}`
      return { ok: false, error: 'El fiado cambió mientras se confirmaba. Revíselo e intente de nuevo.', status: 409 }
    }
  } else if (pago.tipo === 'pedido_asesor') {
    await sql`UPDATE pedidos SET estado = 'entregado', updated_at = NOW() WHERE id = ${String(pago.pedido_id)}`
  }

  // Comisión del cobro: el pago administrativo ya no pasa por el cuadre de caja, así que
  // su comisión se registra aquí, a nombre del entregador, el día que se confirma.
  const [config] = (await sql`
    SELECT porcentaje_comision FROM comisiones_config
    WHERE entregador = ${entregador} AND activo = true
    LIMIT 1
  `) as any[]
  if (config) {
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
  }

  return { ok: true, mensaje: `Pago confirmado y aplicado — cuenta como cobro de ${entregador}` }
}
