import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
const sql = neon(process.env.DATABASE_URL!)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const fechaDesde = searchParams.get('fechaDesde')
    const fechaHasta = searchParams.get('fechaHasta')
    const cuadres = await sql`
      SELECT 
        id,
        entregador,
        fecha_cuadre,
        fecha_desde,
        fecha_hasta,
        planillas_ids,
        rutas_nombres,
        tipo_cuadre,
        total_cargue,
        total_esperado,
        total_efectivo,
        nequi_recibido,
        total_consignado,
        diferencia,
        estado,
        observaciones,
        tiene_consignacion,
        numero_consignacion,
        banco,
        descuento,
        motivo_descuento,
        agotados,
        fiado,
        devoluciones,
        repasos,
        errores_facturacion,
        cobros_efectivo,
        cobros_nequi,
        total_cobros,
        created_at
      FROM cuadres_caja
      WHERE true
        ${fechaDesde ? sql`AND fecha_cuadre >= ${fechaDesde}::date` : sql``}
        ${fechaHasta ? sql`AND fecha_cuadre <= ${fechaHasta}::date` : sql``}
      ORDER BY created_at DESC
      LIMIT 100
    `
    return NextResponse.json({ success: true, cuadres })
  } catch (error) {
    console.error('[HISTORIAL CUADRES] ERROR:', error)
    return NextResponse.json({ error: 'Error al cargar historial' }, { status: 500 })
  }
}
