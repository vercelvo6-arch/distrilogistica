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
    const fechaInicio = searchParams.get('fechaInicio')
    const fechaFin = searchParams.get('fechaFin')
    const entregador = searchParams.get('entregador')

    const sql = getDB()

    // Construir query dinámicamente
    const fiados = await sql`
      SELECT 
        p.id::text as id,
        p.cliente,
        p.direccion,
        p.telefono,
        p.barrio,
        p.total,
        COALESCE(p.monto_pagado, 0) as monto_pagado,
        COALESCE(p.saldo_pendiente, p.total) as saldo_pendiente,
        p.estado,
        p.observaciones,
        pl.fecha,
        pl.entregador,
        pl.tipo_ruta,
        pl.id::text as planilla_id
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado IN ('fiado', 'pagado')
        ${fechaInicio ? sql`AND pl.fecha >= ${fechaInicio}` : sql``}
        ${fechaFin ? sql`AND pl.fecha <= ${fechaFin}` : sql``}
        ${entregador && entregador !== 'all' ? sql`AND pl.entregador = ${entregador}` : sql``}
      ORDER BY pl.fecha DESC, p.cliente ASC
    `

    // Obtener abonos
    const pedidosIds = fiados.map((f: any) => f.id)
    let abonos: any[] = []
    
    if (pedidosIds.length > 0) {
      abonos = await sql`
        SELECT 
          a.id::text as id,
          a.pedido_id::text as pedido_id,
          a.monto,
          a.fecha_abono,
          a.metodo_pago,
          a.observaciones,
          a.registrado_por,
          u.nombre as registrado_por_nombre
        FROM abonos_fiados a
        LEFT JOIN usuarios u ON a.registrado_por = u.id
        WHERE a.pedido_id = ANY(${pedidosIds})
        ORDER BY a.fecha_abono DESC
      `
    }

    // Agrupar abonos por pedido
    const fiadosConAbonos = fiados.map((fiado: any) => ({
      ...fiado,
      abonos: abonos.filter((a: any) => a.pedido_id === fiado.id)
    }))

    // Calcular resumen
    const resumenMap = new Map<string, { total_fiados: number; monto_total: number }>()
    
    fiadosConAbonos.forEach((fiado: any) => {
      const entregadorNombre = fiado.entregador
      const saldo = Number(fiado.saldo_pendiente)
      
      if (saldo > 0) {
        if (!resumenMap.has(entregadorNombre)) {
          resumenMap.set(entregadorNombre, { total_fiados: 0, monto_total: 0 })
        }
        const current = resumenMap.get(entregadorNombre)!
        current.total_fiados += 1
        current.monto_total += saldo
      }
    })

    const resumen = Array.from(resumenMap.entries()).map(([entregador, data]) => ({
      entregador,
      ...data
    }))

    return NextResponse.json({
      fiados: fiadosConAbonos,
      resumen
    })

  } catch (error) {
    console.error('[API fiados] Error:', error)
    return NextResponse.json(
      { error: 'Error al cargar fiados' },
      { status: 500 }
    )
  }
}
