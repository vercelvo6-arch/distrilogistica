import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    console.log('[API /reporte-cobros] Iniciando...')
    
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const fechaInicio = searchParams.get('fechaInicio')
    const fechaFin = searchParams.get('fechaFin')
    const entregador = searchParams.get('entregador')
    const metodoPago = searchParams.get('metodoPago')

    const sql = getDB()

    // ========================================
    // QUERY PRINCIPAL: COBROS COMPLETOS Y ABONOS
    // ========================================
    
    let whereConditions = []
    let params: any = {}

    // Filtros de fecha
    if (fechaInicio && fechaFin) {
      whereConditions.push(`a.fecha_abono >= ${fechaInicio}::date AND a.fecha_abono <= ${fechaFin}::date`)
    } else if (fechaInicio) {
      whereConditions.push(`a.fecha_abono >= ${fechaInicio}::date`)
    } else if (fechaFin) {
      whereConditions.push(`a.fecha_abono <= ${fechaFin}::date`)
    }

    // Construir query de abonos
    const abonos = await sql`
      SELECT 
        a.id::text as abono_id,
        a.fiado_id::text,
        a.monto_abono,
        a.fecha_abono,
        a.metodo_pago,
        a.observaciones,
        a.registrado_por,
        f.cliente,
        f.monto_total,
        f.monto_pagado,
        f.saldo_pendiente,
        f.estado,
        f.entregador,
        f.cobrado_por,
        f.ruta,
        f.fecha_fiado,
        CASE 
          WHEN f.estado = 'pagado_completo' AND a.monto_abono = f.monto_total THEN 'pago_completo'
          WHEN f.estado = 'pagado_completo' THEN 'ultimo_abono'
          ELSE 'abono_parcial'
        END as tipo_cobro
      FROM abonos_fiados a
      JOIN fiados f ON a.fiado_id = f.id
      WHERE 1=1
        ${fechaInicio && fechaFin ? sql`AND a.fecha_abono >= ${fechaInicio}::date AND a.fecha_abono <= ${fechaFin}::date` : sql``}
        ${entregador && entregador !== 'all' ? sql`AND f.entregador = ${entregador}` : sql``}
        ${metodoPago && metodoPago !== 'all' ? sql`AND a.metodo_pago = ${metodoPago}` : sql``}
      ORDER BY a.fecha_abono DESC, a.created_at DESC
    `

    console.log('[API /reporte-cobros] Abonos encontrados:', abonos.length)

    // ========================================
    // CALCULAR RESUMEN
    // ========================================
    
    let totalCobrado = 0
    let totalPagosCompletos = 0
    let totalAbonosParciales = 0
    let cantidadPagosCompletos = 0
    let cantidadAbonosParciales = 0

    const resumenPorEntregador = new Map()
    const resumenPorMetodo = new Map()

    abonos.forEach((abono: any) => {
      const monto = Number(abono.monto_abono)
      totalCobrado += monto

      // Contar tipo de cobro
      if (abono.tipo_cobro === 'pago_completo' || abono.tipo_cobro === 'ultimo_abono') {
        totalPagosCompletos += monto
        if (abono.tipo_cobro === 'pago_completo') {
          cantidadPagosCompletos++
        }
      } else {
        totalAbonosParciales += monto
        cantidadAbonosParciales++
      }

      // Resumen por entregador
      const entregadorKey = abono.entregador || 'Sin asignar'
      if (!resumenPorEntregador.has(entregadorKey)) {
        resumenPorEntregador.set(entregadorKey, {
          entregador: entregadorKey,
          total_cobrado: 0,
          cantidad_cobros: 0,
          pagos_completos: 0,
          abonos_parciales: 0
        })
      }
      const resumenEnt = resumenPorEntregador.get(entregadorKey)
      resumenEnt.total_cobrado += monto
      resumenEnt.cantidad_cobros++
      if (abono.tipo_cobro === 'pago_completo' || abono.tipo_cobro === 'ultimo_abono') {
        resumenEnt.pagos_completos++
      } else {
        resumenEnt.abonos_parciales++
      }

      // Resumen por método de pago
      const metodoKey = abono.metodo_pago || 'No especificado'
      if (!resumenPorMetodo.has(metodoKey)) {
        resumenPorMetodo.set(metodoKey, {
          metodo: metodoKey,
          total: 0,
          cantidad: 0
        })
      }
      const resumenMet = resumenPorMetodo.get(metodoKey)
      resumenMet.total += monto
      resumenMet.cantidad++
    })

    // ========================================
    // OBTENER LISTA DE ENTREGADORES
    // ========================================
    const entregadores = await sql`
      SELECT DISTINCT entregador
      FROM fiados
      WHERE entregador IS NOT NULL
      ORDER BY entregador ASC
    `

    // ========================================
    // RESPUESTA
    // ========================================
    return NextResponse.json({
      cobros: abonos.map((a: any) => ({
        abono_id: a.abono_id,
        fiado_id: a.fiado_id,
        cliente: a.cliente,
        monto_abono: Number(a.monto_abono),
        monto_total_fiado: Number(a.monto_total),
        monto_pagado_total: Number(a.monto_pagado),
        saldo_pendiente: Number(a.saldo_pendiente),
        fecha_cobro: a.fecha_abono,
        fecha_fiado_original: a.fecha_fiado,
        entregador: a.entregador,
        cobrado_por: a.cobrado_por || a.registrado_por,
        metodo_pago: a.metodo_pago,
        observaciones: a.observaciones,
        tipo_cobro: a.tipo_cobro,
        ruta: a.ruta,
        estado_fiado: a.estado
      })),
      resumen: {
        total_cobrado: Math.round(totalCobrado * 100) / 100,
        total_pagos_completos: Math.round(totalPagosCompletos * 100) / 100,
        total_abonos_parciales: Math.round(totalAbonosParciales * 100) / 100,
        cantidad_pagos_completos: cantidadPagosCompletos,
        cantidad_abonos_parciales: cantidadAbonosParciales,
        cantidad_total_cobros: abonos.length,
        por_entregador: Array.from(resumenPorEntregador.values()),
        por_metodo_pago: Array.from(resumenPorMetodo.values())
      },
      filtros: {
        entregadores: entregadores.map((e: any) => e.entregador),
        metodos_pago: ['efectivo', 'transferencia', 'otro']
      }
    })

  } catch (error) {
    console.error('[API /reporte-cobros] ❌ Error:', error)
    return NextResponse.json(
      { error: 'Error al generar reporte', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
