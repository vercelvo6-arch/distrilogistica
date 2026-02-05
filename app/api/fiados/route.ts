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

    // Construir query para tabla pedidos (original)
    const condicionesPedidos = ['p.estado IN ($1, $2)']
    const paramsPedidos: any[] = ['fiado', 'pagado']
    let paramIndexPedidos = 3

    if (fechaInicio) {
      condicionesPedidos.push(`pl.fecha >= $${paramIndexPedidos}`)
      paramsPedidos.push(fechaInicio)
      paramIndexPedidos++
    }

    if (fechaFin) {
      condicionesPedidos.push(`pl.fecha <= $${paramIndexPedidos}`)
      paramsPedidos.push(fechaFin)
      paramIndexPedidos++
    }

    if (entregador && entregador !== 'all') {
      condicionesPedidos.push(`pl.entregador = $${paramIndexPedidos}`)
      paramsPedidos.push(entregador)
      paramIndexPedidos++
    }

    const queryPedidos = `
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
        pl.id::text as planilla_id,
        'pedidos' as origen
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE ${condicionesPedidos.join(' AND ')}
      ORDER BY pl.fecha DESC, p.cliente ASC
    `

    console.log('[API fiados] Query pedidos:', queryPedidos)
    console.log('[API fiados] Params pedidos:', paramsPedidos)

    const fiadosPedidos = await sql(queryPedidos, paramsPedidos)
    console.log('[API fiados] Fiados desde pedidos:', fiadosPedidos.length)

    // Construir query para tabla fiados (importados)
    const condicionesFiados = ['1=1']
    const paramsFiados: any[] = []
    let paramIndexFiados = 1

    if (fechaInicio) {
      condicionesFiados.push(`f.fecha_fiado >= $${paramIndexFiados}`)
      paramsFiados.push(fechaInicio)
      paramIndexFiados++
    }

    if (fechaFin) {
      condicionesFiados.push(`f.fecha_fiado <= $${paramIndexFiados}`)
      paramsFiados.push(fechaFin)
      paramIndexFiados++
    }

    if (entregador && entregador !== 'all') {
      condicionesFiados.push(`f.entregador = $${paramIndexFiados}`)
      paramsFiados.push(entregador)
      paramIndexFiados++
    }

    const queryFiados = `
      SELECT 
        f.pedido_id as id,
        f.cliente,
        f.direccion,
        f.telefono,
        NULL as barrio,
        f.monto_total as total,
        COALESCE(f.monto_pagado, 0) as monto_pagado,
        COALESCE(f.saldo_pendiente, f.monto_total) as saldo_pendiente,
        f.estado,
        NULL as observaciones,
        f.fecha_fiado::date::text as fecha,
        f.entregador,
        f.ruta as tipo_ruta,
        NULL as planilla_id,
        'fiados' as origen
      FROM fiados f
      WHERE ${condicionesFiados.join(' AND ')}
      ORDER BY f.fecha_fiado DESC, f.cliente ASC
    `

    console.log('[API fiados] Query fiados:', queryFiados)
    console.log('[API fiados] Params fiados:', paramsFiados)

    const fiadosTabla = await sql(queryFiados, paramsFiados)
    console.log('[API fiados] Fiados desde tabla fiados:', fiadosTabla.length)

    // Combinar ambos resultados
    const todosLosFiados = [...fiadosPedidos, ...fiadosTabla]
    console.log('[API fiados] Total fiados combinados:', todosLosFiados.length)

    // Obtener abonos
    let abonos: any[] = []
    
    if (todosLosFiados.length > 0) {
      const pedidosIds = todosLosFiados.map((f: any) => f.id).filter(Boolean)
      
      if (pedidosIds.length > 0) {
        abonos = await sql`
          SELECT 
            a.id::text as id,
            a.pedido_id::text as pedido_id,
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

    // Agrupar abonos por pedido
    const fiadosConAbonos = todosLosFiados.map((fiado: any) => ({
      ...fiado,
      abonos: abonos.filter((a: any) => a.pedido_id === fiado.id)
    }))

    // Calcular resumen
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

    console.log('[API fiados] Resumen:', resumen)

    return NextResponse.json({
      fiados: fiadosConAbonos,
      resumen
    })

  } catch (error) {
    console.error('[API fiados] ERROR:', error)
    console.error('[API fiados] Stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { 
        error: 'Error al cargar fiados',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
