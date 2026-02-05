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

    // 🔧 OPCIÓN B: UNIR ambas tablas (pedidos + fiados)
    let fiadosDesdeTablaFiados: any[] = []
    let fiadosDesdePedidos: any[] = []

    // 1. Obtener de tabla "fiados" (importados + manuales de esta tabla)
    let queryFiados = `
      SELECT 
        f.id,
        f.pedido_id as id_original,
        f.cliente,
        f.direccion,
        f.telefono,
        f.fecha_fiado as fecha,
        f.entregador,
        f.ruta as tipo_ruta,
        f.monto_total as total,
        COALESCE(f.monto_pagado, 0) as monto_pagado,
        COALESCE(f.saldo_pendiente, f.monto_total) as saldo_pendiente,
        f.estado,
        f.importado,
        'fiados' as origen,
        NULL as planilla_id,
        f.created_at
      FROM fiados f
      WHERE 1=1
    `

    const paramsFiados: any[] = []

    if (fechaInicio) {
      queryFiados += ` AND f.fecha_fiado >= $${paramsFiados.length + 1}`
      paramsFiados.push(fechaInicio)
    }

    if (fechaFin) {
      queryFiados += ` AND f.fecha_fiado <= $${paramsFiados.length + 1}`
      paramsFiados.push(fechaFin)
    }

    if (entregador && entregador !== 'all') {
      queryFiados += ` AND f.entregador = $${paramsFiados.length + 1}`
      paramsFiados.push(entregador)
    }

    fiadosDesdeTablaFiados = await sql(queryFiados, paramsFiados)

    // 2. Obtener de tabla "pedidos" (los de planillas diarias)
    let queryPedidos = `
      SELECT 
        p.id,
        p.id::text as id_original,
        p.cliente,
        p.direccion,
        p.telefono,
        pl.fecha,
        pl.entregador,
        pl.tipo_ruta,
        p.total,
        COALESCE(p.monto_pagado, 0) as monto_pagado,
        COALESCE(p.saldo_pendiente, p.total) as saldo_pendiente,
        p.estado,
        false as importado,
        'pedidos' as origen,
        pl.id::text as planilla_id,
        p.created_at
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado IN ('fiado', 'pagado')
    `

    const paramsPedidos: any[] = []

    if (fechaInicio) {
      queryPedidos += ` AND pl.fecha >= $${paramsPedidos.length + 1}`
      paramsPedidos.push(fechaInicio)
    }

    if (fechaFin) {
      queryPedidos += ` AND pl.fecha <= $${paramsPedidos.length + 1}`
      paramsPedidos.push(fechaFin)
    }

    if (entregador && entregador !== 'all') {
      queryPedidos += ` AND pl.entregador = $${paramsPedidos.length + 1}`
      paramsPedidos.push(entregador)
    }

    fiadosDesdePedidos = await sql(queryPedidos, paramsPedidos)

    // 3. Combinar ambos resultados
    const todosLosFiados = [...fiadosDesdeTablaFiados, ...fiadosDesdePedidos]
      .sort((a, b) => {
        const fechaA = new Date(a.fecha).getTime()
        const fechaB = new Date(b.fecha).getTime()
        return fechaB - fechaA // Más recientes primero
      })

    // 4. Obtener abonos si hay fiados
    let abonos: any[] = []
    
    if (todosLosFiados.length > 0) {
      const pedidosIds = todosLosFiados
        .map((f: any) => f.id_original)
        .filter(Boolean)
      
      if (pedidosIds.length > 0) {
        abonos = await sql`
          SELECT 
            a.id,
            a.pedido_id,
            a.monto_abono,
            a.fecha_abono,
            a.metodo_pago,
            a.observaciones,
            a.registrado_por
          FROM abonos_fiados a
          WHERE a.pedido_id = ANY(${pedidosIds})
          ORDER BY a.fecha_abono DESC
        `
      }
    }

    // 5. Agrupar abonos por pedido
    const fiadosConAbonos = todosLosFiados.map((fiado: any) => ({
      ...fiado,
      id: fiado.id_original || fiado.id.toString(),
      barrio: null,
      observaciones: null,
      abonos: abonos.filter((a: any) => a.pedido_id === fiado.id_original)
    }))

    // 6. Calcular resumen por entregador
    const resumenMap = new Map<string, { total_fiados: number; monto_total: number }>()
    
    fiadosConAbonos.forEach((fiado: any) => {
      const entregadorNombre = fiado.entregador || 'Sin asignar'
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

    console.log('[API fiados] Total fiados:', fiadosConAbonos.length)
    console.log('[API fiados] Desde tabla fiados:', fiadosDesdeTablaFiados.length)
    console.log('[API fiados] Desde tabla pedidos:', fiadosDesdePedidos.length)

    return NextResponse.json({
      fiados: fiadosConAbonos,
      resumen
    })

  } catch (error) {
    console.error('[API fiados] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al obtener fiados',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
