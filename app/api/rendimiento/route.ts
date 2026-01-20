import { NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || !['administrador', 'caja'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const fechaInicio = searchParams.get('fechaInicio') || '2026-01-01'
    const fechaFin = searchParams.get('fechaFin') || '2026-01-31'

    const sql = getDB()

    // Obtener datos agregados por entregador
    const rendimientos = await sql`
      SELECT 
        p.entregador,
        COUNT(DISTINCT p.id) as total_rutas,
        COALESCE(SUM(p.total_cargue), 0) as total_cargue,
        COALESCE(SUM(p.total_entregado), 0) as total_entregado,
        COALESCE(SUM(p.total_devolucion), 0) as total_devoluciones,
        COALESCE(SUM(p.total_repaso), 0) as total_repasos
      FROM planillas p
      WHERE p.fecha >= ${fechaInicio}
        AND p.fecha <= ${fechaFin}
        AND p.estado IN ('completado', 'alistado')
      GROUP BY p.entregador
      ORDER BY p.entregador
    `

    const rendimientosConPorcentaje = rendimientos.map(r => {
      const totalCargue = Number(r.total_cargue) || 0
      const totalDevoluciones = Number(r.total_devoluciones) || 0
      const porcentajeDevolucion = totalCargue > 0 
        ? (totalDevoluciones / totalCargue) * 100 
        : 0

      return {
        entregador: r.entregador,
        totalRutas: Number(r.total_rutas),
        totalCargue,
        totalEntregado: Number(r.total_entregado) || 0,
        totalDevoluciones,
        totalRepasos: Number(r.total_repasos) || 0,
        porcentajeDevolucion: Math.round(porcentajeDevolucion * 100) / 100,
        calificaIncentivo: porcentajeDevolucion < 5,
        periodoInicio: fechaInicio,
        periodoFin: fechaFin
      }
    })

    return NextResponse.json({ rendimientos: rendimientosConPorcentaje })

  } catch (error) {
    console.error('[API rendimiento] Error:', error)
    return NextResponse.json(
      { error: 'Error al obtener rendimientos' },
      { status: 500 }
    )
  }
}
