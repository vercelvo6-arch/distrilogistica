import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    console.log('[API fiados] === INICIO ===')
    
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const fechaInicio = searchParams.get('fechaInicio')
    const fechaFin = searchParams.get('fechaFin')
    const entregador = searchParams.get('entregador')
    const planillaId = searchParams.get('planilla_id') // ← NUEVO

    const sql = getDB()

    // ========================================
    // CASO ESPECIAL: filtro por planilla_id
    // Usado por FiadosAsignadosSection en Caja
    // Solo consulta tabla "fiados" con planilla_id asignado
    // ========================================
    if (planillaId) {
      console.log('[API fiados] Filtrando por planilla_id:', planillaId)
      
      const fiadosAsignados = await sql`
        SELECT 
          f.id,
          f.cliente,
          f.direccion,
          f.telefono,
          f.monto_total,
          COALESCE(f.monto_pagado, 0) as monto_pagado,
          COALESCE(f.saldo_pendiente, f.monto_total) as saldo_pendiente,
          f.estado,
          f.entregador,
          f.ruta,
          f.planilla_id,
          f.observaciones
        FROM fiados f
        WHERE f.planilla_id = ${Number(planillaId)}
          AND f.estado != 'pagado_completo'
        ORDER BY f.cliente ASC
      `

      console.log('[API fiados] Fiados asignados a planilla', planillaId, ':', fiadosAsignados.length)

      return NextResponse.json({ fiados: fiadosAsignados, resumen: [] })
    }

    // ========================================
    // CONSULTA 1: Tabla "pedidos" (fiados de planillas diarias)
    // ========================================
    let fiadosPedidos: any[] = []
    
    try {
      if (fechaInicio && fechaFin && entregador && entregador !== 'all') {
        fiadosPedidos = await sql`
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
          WHERE p.estado IN ('fiado', 'pagado')
            AND pl.fecha >= ${fechaInicio}
            AND pl.fecha <= ${fechaFin}
            AND pl.entregador = ${entregador}
          ORDER BY pl.fecha DESC, p.cliente ASC
        `
      } else if (fechaInicio && fechaFin) {
        fiadosPedidos = await sql`
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
          WHERE p.estado IN ('fiado', 'pagado')
            AND pl.fecha >= ${fechaInicio}
            AND pl.fecha <= ${fechaFin}
          ORDER BY pl.fecha DESC, p.cliente ASC
        `
      } else if (entregador && entregador !== 'all') {
        fiadosPedidos = await sql`
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
          WHERE p.estado IN ('fiado', 'pagado')
            AND pl.entregador = ${entregador}
          ORDER BY pl.fecha DESC, p.cliente ASC
        `
      } else {
        fiadosPedidos = await sql`
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
          WHERE p.estado IN ('fiado', 'pagado')
          ORDER BY pl.fecha DESC, p.cliente ASC
        `
      }
      console.log('[API fiados] ✓ Fiados desde tabla pedidos:', fiadosPedidos.length)
    } catch (error) {
      console.error('[API fiados] ✗ Error en query pedidos:', error)
      fiadosPedidos = []
    }

    // ========================================
    // CONSULTA 2: Tabla "fiados" (importados desde CSV)
    // ========================================
    let fiadosTabla: any[] = []
    
    try {
      if (fechaInicio && fechaFin && entregador && entregador !== 'all') {
        fiadosTabla = await sql`
          SELECT 
            COALESCE(f.pedido_id, f.id::text) as id,
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
            f.planilla_id::text as planilla_id,
            'fiados' as origen
          FROM fiados f
          WHERE f.fecha_fiado >= ${fechaInicio}::date
            AND f.fecha_fiado <= ${fechaFin}::date
            AND f.entregador = ${entregador}
          ORDER BY f.fecha_fiado DESC, f.cliente ASC
        `
      } else if (fechaInicio && fechaFin) {
        fiadosTabla = await sql`
          SELECT 
            COALESCE(f.pedido_id, f.id::text) as id,
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
            f.planilla_id::text as planilla_id,
            'fiados' as origen
          FROM fiados f
          WHERE f.fecha_fiado >= ${fechaInicio}::date
            AND f.fecha_fiado <= ${fechaFin}::date
          ORDER BY f.fecha_fiado DESC, f.cliente ASC
        `
      } else if (entregador && entregador !== 'all') {
        fiadosTabla = await sql`
          SELECT 
            COALESCE(f.pedido_id, f.id::text) as id,
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
            f.planilla_id::text as planilla_id,
            'fiados' as origen
          FROM fiados f
          WHERE f.entregador = ${entregador}
          ORDER BY f.fecha_fiado DESC, f.cliente ASC
        `
      } else {
        fiadosTabla = await sql`
          SELECT 
            COALESCE(f.pedido_id, f.id::text) as id,
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
            f.planilla_id::text as planilla_id,
            'fiados' as origen
          FROM fiados f
          ORDER BY f.fecha_fiado DESC, f.cliente ASC
        `
      }
      console.log('[API fiados] ✓ Fiados desde tabla fiados:', fiadosTabla.length)
    } catch (error) {
      console.error('[API fiados] ✗ Error en query fiados:', error)
      fiadosTabla = []
    }

    // ========================================
    // COMBINAR RESULTADOS
    // ========================================
    const todosLosFiados = [...fiadosPedidos, ...fiadosTabla]

    // ========================================
    // OBTENER ABONOS
    // ========================================
    let abonos: any[] = []
    
    if (todosLosFiados.length > 0) {
      const pedidosIds = todosLosFiados.map((f: any) => f.id).filter(Boolean)
      
      if (pedidosIds.length > 0) {
        try {
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
        } catch (error) {
          console.error('[API fiados] ✗ Error obteniendo abonos:', error)
          abonos = []
        }
      }
    }

    const fiadosConAbonos = todosLosFiados.map((fiado: any) => ({
      ...fiado,
      abonos: abonos.filter((a: any) => a.pedido_id === fiado.id)
    }))

    // ========================================
    // CALCULAR RESUMEN POR ENTREGADOR
    // ========================================
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

    return NextResponse.json({ fiados: fiadosConAbonos, resumen })

  } catch (error) {
    console.error('[API fiados] ❌ ERROR CRÍTICO:', error)
    return NextResponse.json(
      { error: 'Error al cargar fiados', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
