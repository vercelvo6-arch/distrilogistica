import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin, coordinador y caja pueden ver fiados
    if (!['administrador', 'coordinador', 'caja'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const fechaInicio = searchParams.get('fechaInicio')
    const fechaFin = searchParams.get('fechaFin')
    const entregador = searchParams.get('entregador')

    const sql = getDB()

    // Query base para fiados
    let fiadosQuery = sql`
      SELECT 
        p.id,
        p.cliente,
        p.direccion,
        p.telefono,
        p.barrio,
        p.total,
        p.estado,
        p.observaciones,
        p.planilla_id,
        pl.fecha,
        pl.entregador,
        pl.tipo_ruta
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'fiado'
    `

    // Agregar filtros
    if (fechaInicio && fechaFin) {
      fiadosQuery = sql`
        SELECT 
          p.id,
          p.cliente,
          p.direccion,
          p.telefono,
          p.barrio,
          p.total,
          p.estado,
          p.observaciones,
          p.planilla_id,
          pl.fecha,
          pl.entregador,
          pl.tipo_ruta
        FROM pedidos p
        JOIN planillas pl ON p.planilla_id = pl.id
        WHERE p.estado = 'fiado'
          AND pl.fecha >= ${fechaInicio}
          AND pl.fecha <= ${fechaFin}
      `
    }

    if (entregador && entregador !== 'all') {
      fiadosQuery = sql`
        SELECT 
          p.id,
          p.cliente,
          p.direccion,
          p.telefono,
          p.barrio,
          p.total,
          p.estado,
          p.observaciones,
          p.planilla_id,
          pl.fecha,
          pl.entregador,
          pl.tipo_ruta
        FROM pedidos p
        JOIN planillas pl ON p.planilla_id = pl.id
        WHERE p.estado = 'fiado'
          AND pl.fecha >= ${fechaInicio || '1900-01-01'}
          AND pl.fecha <= ${fechaFin || '2100-12-31'}
          AND pl.entregador = ${entregador}
      `
    }

    fiadosQuery = sql`
      ${fiadosQuery}
      ORDER BY pl.fecha DESC
    `

    const fiados = await fiadosQuery

    // Calcular resumen por entregador
    const resumenQuery = sql`
      SELECT 
        pl.entregador,
        COUNT(p.id)::int as total_fiados,
        SUM(p.total)::numeric as monto_total
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'fiado'
        ${fechaInicio && fechaFin ? sql`AND pl.fecha >= ${fechaInicio} AND pl.fecha <= ${fechaFin}` : sql``}
        ${entregador && entregador !== 'all' ? sql`AND pl.entregador = ${entregador}` : sql``}
      GROUP BY pl.entregador
      ORDER BY monto_total DESC
    `

    const resumen = await resumenQuery

    return NextResponse.json({
      fiados,
      resumen
    })
  } catch (error) {
    console.error('[API fiados] Error:', error)
    return NextResponse.json(
      { error: 'Error al cargar fiados', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
