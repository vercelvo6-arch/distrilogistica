import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin y caja pueden marcar como pagado
    if (!['administrador', 'caja'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { pedidoIds } = body

    if (!pedidoIds || !Array.isArray(pedidoIds) || pedidoIds.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere un array de pedidoIds' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Actualizar pedidos a estado "pagado"
    const result = await sql`
      UPDATE pedidos 
      SET 
        estado = 'pagado',
        updated_at = NOW()
      WHERE id = ANY(${pedidoIds})
        AND estado = 'fiado'
      RETURNING id, cliente, total
    `

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron fiados para marcar como pagados' },
        { status: 404 }
      )
    }

    console.log(`[API fiados] ${result.length} fiados marcados como pagados por ${session.user.email}`)

    return NextResponse.json({
      success: true,
      updated: result.length,
      pedidos: result
    })
  } catch (error) {
    console.error('[API fiados marcar-pagado] Error:', error)
    return NextResponse.json(
      { error: 'Error al marcar fiados como pagados', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
