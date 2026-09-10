import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'
import { buscarReferenciasUsadas } from '@/lib/validar-referencia'

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/fiados/abonos-entregador/[id]
// Corrige un cobro que el entregador ya registró en ruta, ANTES de cuadrarlo —
// caja lo detecta mientras arma el cuadre (medio de pago mal marcado, referencia
// que en realidad era efectivo, etc.) y lo arregla ahí mismo, sin eliminar nada
// ni depender de un administrador. Solo se puede corregir mientras sigue
// pendiente (planilla_cobro_id IS NULL) -- una vez cuadrado ya es parte de un
// cierre contable cerrado.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const abonoId = Number(params.id)
    if (!abonoId) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }

    const body = await request.json()
    const montoEfectivo = Number(body.montoEfectivo) || 0
    const montoNequi = Number(body.montoNequi) || 0
    const referenciaPago = String(body.referenciaPago || '').trim() || null

    if (montoEfectivo + montoNequi <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }
    if (montoNequi > 0 && !referenciaPago) {
      return NextResponse.json({ error: 'Todo pago electrónico necesita número de referencia' }, { status: 400 })
    }

    const sql = getDB()

    const [abono] = await sql`
      SELECT id, pedido_id, monto_abono, monto_nequi, origen_tabla, planilla_cobro_id
      FROM abonos_fiados
      WHERE id = ${abonoId}
    `
    if (!abono) {
      return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 })
    }
    if (abono.planilla_cobro_id) {
      return NextResponse.json(
        { error: 'Este cobro ya quedó cuadrado en un cierre anterior y no se puede corregir desde aquí' },
        { status: 409 }
      )
    }

    // ✅ Antifraude: la referencia nueva no puede pertenecer a otro pago real --
    // excluyendo este mismo abono, para no autobloquear la correccion.
    if (referenciaPago) {
      const yaUsada = await buscarReferenciasUsadas([referenciaPago], { excluirAbonoFiadoIds: [abonoId] })
      if (yaUsada.length > 0) {
        return NextResponse.json(
          { error: `La referencia ${referenciaPago} ya está registrada en otro pago. Verifique el comprobante.` },
          { status: 409 }
        )
      }
    }

    const totalAnterior = Number(abono.monto_abono || 0) + Number(abono.monto_nequi || 0)
    const totalNuevo = montoEfectivo + montoNequi
    const delta = totalNuevo - totalAnterior
    const metodoPago = montoNequi > 0 && montoEfectivo > 0 ? 'mixto' : montoNequi > 0 ? 'nequi' : 'efectivo'

    if (delta !== 0) {
      if (abono.origen_tabla === 'pedidos') {
        const pedidoId = String(abono.pedido_id)
        const [pedido] = await sql`SELECT id, total, monto_pagado, saldo_pendiente FROM pedidos WHERE id = ${pedidoId}`
        if (pedido) {
          const nuevoMontoPagado = Math.max(0, Math.round((Number(pedido.monto_pagado || 0) + delta) * 100) / 100)
          const nuevoSaldo = Math.max(0, Math.round((Number(pedido.saldo_pendiente ?? pedido.total) - delta) * 100) / 100)
          await sql`
            UPDATE pedidos SET monto_pagado = ${nuevoMontoPagado}, saldo_pendiente = ${nuevoSaldo}, updated_at = NOW()
            WHERE id = ${pedidoId}
          `
        }
      } else {
        const fiadoId = Number(abono.pedido_id)
        const [fiado] = await sql`SELECT id, monto_total, monto_pagado, saldo_pendiente FROM fiados WHERE id = ${fiadoId}`
        if (fiado) {
          const nuevoMontoPagado = Math.max(0, Math.round((Number(fiado.monto_pagado || 0) + delta) * 100) / 100)
          const nuevoSaldo = Math.max(0, Math.round((Number(fiado.saldo_pendiente) - delta) * 100) / 100)
          const nuevoEstado = nuevoSaldo <= 0 ? 'pagado_completo' : 'abono_parcial'
          await sql`
            UPDATE fiados SET
              monto_pagado = ${nuevoMontoPagado}, saldo_pendiente = ${nuevoSaldo}, estado = ${nuevoEstado},
              updated_at = NOW()
            WHERE id = ${fiadoId}
          `
        }
      }
    }

    await sql`
      UPDATE abonos_fiados SET
        monto_abono = ${montoEfectivo},
        monto_nequi = ${montoNequi},
        metodo_pago = ${metodoPago},
        referencia_pago = ${referenciaPago},
        observaciones = COALESCE(observaciones || ' | ', '') || 'Corregido en caja por ' || ${session.user.nombre} || ' el ' || NOW()::date
      WHERE id = ${abonoId}
    `

    return NextResponse.json({ success: true, mensaje: 'Cobro corregido correctamente' })
  } catch (error) {
    return handleDBError(error, 'ABONOS_ENTREGADOR_PATCH')
  }
}
