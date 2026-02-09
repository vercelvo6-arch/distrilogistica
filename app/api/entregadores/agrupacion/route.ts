import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { handleDBError } from '@/lib/db-helpers'

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const sql = getDB()
    const entregador = session.user.nombre

    console.log('[AGRUPACION] Obteniendo planillas de:', entregador)

    // Obtener planillas agrupadas por fecha
    const agrupacion = await sql`
      SELECT 
        fecha,
        COUNT(*) as total_rutas,
        array_agg(id) as planillas_ids,
        array_agg(tipo_ruta) as rutas_nombres,
        SUM(total_cargue) as total_cargue,
        SUM(total_entregado) as total_entregado,
        SUM(total_fiado) as total_fiado,
        SUM(total_repaso) as total_repaso,
        SUM(total_devolucion) as total_devoluciones,
        SUM(agotados) as total_agotados
      FROM planillas
      WHERE entregador = ${entregador}
        AND estado = 'alistado'
        AND cuadrado_en_caja = false
      GROUP BY fecha
      ORDER BY fecha DESC
    `

    console.log('[AGRUPACION] ✓ Agrupaciones encontradas:', agrupacion.length)

    return NextResponse.json({
      success: true,
      agrupacion: agrupacion.map(a => ({
        fecha: a.fecha,
        totalRutas: Number(a.total_rutas),
        planillasIds: a.planillas_ids,
        rutasNombres: a.rutas_nombres,
        totales: {
          cargue: Number(a.total_cargue) || 0,
          entregado: Number(a.total_entregado) || 0,
          fiado: Number(a.total_fiado) || 0,
          repasos: Number(a.total_repaso) || 0,
          devoluciones: Number(a.total_devoluciones) || 0,
          agotados: Number(a.total_agotados) || 0
        }
      }))
    })

  } catch (error) {
    return handleDBError(error, 'AGRUPACION GET')
  }
}
