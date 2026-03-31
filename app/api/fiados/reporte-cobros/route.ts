import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  console.log('\n📊 [REPORTE COBROS] ===== INICIO =====')
  
  try {
    const session = await getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['administrador', 'caja'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const entregador = searchParams.get('entregador')
    const fechaInicio = searchParams.get('fecha_inicio')
    const fechaFin = searchParams.get('fecha_fin')

    console.log('[REPORTE COBROS] 📥 Parámetros:', {
      entregador,
      fechaInicio,
      fechaFin
    })

    const sql = getDB()

    // ===================================================
    // QUERY BASE - SIN FILTROS
    // ===================================================
    let resultados

    if (!entregador && !fechaInicio && !fechaFin) {
      // Sin filtros - traer todo
      console.log('[REPORTE COBROS] 🔍 Sin filtros - trayendo todos los cobros')
      
      resultados = await sql`
        SELECT 
          a.entregador_cobro as entregador,
          DATE(a.fecha_abono) as fecha,
          COUNT(DISTINCT a.fiado_id) as total_fiados_cobrados,
          SUM(a.monto) as total_cobrado,
          json_agg(
            json_build_object(
              'fiado_id', a.fiado_id,
              'cliente', f.cliente,
              'monto', a.monto,
              'metodo_pago', a.metodo_pago,
              'hora', TO_CHAR(a.fecha_abono, 'HH24:MI'),
              'planilla_id', a.planilla_cobro_id
            ) ORDER BY a.fecha_abono
          ) as detalle_cobros
        FROM abonos_fiados a
        JOIN fiados f ON f.id = a.fiado_id
        WHERE a.entregador_cobro IS NOT NULL
        GROUP BY a.entregador_cobro, DATE(a.fecha_abono)
        ORDER BY DATE(a.fecha_abono) DESC, a.entregador_cobro
      `
    } else if (entregador && !fechaInicio && !fechaFin) {
      // Solo filtro de entregador
      console.log('[REPORTE COBROS] 🔍 Filtro: entregador =', entregador)
      
      resultados = await sql`
        SELECT 
          a.entregador_cobro as entregador,
          DATE(a.fecha_abono) as fecha,
          COUNT(DISTINCT a.fiado_id) as total_fiados_cobrados,
          SUM(a.monto) as total_cobrado,
          json_agg(
            json_build_object(
              'fiado_id', a.fiado_id,
              'cliente', f.cliente,
              'monto', a.monto,
              'metodo_pago', a.metodo_pago,
              'hora', TO_CHAR(a.fecha_abono, 'HH24:MI'),
              'planilla_id', a.planilla_cobro_id
            ) ORDER BY a.fecha_abono
          ) as detalle_cobros
        FROM abonos_fiados a
        JOIN fiados f ON f.id = a.fiado_id
        WHERE a.entregador_cobro = ${entregador}
        GROUP BY a.entregador_cobro, DATE(a.fecha_abono)
        ORDER BY DATE(a.fecha_abono) DESC, a.entregador_cobro
      `
    } else if (!entregador && fechaInicio && fechaFin) {
      // Solo filtro de fechas
      console.log('[REPORTE COBROS] 🔍 Filtro: fechas entre', fechaInicio, 'y', fechaFin)
      
      resultados = await sql`
        SELECT 
          a.entregador_cobro as entregador,
          DATE(a.fecha_abono) as fecha,
          COUNT(DISTINCT a.fiado_id) as total_fiados_cobrados,
          SUM(a.monto) as total_cobrado,
          json_agg(
            json_build_object(
              'fiado_id', a.fiado_id,
              'cliente', f.cliente,
              'monto', a.monto,
              'metodo_pago', a.metodo_pago,
              'hora', TO_CHAR(a.fecha_abono, 'HH24:MI'),
              'planilla_id', a.planilla_cobro_id
            ) ORDER BY a.fecha_abono
          ) as detalle_cobros
        FROM abonos_fiados a
        JOIN fiados f ON f.id = a.fiado_id
        WHERE a.fecha_abono >= ${fechaInicio}::date
          AND a.fecha_abono <= ${fechaFin}::date
          AND a.entregador_cobro IS NOT NULL
        GROUP BY a.entregador_cobro, DATE(a.fecha_abono)
        ORDER BY DATE(a.fecha_abono) DESC, a.entregador_cobro
      `
    } else {
      // Filtro combinado: entregador + fechas
      console.log('[REPORTE COBROS] 🔍 Filtro combinado: entregador + fechas')
      
      resultados = await sql`
        SELECT 
          a.entregador_cobro as entregador,
          DATE(a.fecha_abono) as fecha,
          COUNT(DISTINCT a.fiado_id) as total_fiados_cobrados,
          SUM(a.monto) as total_cobrado,
          json_agg(
            json_build_object(
              'fiado_id', a.fiado_id,
              'cliente', f.cliente,
              'monto', a.monto,
              'metodo_pago', a.metodo_pago,
              'hora', TO_CHAR(a.fecha_abono, 'HH24:MI'),
              'planilla_id', a.planilla_cobro_id
            ) ORDER BY a.fecha_abono
          ) as detalle_cobros
        FROM abonos_fiados a
        JOIN fiados f ON f.id = a.fiado_id
        WHERE a.entregador_cobro = ${entregador}
          AND a.fecha_abono >= ${fechaInicio}::date
          AND a.fecha_abono <= ${fechaFin}::date
        GROUP BY a.entregador_cobro, DATE(a.fecha_abono)
        ORDER BY DATE(a.fecha_abono) DESC, a.entregador_cobro
      `
    }

    console.log('[REPORTE COBROS] ✅ Resultados encontrados:', resultados.length)

    // ===================================================
    // CALCULAR TOTALES GENERALES
    // ===================================================
    const entregadoresUnicos = new Set(resultados.map((r: any) => r.entregador))
    const totalFiadosCobrados = resultados.reduce(
      (sum: number, r: any) => sum + Number(r.total_fiados_cobrados), 
      0
    )
    const totalDineroCobrado = resultados.reduce(
      (sum: number, r: any) => sum + Number(r.total_cobrado), 
      0
    )

    const totales = {
      total_entregadores: entregadoresUnicos.size,
      total_fiados_cobrados: totalFiadosCobrados,
      total_dinero_cobrado: totalDineroCobrado
    }

    console.log('[REPORTE COBROS] 📊 Totales calculados:', totales)
    console.log('[REPORTE COBROS] 🎉 ÉXITO')
    console.log('[REPORTE COBROS] ===== FIN =====\n')

    return NextResponse.json({
      success: true,
      filtros: {
        entregador: entregador || 'Todos',
        fecha_inicio: fechaInicio || 'Sin límite',
        fecha_fin: fechaFin || 'Sin límite'
      },
      totales,
      cobros: resultados
    })

  } catch (error) {
    console.error('[REPORTE COBROS] ❌ ERROR FATAL:', error)
    console.error('[REPORTE COBROS] Stack:', error instanceof Error ? error.stack : 'No stack')
    
    return NextResponse.json(
      { 
        error: 'Error al generar reporte',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
