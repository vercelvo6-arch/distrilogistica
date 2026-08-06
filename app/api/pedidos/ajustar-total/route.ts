import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (session.user.rol !== 'caja') return NextResponse.json({ error: 'Solo caja puede ajustar valores' }, { status: 403 })

    const { pedidoId, nuevoTotal } = await request.json()

    if (!pedidoId || nuevoTotal === undefined || nuevoTotal === null) {
      return NextResponse.json({ error: 'pedidoId y nuevoTotal son requeridos' }, { status: 400 })
    }

    const totalNum = Number(nuevoTotal)
    if (isNaN(totalNum) || totalNum < 0) {
      return NextResponse.json({ error: 'El valor debe ser un número positivo' }, { status: 400 })
    }

    const sql = getDB()

    const [pedido] = await sql`SELECT id, total, planilla_id FROM pedidos WHERE id = ${pedidoId}`
    if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    // Actualizar el total del pedido
    await sql`UPDATE pedidos SET total = ${totalNum}, updated_at = NOW() WHERE id = ${pedidoId}`

    // Recalcular total_cargue de la planilla
    await sql`
      UPDATE planillas SET
        total_cargue = (
          SELECT COALESCE(SUM(total), 0) FROM pedidos WHERE planilla_id = ${pedido.planilla_id}
        ),
        updated_at = NOW()
      WHERE id = ${pedido.planilla_id}
    `

    console.log(`[AJUSTE TOTAL] Pedido ${pedidoId}: ${pedido.total} → ${totalNum} por ${session.user.email}`)

    return NextResponse.json({ success: true, totalAnterior: pedido.total, totalNuevo: totalNum })

  } catch (error) {
    console.error('[AJUSTE TOTAL] ERROR:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error al ajustar' }, { status: 500 })
  }
}
