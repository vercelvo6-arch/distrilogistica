import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fiados/editar
// Corrige el valor de una factura fiada (monto mal digitado, error de importación,
// etc.) — recalcula el saldo pendiente conservando lo que ya se abonó, sin tocar
// los abonos ya registrados. Igual que eliminar, un fiado puede venir de la tabla
// "pedidos" o de la tabla "fiados" según su origen.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden editar el valor de una factura' }, { status: 403 })
    }

    const body = await request.json()
    const { fiadoId, pedidoId, nuevoTotal } = body
    const nuevoTotalNum = Number(nuevoTotal)

    if (!fiadoId && !pedidoId) {
      return NextResponse.json({ error: 'Se requiere fiadoId o pedidoId' }, { status: 400 })
    }
    if (!nuevoTotalNum || nuevoTotalNum <= 0) {
      return NextResponse.json({ error: 'El nuevo valor debe ser mayor a 0' }, { status: 400 })
    }

    const sql = getDB()

    if (fiadoId) {
      const idNum = Number(fiadoId)
      if (!idNum || isNaN(idNum)) {
        return NextResponse.json({ error: 'fiadoId inválido' }, { status: 400 })
      }

      const [fiado] = await sql`
        SELECT id, monto_total, monto_pagado, eliminado FROM fiados WHERE id = ${idNum}
      `
      if (!fiado) {
        return NextResponse.json({ error: 'Fiado no encontrado' }, { status: 404 })
      }
      if (fiado.eliminado === true) {
        return NextResponse.json({ error: 'Este fiado fue eliminado' }, { status: 400 })
      }

      const montoPagado = Number(fiado.monto_pagado || 0)
      if (nuevoTotalNum < montoPagado) {
        return NextResponse.json(
          { error: `El nuevo valor ($${nuevoTotalNum.toLocaleString('es-CO')}) no puede ser menor a lo ya abonado ($${montoPagado.toLocaleString('es-CO')})` },
          { status: 400 }
        )
      }

      const nuevoSaldo = Math.round((nuevoTotalNum - montoPagado) * 100) / 100
      const nuevoEstado = nuevoSaldo <= 0 ? 'pagado_completo' : montoPagado > 0 ? 'abono_parcial' : 'pendiente'

      await sql`
        UPDATE fiados SET
          monto_total = ${nuevoTotalNum},
          saldo_pendiente = ${nuevoSaldo},
          estado = ${nuevoEstado},
          updated_at = NOW()
        WHERE id = ${idNum}
      `

      return NextResponse.json({ success: true, mensaje: 'Valor de la factura corregido correctamente' })
    }

    if (pedidoId) {
      const [pedido] = await sql`
        SELECT id, total, monto_pagado FROM pedidos WHERE id = ${pedidoId}
      `
      if (!pedido) {
        return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
      }

      const montoPagado = Number(pedido.monto_pagado || 0)
      if (nuevoTotalNum < montoPagado) {
        return NextResponse.json(
          { error: `El nuevo valor ($${nuevoTotalNum.toLocaleString('es-CO')}) no puede ser menor a lo ya abonado ($${montoPagado.toLocaleString('es-CO')})` },
          { status: 400 }
        )
      }

      const nuevoSaldo = Math.round((nuevoTotalNum - montoPagado) * 100) / 100

      await sql`
        UPDATE pedidos SET
          total = ${nuevoTotalNum},
          saldo_pendiente = ${nuevoSaldo},
          updated_at = NOW()
        WHERE id = ${pedidoId}
      `

      return NextResponse.json({ success: true, mensaje: 'Valor de la factura corregido correctamente' })
    }
  } catch (error) {
    return handleDBError(error, 'FIADOS_EDITAR')
  }
}
