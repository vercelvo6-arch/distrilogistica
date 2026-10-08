import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

// Mismo cliente aunque cambien mayúsculas, tildes, espacios o signos.
const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// POST /api/fiados/aplicar-pago-contado
//
// Caso: un pago de un cliente ya entró (y se contó) en un cuadre CERRADO como
// "consignación" con el nombre del cliente, pero nunca se aplicó a su fiado — por
// eso el fiado sigue vivo y, al intentar cobrarlo, el antifraude bloquea la
// referencia por "ya usada". Aquí se aplica ese pago al fiado del MISMO cliente
// SIN volver a contar el dinero en ningún cuadre (el efectivo ya entró una vez).
//
// El abono queda ligado al cuadre que ya contó el dinero (planilla_cobro_id), así que
// no reaparece como "pendiente de cuadrar". Un mismo comprobante puede repartirse en
// varios fiados del cliente, hasta agotar lo que quede sin aplicar.
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!['administrador', 'caja'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { fiadoId, referencia } = await request.json()
    const ref = String(referencia || '').trim()
    if (!fiadoId || !ref) {
      return NextResponse.json({ error: 'fiadoId y referencia son requeridos' }, { status: 400 })
    }

    const sql = getDB()

    const [fiado] = await sql`
      SELECT id, cliente, saldo_pendiente, estado
      FROM fiados
      WHERE id = ${Number(fiadoId)} AND COALESCE(eliminado, false) = false
    `
    if (!fiado) {
      return NextResponse.json({ error: 'Fiado no encontrado' }, { status: 404 })
    }
    if (!['pendiente', 'abono_parcial'].includes(fiado.estado) || Number(fiado.saldo_pendiente) <= 0) {
      return NextResponse.json({ error: 'Este fiado ya está pagado' }, { status: 409 })
    }

    // Dónde quedó contado ese comprobante: consignaciones guardadas en cuadres cerrados.
    const origenes = await sql`
      SELECT cc.id AS cuadre_id, cc.entregador,
             e->>'cliente' AS cliente, e->>'banco' AS banco, e->>'fecha' AS fecha,
             NULLIF(e->>'monto', '')::numeric AS monto
      FROM cuadres_caja cc,
      jsonb_array_elements(
        CASE WHEN jsonb_typeof(cc.consignaciones) = 'array' THEN cc.consignaciones ELSE '[]'::jsonb END
      ) AS e
      WHERE LOWER(e->>'numero') = LOWER(${ref})
    `
    if (origenes.length === 0) {
      return NextResponse.json({ error: 'Esa referencia no está contada en ningún cuadre cerrado' }, { status: 404 })
    }
    if (origenes.length > 1) {
      return NextResponse.json(
        { error: 'Esa referencia aparece más de una vez en cuadres cerrados; hay que revisarla a mano' },
        { status: 409 }
      )
    }
    const origen = origenes[0]

    // Si además está ligada a un pedido registrado en ruta o a un pago anticipado, el
    // dinero tiene otro destino: no se reparte desde aquí.
    const [otraFuente] = await sql`
      SELECT 1 AS existe FROM consignaciones_pedido WHERE LOWER(numero) = LOWER(${ref})
      UNION ALL
      SELECT 1 FROM pagos_anticipados WHERE LOWER(referencia) = LOWER(${ref})
      LIMIT 1
    `
    if (otraFuente) {
      return NextResponse.json(
        { error: 'Ese comprobante está ligado a un pedido o a un pago anticipado; no se puede aplicar a un fiado desde aquí' },
        { status: 409 }
      )
    }

    // Antifraude: solo se aplica a fiados del MISMO cliente que lo pagó.
    if (!normalizar(origen.cliente) || normalizar(origen.cliente) !== normalizar(fiado.cliente)) {
      return NextResponse.json(
        { error: `Ese comprobante se contó para "${origen.cliente || 'otro cliente'}", no para ${fiado.cliente}` },
        { status: 409 }
      )
    }

    const [yaAplicadoAqui] = await sql`
      SELECT id FROM abonos_fiados
      WHERE pedido_id = ${String(fiado.id)} AND LOWER(referencia_pago) = LOWER(${ref})
      LIMIT 1
    `
    if (yaAplicadoAqui) {
      return NextResponse.json({ error: 'Ese comprobante ya se aplicó a este fiado' }, { status: 409 })
    }

    const [{ aplicado }] = await sql`
      SELECT COALESCE(SUM(COALESCE(monto_abono, 0) + COALESCE(monto_nequi, 0)), 0) AS aplicado
      FROM abonos_fiados WHERE LOWER(referencia_pago) = LOWER(${ref})
    `
    const restante = Number(origen.monto) - Number(aplicado)
    if (restante < 1) {
      return NextResponse.json({ error: 'Ese comprobante ya se aplicó por completo' }, { status: 409 })
    }

    const saldo = Number(fiado.saldo_pendiente)
    const montoAplicar = Math.round(Math.min(restante, saldo) * 100) / 100
    const fechaPago = String(origen.fecha || '').slice(0, 10)

    // Una sola sentencia: descuenta el saldo y crea el abono, o no hace ninguna de las dos.
    // El índice único (referencia_pago, pedido_id) frena un doble clic o dos pantallas a la vez.
    let resultado: any[]
    try {
      resultado = (await sql`
        WITH upd AS (
          UPDATE fiados SET
            monto_pagado        = monto_pagado + ${montoAplicar}::numeric,
            saldo_pendiente     = CASE WHEN saldo_pendiente - ${montoAplicar}::numeric < 1 THEN 0 ELSE saldo_pendiente - ${montoAplicar}::numeric END,
            estado              = CASE WHEN saldo_pendiente - ${montoAplicar}::numeric < 1 THEN 'pagado_completo' ELSE 'abono_parcial' END,
            fecha_pago_completo = CASE WHEN saldo_pendiente - ${montoAplicar}::numeric < 1 THEN NOW() ELSE fecha_pago_completo END,
            cobrado_por         = ${String(session.user.id)},
            updated_at          = NOW()
          WHERE id = ${Number(fiado.id)}
            AND COALESCE(eliminado, false) = false
            AND estado IN ('pendiente', 'abono_parcial')
            AND saldo_pendiente >= ${montoAplicar}::numeric - 1
          RETURNING id, saldo_pendiente, estado
        ),
        nuevo AS (
          INSERT INTO abonos_fiados (
            pedido_id, monto_abono, monto_nequi, metodo_pago, referencia_pago,
            fecha_abono, observaciones, registrado_por, entregador_cobro,
            planilla_cobro_id, origen_tabla, medio_pago_detalle, created_at
          )
          SELECT
            ${String(fiado.id)}::text, 0, ${montoAplicar}::numeric, 'nequi', ${ref}::text,
            COALESCE(NULLIF(${fechaPago}::text, '')::timestamp, NOW()),
            ${`Pago ya contado en el cuadre #${origen.cuadre_id} como consignación — aplicado al fiado sin volver a contar el dinero`}::text,
            ${String(session.user.id)}::varchar, ${origen.entregador || null}::varchar,
            ${Number(origen.cuadre_id)}::int, 'fiados', ${origen.banco || null}::varchar, NOW()
          FROM upd
          RETURNING id
        )
        SELECT upd.saldo_pendiente, upd.estado FROM upd JOIN nuevo ON true
      `) as any[]
    } catch (e: any) {
      if (e?.code === '23505') {
        return NextResponse.json({ error: 'Ese comprobante ya se aplicó a este fiado' }, { status: 409 })
      }
      throw e
    }

    if (resultado.length === 0) {
      return NextResponse.json(
        { error: 'El fiado cambió mientras se aplicaba (saldo o estado). Recarga e inténtalo de nuevo.' },
        { status: 409 }
      )
    }

    try {
      await sql`
        INSERT INTO audit_log (user_id, user_email, action, details)
        VALUES (
          ${String(session.user.id)}, ${session.user.email ?? null}, 'aplicar_pago_contado',
          ${JSON.stringify({ fiado_id: fiado.id, referencia: ref, monto: montoAplicar, cuadre_origen: origen.cuadre_id })}::jsonb
        )
      `
    } catch (e) {
      console.error('[APLICAR PAGO CONTADO] No se pudo registrar en audit_log:', e)
    }

    return NextResponse.json({
      success: true,
      mensaje: `Pago aplicado al fiado de ${fiado.cliente}`,
      aplicado: montoAplicar,
      saldo_pendiente: Number(resultado[0].saldo_pendiente),
      estado: resultado[0].estado,
      cuadre_origen: origen.cuadre_id,
    })
  } catch (error: any) {
    console.error('[APLICAR PAGO CONTADO] ERROR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al aplicar el pago' },
      { status: 500 }
    )
  }
}
