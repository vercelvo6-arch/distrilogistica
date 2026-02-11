import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { handleDBError } from '@/lib/db-helpers'

export async function POST(request: Request) {
  const sql = getDB()
  
  try {
    console.log('\n\n🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥')
    console.log('🔥 [CUADRE] NUEVO CÓDIGO CON DEBUG EXTREMO 🔥')
    console.log('🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥\n')
    
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    console.log('📦 [CUADRE] Body recibido:', JSON.stringify(body, null, 2))

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
      console.error('❌ planillaIds inválido')
      return NextResponse.json({ error: 'planillaIds inválido' }, { status: 400 })
    }

    console.log('✅ [CUADRE] planillaIds:', planillaIds)
    console.log('✅ [CUADRE] Tipo:', typeof planillaIds, Array.isArray(planillaIds))

    // ========================================
    // VERIFICAR QUE LAS PLANILLAS EXISTEN
    // ========================================
    console.log('\n🔍 [CUADRE] Verificando que las planillas existen...')
    
    const planillasExistentes = await sql`
      SELECT id, tipo_ruta, entregador, estado, cuadrado_en_caja
      FROM planillas
      WHERE id = ANY(${planillaIds})
    `

    console.log(`📊 [CUADRE] Planillas encontradas: ${planillasExistentes.length}/${planillaIds.length}`)
    planillasExistentes.forEach(p => {
      console.log(`  → ${p.id} | Ruta ${p.tipo_ruta} | Estado: ${p.estado} | Cuadrado: ${p.cuadrado_en_caja}`)
    })

    if (planillasExistentes.length === 0) {
      console.error('❌ [CUADRE] NO SE ENCONTRARON PLANILLAS CON ESOS IDs')
      return NextResponse.json({ error: 'Planillas no encontradas' }, { status: 404 })
    }

    // ========================================
    // GUARDAR FIADOS
    // ========================================
    console.log('\n🔍 [CUADRE] Buscando pedidos fiados...')
    
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
        AND COALESCE(p.es_cobro, false) = false
    `

    console.log(`📊 [CUADRE] Fiados encontrados: ${pedidosFiados.length}`)

    if (pedidosFiados.length > 0) {
      console.log('💾 [CUADRE] Guardando fiados...')
      
      for (const pedido of pedidosFiados) {
        const montoTotal = Number(pedido.total)
        const montoPagado = Number(pedido.monto_pagado)
        const saldoPendiente = Number(pedido.saldo_pendiente)

        console.log(`  → ${pedido.cliente}: $${montoTotal.toLocaleString()} (Pagado: $${montoPagado.toLocaleString()}, Saldo: $${saldoPendiente.toLocaleString()})`)

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
        } catch (err) {
          console.error(`  ❌ Error guardando fiado:`, err)
          throw err
        }
      }
      
      console.log(`✅ [CUADRE] ${pedidosFiados.length} fiados guardados`)
    }

    // ========================================
    // CONTAR REPASOS
    // ========================================
    const pedidosRepasos = await sql`
      SELECT COUNT(*) as total
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'repaso'
        AND pl.id = ANY(${planillaIds})
    `
    console.log(`📊 [CUADRE] Repasos: ${pedidosRepasos[0].total}`)

    // ========================================
    // CONTAR DEVOLUCIONES
    // ========================================
    const pedidosDevoluciones = await sql`
      SELECT COUNT(*) as total
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'devolucion'
        AND pl.id = ANY(${planillaIds})
    `
    console.log(`📊 [CUADRE] Devoluciones: ${pedidosDevoluciones[0].total}`)

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

    // ========================================
    // GUARDAR CUADRE
    // ========================================
    console.log('\n💾 [CUADRE] Guardando cuadre...')
    
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
    console.log(`✅ [CUADRE] Cuadre guardado - ID: ${cuadreId}`)

    // ========================================
    // 🔥 MARCAR PLANILLAS - VERSIÓN FORZADA 🔥
    // ========================================
    console.log('\n🔥🔥🔥 [CUADRE] INICIANDO UPDATE DE PLANILLAS 🔥🔥🔥')
    console.log('🔥 IDs a actualizar:', planillaIds)

    // MÉTODO 1: Update con ANY (actual)
    console.log('\n📝 [CUADRE] Método 1: UPDATE con ANY...')
    
    try {
      const updateResult1 = await sql`
        UPDATE planillas
        SET 
          cuadrado_en_caja = true,
          fecha_cuadre = NOW(),
          updated_at = NOW()
        WHERE id = ANY(${planillaIds})
        RETURNING id, tipo_ruta, estado, cuadrado_en_caja, fecha_cuadre
      `
      
      console.log(`✅ [CUADRE] Método 1 - Filas afectadas: ${updateResult1.length}`)
      updateResult1.forEach(p => {
        console.log(`  → ${p.id} | Ruta ${p.tipo_ruta} | cuadrado=${p.cuadrado_en_caja} | fecha=${p.fecha_cuadre}`)
      })
      
      if (updateResult1.length === 0) {
        console.log('⚠️ [CUADRE] Método 1 no actualizó nada, probando método 2...')
        
        // MÉTODO 2: Update uno por uno
        console.log('\n📝 [CUADRE] Método 2: UPDATE individual...')
        
        for (const planillaId of planillaIds) {
          console.log(`  Actualizando ${planillaId}...`)
          
          const updateResult2 = await sql`
            UPDATE planillas
            SET 
              cuadrado_en_caja = true,
              fecha_cuadre = NOW(),
              updated_at = NOW()
            WHERE id = ${planillaId}
            RETURNING id, cuadrado_en_caja, fecha_cuadre
          `
          
          if (updateResult2.length > 0) {
            console.log(`  ✅ Actualizada: ${updateResult2[0].id}`)
          } else {
            console.log(`  ❌ NO ACTUALIZADA: ${planillaId}`)
          }
        }
      }
      
    } catch (updateError) {
      console.error('❌ [CUADRE] ERROR EN UPDATE:', updateError)
      throw updateError
    }

    // VERIFICAR ESTADO FINAL
    console.log('\n🔍 [CUADRE] Verificando estado final...')
    
    const planillasFinales = await sql`
      SELECT id, tipo_ruta, cuadrado_en_caja, fecha_cuadre
      FROM planillas
      WHERE id = ANY(${planillaIds})
    `
    
    console.log('📊 [CUADRE] Estado final de planillas:')
    planillasFinales.forEach(p => {
      console.log(`  → ${p.id} | cuadrado=${p.cuadrado_en_caja} | fecha=${p.fecha_cuadre}`)
    })

    // ========================================
    // COMISIÓN
    // ========================================
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
    }

    console.log('\n🎉🎉🎉 [CUADRE] PROCESO COMPLETADO 🎉🎉🎉\n')

    return NextResponse.json({
      success: true,
      cuadreId,
      planillasMarcadas: planillasFinales.filter(p => p.cuadrado_en_caja).length,
      fiadosGuardados: pedidosFiados.length,
      repasosPreservados: pedidosRepasos[0].total,
      devolucionesPreservadas: pedidosDevoluciones[0].total,
      mensaje: `✅ Cuadre #${cuadreId} | ${pedidosFiados.length} fiado(s) | ${pedidosRepasos[0].total} repaso(s)`
    })

  } catch (error) {
    console.error('\n💥💥💥 [CUADRE] ERROR CRÍTICO 💥💥💥')
    console.error('Error:', error)
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
