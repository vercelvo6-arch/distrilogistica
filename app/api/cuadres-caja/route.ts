import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { handleDBError } from '@/lib/db-helpers'

export async function POST(request: Request) {
  try {
    console.log('[CUADRE CAJA] === INICIO DE REQUEST ===')
    
    const session = await getSession()
    if (!session?.user) {
      console.log('[CUADRE CAJA] ERROR: Usuario no autenticado')
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const sql = getDB()
    console.log('[CUADRE CAJA] Usuario autenticado:', session.user.username)

    const body = await request.json()
    console.log('[CUADRE CAJA] Body recibido:', JSON.stringify(body, null, 2))

    const {
      planillaIds,
      entregador,
      totalEsperado,
      efectivoRecibido,
      tieneConsignacion,
      numeroConsignacion,
      banco,
      montoConsignacion,
      observaciones,
      descuento,
      agotados,
      fiado,
      devoluciones,
      repasos,
      erroresFacturacion
    } = body

    // Validaciones
    console.log('[CUADRE CAJA] Iniciando validaciones...')
    
    if (!planillaIds || !Array.isArray(planillaIds) || planillaIds.length === 0) {
      console.error('[CUADRE CAJA] ❌ planillaIds inválido:', planillaIds)
      return NextResponse.json(
        { error: 'No se recibieron planillas válidas', details: `planillaIds: ${JSON.stringify(planillaIds)}` },
        { status: 400 }
      )
    }
    console.log('[CUADRE CAJA] ✓ planillaIds válido:', planillaIds)

    if (!entregador) {
      console.error('[CUADRE CAJA] ❌ entregador faltante')
      return NextResponse.json(
        { error: 'Entregador es requerido' },
        { status: 400 }
      )
    }
    console.log('[CUADRE CAJA] ✓ Entregador:', entregador)

    if (efectivoRecibido === undefined || efectivoRecibido === null) {
      console.error('[CUADRE CAJA] ❌ efectivoRecibido faltante')
      return NextResponse.json(
        { error: 'Efectivo recibido es requerido' },
        { status: 400 }
      )
    }
    console.log('[CUADRE CAJA] ✓ Efectivo recibido:', efectivoRecibido)

    // ========================================
    // ✅ PASO 1: GUARDAR FIADOS EN LA TABLA `fiados`
    // ========================================
    console.log('[CUADRE CAJA] 🔄 Guardando pedidos fiados...')
    
    const pedidosFiados = await sql`
      SELECT 
        p.id,
        p.cliente,
        p.direccion,
        p.telefono,
        p.total,
        p.monto_pagado,
        p.saldo_pendiente,
        p.observaciones,
        pl.fecha,
        pl.entregador,
        pl.tipo_ruta
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'fiado'
        AND pl.id = ANY(${planillaIds})
        AND p.es_cobro = false
    `

    for (const pedido of pedidosFiados) {
      const montoTotal = Number(pedido.total)
      const montoPagado = Number(pedido.monto_pagado || 0)
      const saldoPendiente = Number(pedido.saldo_pendiente || montoTotal)

      console.log('[CUADRE CAJA] 💾 Guardando fiado:', {
        pedidoId: pedido.id,
        cliente: pedido.cliente,
        montoTotal,
        montoPagado,
        saldoPendiente
      })

      await sql`
        INSERT INTO fiados (
          pedido_id,
          cliente,
          direccion,
          telefono,
          monto_total,
          monto_pagado,
          saldo_pendiente,
          fecha_fiado,
          entregador,
          ruta,
          estado,
          observaciones
        ) VALUES (
          ${pedido.id},
          ${pedido.cliente},
          ${pedido.direccion || null},
          ${pedido.telefono || null},
          ${montoTotal},
          ${montoPagado},
          ${saldoPendiente},
          ${pedido.fecha},
          ${pedido.entregador},
          ${pedido.tipo_ruta},
          ${saldoPendiente > 0 ? 'pendiente' : 'pagado'},
          ${pedido.observaciones || null}
        )
        ON CONFLICT (pedido_id) 
        DO UPDATE SET
          monto_pagado = EXCLUDED.monto_pagado,
          saldo_pendiente = EXCLUDED.saldo_pendiente,
          estado = EXCLUDED.estado,
          updated_at = NOW()
      `
    }

    console.log('[CUADRE CAJA] ✅ Fiados guardados:', pedidosFiados.length)

    // ========================================
    // ✅ PASO 2: LOS REPASOS PERMANECEN EN `pedidos`
    // ========================================
    const pedidosRepasos = await sql`
      SELECT COUNT(*) as total
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'repaso'
        AND pl.id = ANY(${planillaIds})
    `

    console.log('[CUADRE CAJA] ℹ️ Repasos en estas planillas:', pedidosRepasos[0].total)
    console.log('[CUADRE CAJA] ✅ Los repasos permanecen en BD con estado = "repaso"')

    // ========================================
    // ✅ PASO 3: LAS DEVOLUCIONES PERMANECEN
    // ========================================
    const pedidosDevoluciones = await sql`
      SELECT COUNT(*) as total
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'devolucion'
        AND pl.id = ANY(${planillaIds})
    `

    console.log('[CUADRE CAJA] ℹ️ Devoluciones en estas planillas:', pedidosDevoluciones[0].total)
    console.log('[CUADRE CAJA] ✅ Las devoluciones permanecen en BD con estado = "devolucion"')

    // Cálculos
    const totalConsignado = Number(montoConsignacion || 0)
    const totalEfectivo = Number(efectivoRecibido) || 0
    const totalEsperadoNum = Number(totalEsperado) || 0
    const descuentoNum = Number(descuento || 0)
    const agotadosNum = Number(agotados || 0)
    const fiadoNum = Number(fiado || 0)
    const devolucionesNum = Number(devoluciones || 0)
    const repasosNum = Number(repasos || 0)
    const erroresFacturacionNum = Number(erroresFacturacion || 0)
    
    const totalRecibido = totalEfectivo + totalConsignado
    const diferencia = Math.round((totalRecibido - totalEsperadoNum) * 100) / 100
    const estado = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    console.log('[CUADRE CAJA] Valores calculados:', {
      totalEsperado: totalEsperadoNum,
      efectivo: totalEfectivo,
      consignacion: totalConsignado,
      totalRecibido,
      diferencia,
      estado,
      descuento: descuentoNum,
      agotados: agotadosNum,
      fiado: fiadoNum,
      devoluciones: devolucionesNum,
      repasos: repasosNum,
      erroresFacturacion: erroresFacturacionNum
    })

    // INSERT
    console.log('[CUADRE CAJA] Ejecutando INSERT en cuadres_caja...')
    
    const result = await sql`
      INSERT INTO cuadres_caja (
        entregador,
        fecha_cuadre,
        planillas_ids,
        total_esperado,
        total_efectivo,
        total_consignado,
        diferencia,
        estado,
        observaciones,
        tiene_consignacion,
        numero_consignacion,
        banco,
        descuento,
        agotados,
        fiado,
        devoluciones,
        repasos,
        errores_facturacion
      ) VALUES (
        ${entregador},
        NOW(),
        ${planillaIds},
        ${totalEsperadoNum},
        ${totalEfectivo},
        ${totalConsignado},
        ${diferencia},
        ${estado},
        ${observaciones || null},
        ${tieneConsignacion || false},
        ${numeroConsignacion || null},
        ${banco || null},
        ${descuentoNum},
        ${agotadosNum},
        ${fiadoNum},
        ${devolucionesNum},
        ${repasosNum},
        ${erroresFacturacionNum}
      )
      RETURNING id
    `

    if (!result || result.length === 0) {
      throw new Error('INSERT no retornó resultados')
    }

    const cuadreId = result[0].id
    console.log('[CUADRE CAJA] ✓ Cuadre insertado con ID:', cuadreId)

    // ========================================
    // ✅ MARCAR PLANILLAS COMO CUADRADAS
    // ❌ NO CAMBIAR ESTADO - Solo marcar cuadrado_en_caja
    // ========================================
    console.log('[CUADRE CAJA] Marcando', planillaIds.length, 'planillas como cuadradas...')
    
    const planillasActualizadas = await sql`
      UPDATE planillas
      SET 
        cuadrado_en_caja = true,
        fecha_cuadre = NOW(),
        updated_at = NOW()
      WHERE id = ANY(${planillaIds})
      RETURNING id, tipo_ruta, estado
    `
    
    console.log('[CUADRE CAJA] ✓ Planillas marcadas como cuadradas:', planillasActualizadas.length)
    console.log('[CUADRE CAJA] ✓ Estados preservados:', planillasActualizadas.map(p => ({ id: p.id, estado: p.estado })))
    console.log('[CUADRE CAJA] ✓ Planillas ya NO aparecerán en Caja')
    console.log('[CUADRE CAJA] ✓ Coordinador SÍ puede verlas en Supervisión')

    // Comisión
    console.log('[CUADRE CAJA] Buscando configuración de comisión...')
    const configComision = await sql`
      SELECT porcentaje_comision 
      FROM comisiones_config 
      WHERE entregador = ${entregador} 
        AND activo = true
    `

    if (configComision.length > 0) {
      const porcentaje = Number(configComision[0].porcentaje_comision)
      const totalDevoluciones = devolucionesNum
      const baseComisionable = Math.round(totalEfectivo * 100) / 100
      const montoComision = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100

      console.log('[CUADRE CAJA] Creando comisión:', {
        porcentaje,
        totalDevoluciones,
        base: baseComisionable,
        monto: montoComision
      })

      await sql`
        INSERT INTO comisiones (
          entregador,
          fecha,
          planilla_id,
          total_entregas_efectivas,
          total_devoluciones,
          base_comisionable,
          porcentaje_aplicado,
          monto_comision,
          estado,
          cuadre_agrupado_id
        ) VALUES (
          ${entregador},
          (NOW() AT TIME ZONE 'America/Bogota')::date,
          NULL,
          ${totalEfectivo},
          ${totalDevoluciones},
          ${baseComisionable},
          ${porcentaje},
          ${montoComision},
          'pendiente',
          ${cuadreId}
        )
      `

      console.log('[CUADRE CAJA] ✓ Comisión creada')
    } else {
      console.log('[CUADRE CAJA] ⚠️ No hay configuración de comisión para:', entregador)
    }

    console.log('[CUADRE CAJA] ✓✓✓ PROCESO COMPLETADO EXITOSAMENTE')

    return NextResponse.json({
      success: true,
      cuadreId,
      planillasMarcadas: planillasActualizadas.length,
      fiadosGuardados: pedidosFiados.length,
      repasosPreservados: pedidosRepasos[0].total,
      devolucionesPreservadas: pedidosDevoluciones[0].total,
      mensaje: `✅ Cuadre registrado · ${pedidosFiados.length} fiado(s) · ${pedidosRepasos[0].total} repaso(s) · ${pedidosDevoluciones[0].total} devolución(es)`
    })

  } catch (error) {
    return handleDBError(error, 'CUADRE CAJA POST')
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const sql = getDB()

    console.log('[CUADRE CAJA] Obteniendo historial...')

    const cuadres = await sql`
      SELECT 
        c.id,
        c.entregador,
        c.fecha_cuadre,
        c.planillas_ids,
        c.total_esperado,
        c.total_efectivo,
        c.total_consignado,
        c.diferencia,
        c.estado,
        c.observaciones,
        c.tiene_consignacion,
        c.numero_consignacion,
        c.banco,
        c.descuento,
        c.motivo_descuento,
        c.agotados,
        c.fiado,
        c.devoluciones,
        c.repasos,
        c.errores_facturacion,
        array_agg(DISTINCT p.tipo_ruta) FILTER (WHERE p.tipo_ruta IS NOT NULL) as rutas_nombres
      FROM cuadres_caja c
      LEFT JOIN planillas p ON p.id = ANY(c.planillas_ids)
      GROUP BY c.id
      ORDER BY c.fecha_cuadre DESC
      LIMIT 100
    `

    console.log('[CUADRE CAJA] ✓ Historial obtenido:', cuadres.length, 'registros')

    return NextResponse.json({
      success: true,
      cuadres
    })

  } catch (error) {
    return handleDBError(error, 'CUADRE CAJA GET')
  }
}
