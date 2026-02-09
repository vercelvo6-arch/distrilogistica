import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (session.user.rol !== 'entregador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()
    const entregador = session.user.nombre

    const historial = await sql`
      SELECT 
        p.id,
        p.fecha,
        p.tipo_ruta as ruta,
        p.total_entregado,
        p.total_devolucion as total_devoluciones,
        p.fecha_cuadre_caja
      FROM planillas p
      WHERE p.entregador = ${entregador}
        AND p.estado = 'cerrado'
        AND p.cuadrado_en_caja = true
      ORDER BY p.fecha DESC
      LIMIT 30
    `

    return NextResponse.json({
      success: true,
      historial
    })

  } catch (error) {
    console.error('[API historial entregador] Error:', error)
    return NextResponse.json(
      { error: 'Error al cargar historial' },
      { status: 500 }
    )
  }
}
