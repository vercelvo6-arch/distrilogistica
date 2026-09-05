import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar abonos' }, { status: 403 })
    }

    const body = await request.json()
    const abonoId = Number(body?.abonoId)

    if (!abonoId || isNaN(abonoId)) {
      return NextResponse.json({ error: 'abonoId inválido' }, { status: 400 })
    }

    const sql = getDB()

    const [abono] = await sql`
      SELECT id, pedido_id, monto_abono, monto_nequi, origen_tabla, referencia_pago
      FROM abonos_fiados
      WHERE id = ${abonoId}
    `

    if (!abono) {
      return NextResponse.json({ error: 'Abono no encontrado (puede que ya haya sido eliminado)' }, { status: 404 })
    }

    const totalAbono = Number(abono.monto_abono || 0) + Number(abono.monto_nequi || 0)
    const esPedido = abono.origen_tabla === 'pedidos'

    if (esPedido) {
      const pedidoId = String(abono.pedido_id)

      const [pedido] = await sql`
        SELECT id, total, monto_pagado, saldo_pendiente, estado
        FROM pedidos
        WHERE id = ${pedidoId}
      `

      if (pedido) {
        const montoPagadoActual = Number(pedido.monto_pagado || 0)
        const saldoActual       = Number(pedido.saldo_pendiente ?? pedido.total)
        const totalPedido       = Number(pedido.total)

        const nuevoMontoPagado = Math.max(0, Math.round((montoPagadoActual - totalAbono) * 100) / 100)
        const nuevoSaldo       = Math.min(totalPedido, Math.round((saldoActual + totalAbono) * 100) / 100)
        const nuevoEstado      = pedido.estado === 'pagado' ? 'fiado' : pedido.estado

        await sql`
          UPDATE pedidos SET
            monto_pagado    = ${nuevoMontoPagado},
            saldo_pendiente = ${nuevoSaldo},
            estado          = ${nuevoEstado},
            updated_at      = NOW()
          WHERE id = ${pedidoId}
        `
      }
    } else {
      const fiadoId = Number(abono.pedido_id)

      const [fiado] = await sql`
        SELECT id, monto_total, monto_pagado, saldo_pendiente, estado
        FROM fiados
        WHERE id = ${fiadoId}
      `

      if (fiado) {
        const montoPagadoActual = Number(fiado.monto_pagado || 0)
        const saldoActual       = Number(fiado.saldo_pendiente)
        const montoTotal        = Number(fiado.monto_total)

        const nuevoMontoPagado = Math.max(0, Math.round((montoPagadoActual - totalAbono) * 100) / 100)
        const nuevoSaldo       = Math.min(montoTotal, Math.round((saldoActual + totalAbono) * 100) / 100)
        const nuevoEstado      = nuevoMontoPagado <= 0 ? 'pendiente' : 'abono_parcial'

        await sql`
          UPDATE fiados SET
            monto_pagado        = ${nuevoMontoPagado},
            saldo_pendiente     = ${nuevoSaldo},
            estado              = ${nuevoEstado},
            fecha_pago_completo = NULL,
            updated_at          = NOW()
          WHERE id = ${fiadoId}
        `
      }
    }

    await sql`DELETE FROM abonos_fiados WHERE id = ${abonoId}`

    console.log(`[ABONO ELIMINADO] abono #${abonoId} (pedido_id=${abono.pedido_id}, monto=${totalAbono}) eliminado por ${session.user.nombre}`)

    return NextResponse.json({
      success: true,
      mensaje: `Abono de $${totalAbono.toLocaleString('es-CO')} eliminado y saldo restablecido correctamente`,
    })

  } catch (error) {
    return handleDBError(error, 'ELIMINAR_ABONO')
  }
}
