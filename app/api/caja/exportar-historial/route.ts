import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Fechas requeridas' }, { status: 400 })
    }

    const sql = getDB()

    // Obtener cuadres individuales
    const individuales = await sql`
      SELECT 
        r.fecha_recepcion,
        p.entregador,
        p.tipo_ruta as ruta,
        p.total_cargue as cargue,
        r.efectivo_recibido as entregado,
        0 as fiado,
        0 as devoluciones,
        0 as repasos,
        COALESCE(r.agotados, 0) as agotados,
        COALESCE(r.descuento, 0) as descuentos,
        0 as errores_facturacion,
        COALESCE(c.monto_comision, 0) as comision
      FROM recepciones_caja r
      JOIN planillas p ON r.planilla_id = p.id
      LEFT JOIN comisiones c ON c.planilla_id = p.id
      WHERE DATE(r.fecha_recepcion) >= ${desde}
        AND DATE(r.fecha_recepcion) <= ${hasta}
      ORDER BY r.fecha_recepcion DESC
    `

    // Obtener cuadres agrupados
    const agrupados = await sql`
      SELECT 
        c.fecha_cuadre as fecha_recepcion,
        c.entregador,
        CASE 
          WHEN array_length(c.planillas_ids, 1) = 1 THEN (
            SELECT tipo_ruta FROM planillas WHERE id = c.planillas_ids[1]
          )
          ELSE array_length(c.planillas_ids, 1)::text || ' rutas'
        END as ruta,
        (
          SELECT COALESCE(SUM(total_cargue), 0)
          FROM planillas 
          WHERE id = ANY(c.planillas_ids)
        ) as cargue,
        c.total_efectivo as entregado,
        COALESCE(c.fiado, 0) as fiado,
        COALESCE(c.devoluciones, 0) as devoluciones,
        COALESCE(c.repasos, 0) as repasos,
        COALESCE(c.agotados, 0) as agotados,
        COALESCE(c.descuento, 0) as descuentos,
        COALESCE(c.errores_facturacion, 0) as errores_facturacion,
        COALESCE(com.monto_comision, 0) as comision
      FROM cuadres_caja c
      LEFT JOIN comisiones com ON com.cuadre_agrupado_id = c.id
      WHERE DATE(c.fecha_cuadre) >= ${desde}
        AND DATE(c.fecha_cuadre) <= ${hasta}
      ORDER BY c.fecha_cuadre DESC
    `

    // Combinar y ordenar por fecha
    const todos = [...individuales, ...agrupados].sort(
      (a, b) => new Date(b.fecha_recepcion).getTime() - new Date(a.fecha_recepcion).getTime()
    )

    // Generar CSV
    const headers = [
      'Fecha',
      'Entregador',
      'Ruta',
      'Cargue',
      'Entregado',
      'Fiado',
      'Devoluciones',
      'Repasos',
      'Agotados',
      'Descuentos',
      'Errores Fact.',
      'Comisión'
    ]

    let csv = headers.join(',') + '\n'

    // Calcular totales
    let totales = {
      cargue: 0,
      entregado: 0,
      fiado: 0,
      devoluciones: 0,
      repasos: 0,
      agotados: 0,
      descuentos: 0,
      errores_facturacion: 0,
      comision: 0
    }

    todos.forEach((row: any) => {
      const fecha = new Date(row.fecha_recepcion).toLocaleDateString('es-CO')
      const cargue = Number(row.cargue) || 0
      const entregado = Number(row.entregado) || 0
      const fiado = Number(row.fiado) || 0
      const devoluciones = Number(row.devoluciones) || 0
      const repasos = Number(row.repasos) || 0
      const agotados = Number(row.agotados) || 0
      const descuentos = Number(row.descuentos) || 0
      const errores = Number(row.errores_facturacion) || 0
      const comision = Number(row.comision) || 0

      totales.cargue += cargue
      totales.entregado += entregado
      totales.fiado += fiado
      totales.devoluciones += devoluciones
      totales.repasos += repasos
      totales.agotados += agotados
      totales.descuentos += descuentos
      totales.errores_facturacion += errores
      totales.comision += comision

      csv += [
        fecha,
        row.entregador,
        row.ruta,
        cargue,
        entregado,
        fiado,
        devoluciones,
        repasos,
        agotados,
        descuentos,
        errores,
        comision
      ].join(',') + '\n'
    })

    // Agregar fila de totales
    csv += '\n'
    csv += [
      'TOTALES',
      '',
      '',
      totales.cargue,
      totales.entregado,
      totales.fiado,
      totales.devoluciones,
      totales.repasos,
      totales.agotados,
      totales.descuentos,
      totales.errores_facturacion,
      totales.comision
    ].join(',') + '\n'

    // Retornar CSV con BOM para que Excel lo abra correctamente
    const bom = '\uFEFF'
    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="seguimiento_entregas_${desde}_${hasta}.csv"`
      }
    })

  } catch (error) {
    console.error('[API exportar-historial] Error:', error)
    return NextResponse.json(
      { error: 'Error al exportar historial' },
      { status: 500 }
    )
  }
}
