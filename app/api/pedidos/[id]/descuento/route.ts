import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'ID de pedido requerido' }, { status: 400 })
    }

    const body = await request.json()
    const { descuento, motivo } = body

    const montoDescuento = Number(descuento) || 0
    if (montoDescuento < 0) {
      return NextResponse.json({ error: 'El descuento no puede ser negativo' }, { status: 400 })
    }

    const sql = getDB()

    // Verificar que el pedido existe y obtener su total
    const [pedido] = await sql`
      SELECT id, total, descuento FROM pedidos WHERE id = ${id}
    `

    if (!pedido) {
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
    }

    if (montoDescuento > Number(pedido.total)) {
      return NextResponse.json(
        { error: `El descuento no puede superar el total del pedido (${pedido.total})` },
        { status: 400 }
      )
    }

    await sql`
      UPDATE pedidos SET
        descuento        = ${montoDescuento},
        motivo_descuento = ${motivo || null},
        updated_at       = NOW()
      WHERE id = ${id}
    `

    console.log(`[PATCH /api/pedidos/${id}/descuento] Descuento: ${montoDescuento}`)

    return NextResponse.json({
      success: true,
      pedidoId: id,
      descuento: montoDescuento,
      motivo: motivo || null,
    })

  } catch (error) {
    console.error('[PATCH pedidos descuento]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar descuento' },
      { status: 500 }
    )
  }
}
