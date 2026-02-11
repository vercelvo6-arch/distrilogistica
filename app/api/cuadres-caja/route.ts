import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { handleDBError } from '@/lib/db-helpers'

export async function POST(request: Request) {
  const sql = getDB()
  
  try {
    console.log('🔥🔥🔥 [CUADRE] INICIO - NUEVO CÓDIGO CARGADO 🔥🔥🔥')
    
    const session = await getSession()
    if (!session?.user) {
      console.log('❌ [CUADRE] No autenticado')
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    console.log('✅ [CUADRE] Usuario:', session.user.username)

    const body = await request.json()
    console.log('📦 [CUADRE] Body completo:', JSON.stringify(body, null, 2))

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
    if (!planillaIds || !Array.isArray(planillaIds) || planillaIds.length === 0) {
      console.error('❌ [CUADRE] planillaIds inválido:', planillaIds)
      return NextResponse.json({ error: 'planillaIds inválido' }, { status: 400 })
    }

    if (!entregador) {
      console.error('❌ [CUADRE] entregador faltante')
      return NextResponse.json({ error: 'Entregador requerido' }, { status: 400 })
    }

    console.log('✅ [CUADRE] Validaciones OK')
    console.log('📋 [CUADRE] Planillas a cuadrar:', planillaIds)

    // ========================================
    // PASO 1: BUSCAR Y GUARDAR FIADOS
    // ========================================
    console.log('🔍 [CUADRE] Buscando pedidos con estado = fiado...')
    
    const pedidosFiados = await sql`
      SELECT 
        p.id,
        p.cliente,
        p.direccion,
        p.telefono,
        p.total,
        COALESCE(p.monto_pagado, 0) as monto_pagado,
        COALESCE(p.saldo_pendiente, p.total) as saldo_pendiente,
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

    console.log(`📊 [CUADRE] Fiados encontrados: ${pedidosFiados.length}`)

    if (pedidosFiados.length > 0) {
      console.log('💾 [CUADRE] Guardando fiados en tabla fiados...')
      
      for (const pedido of pedidosFiados) {
        const montoTotal = Number(pedido.total)
        const montoPagado = Number(pedido.monto_pagado)
        const saldoPendiente = Number(pedido.saldo_pendiente)

        console.log(`  → Fiado: ${pedido.cliente} | Total: ${montoTotal} | Pagado: ${montoPagado} | Saldo: ${saldoPendiente}`)

        try {
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
          console.log(`  ✅ Guardado: ${pedido.cliente}`)
        } catch (err) {
          console.error(`  ❌ Error guardando fiado ${pedido.cliente}:`, err)
          throw err
        }
      }
      
      console.log(`✅ [CUADRE] ${pedidosFiados.length} fiados guardados exitosamente`)
    } else {
      console.log('ℹ️ [CUADRE] No hay fiados para guardar')
    }

    // ========================================
    // PASO 2: CONTAR REPASOS (NO BORRAR)
    // ========================================
    console.log('🔍 [CUADRE] Contando repasos...')
    
    const pedidosRepasos = await sql`
      SELECT 
        p.id,
        p.cliente
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'repaso'
        AND pl.id = ANY(${planillaIds})
    `

    console.log(`📊 [CUADRE] Repasos encontrados: ${pedidosRepasos.length}`)
    if (pedidosRepasos.length > 0) {
      console.log('  Clientes:', pedidosRepasos.map(r => r.cliente).join(', '))
    }
    console.log('✅ [CUADRE] Repasos PERMANECEN en BD (no se borran)')

    // ========================================
    // PASO 3: CONTAR DEVOLUCIONES (NO BORRAR)
    // ========================================
    console.log('🔍 [CUADRE] Contando devoluciones...')
    
    const pedidosDevoluciones = await sql`
      SELECT 
        p.id,
        p.cliente
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'devolucion'
        AND pl.id = ANY(${planillaIds})
    `

    console.log(`📊 [CUADRE] Devoluciones encontradas: ${pedidosDevoluciones.length}`)
    if (pedidosDevoluciones.length > 0) {
      console.log('  Clientes:', pedidosDevoluciones.map(d => d.cliente).join(', '))
    }
    console.log('✅ [CUADRE] Devoluciones PERMANECEN en BD (no se borran)')

    // ========================================
    // CÁLCULOS
    // ========================================
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

    console.log('💰 [CUADRE] Cálculos:', {
      totalEsperado: totalEsperadoNum,
      efectivo: totalEfectivo,
      consignacion: totalConsignado,
      totalRecibido,
      diferencia,
      estado
    })

    // ========================================
    // GUARDAR CUADRE
    // ========================================
    console.log('💾 [CUADRE] Guardando en cuadres_caja...')
    
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

    const cuadreId = result[0].id
    console.log(`✅ [CUADRE] Cuadre guardado con ID: ${cuadreId}`)

    // ========================================
    // MARCAR PLANILLAS (SIN CAMBIAR ESTADO)
    // ========================================
    console.log('🏷️ [CUADRE] Marcando planillas como cuadradas...')
    
    const planillasActualizadas = await sql`
      UPDATE planillas
      SET 
        cuadrado_en_caja = true,
        fecha_cuadre = NOW(),
        updated_at = NOW()
      WHERE id = ANY(${planillaIds})
      RETURNING id, tipo_ruta, estado
    `
    
    console.log(`✅ [CUADRE] ${planillasActualizadas.length} planillas marcadas`)
    planillasActualizadas.forEach(p => {
      console.log(`  → Ruta ${p.tipo_ruta}: estado="${p.estado}", cuadrado_en_caja=true`)
    })

    // ========================================
    // COMISIÓN
    // ========================================
    console.log('💵 [CUADRE] Buscando config de comisión...')
    
    const configComision = await sql`
      SELECT porcentaje_comision 
      FROM comisiones_config 
      WHERE entregador = ${entregador} 
        AND activo = true
    `

    if (configComision.length > 0) {
      const porcentaje = Number(configComision[0].porcentaje_comision)
      const baseComisionable = Math.round(totalEfectivo * 100) / 100
      const montoComision = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100

      console.log(`💵 [CUADRE] Comisión: ${porcentaje}% de ${baseComisionable} = ${montoComision}`)

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
          ${devolucionesNum},
          ${baseComisionable},
          ${porcentaje},
          ${montoComision},
          'pendiente',
          ${cuadreId}
        )
      `
      console.log('✅ [CUADRE] Comisión guardada')
    } else {
      console.log('⚠️ [CUADRE] No hay config de comisión')
    }

    console.log('🎉🎉🎉 [CUADRE] COMPLETADO EXITOSAMENTE 🎉🎉🎉')

    return NextResponse.json({
      success: true,
      cuadreId,
      planillasMarcadas: planillasActualizadas.length,
      fiadosGuardados: pedidosFiados.length,
      repasosPreservados: pedidosRepasos.length,
      devolucionesPreservadas: pedidosDevoluciones.length,
      mensaje: `✅ ${pedidosFiados.length} fiado(s) · ${pedidosRepasos.length} repaso(s) · ${pedidosDevoluciones.length} devolución(es) guardados`
    })

  } catch (error) {
    console.error('💥💥💥 [CUADRE] ERROR CRÍTICO:', error)
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack')
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

    const cuadres = await sql`
      SELECT 
        c.*,
        array_agg(DISTINCT p.tipo_ruta) FILTER (WHERE p.tipo_ruta IS NOT NULL) as rutas_nombres
      FROM cuadres_caja c
      LEFT JOIN planillas p ON p.id = ANY(c.planillas_ids)
      GROUP BY c.id
      ORDER BY c.fecha_cuadre DESC
      LIMIT 100
    `

    return NextResponse.json({
      success: true,
      cuadres
    })

  } catch (error) {
    return handleDBError(error, 'CUADRE CAJA GET')
  }
}
