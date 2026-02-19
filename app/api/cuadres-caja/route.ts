import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { handleDBError } from '@/lib/db-helpers'

export async function POST(request: Request) {
  const sql = getDB()
  
  try {
    console.log('[CUADRE] INICIANDO PROCESO')
    
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[CUADRE] Body recibido:', JSON.stringify(body, null, 2))

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
      console.error('[CUADRE] planillaIds invalido')
      return NextResponse.json({ error: 'planillaIds invalido' }, { status: 400 })
    }

    console.log('[CUADRE] planillaIds:', planillaIds)

    // VERIFICAR QUE LAS PLANILLAS EXISTEN
    console.log('[CUADRE] Verificando que las planillas existen...')
    
    const planillasExistentes = await sql`
      SELECT id, tipo_ruta, entregador, estado, cuadrado_en_caja
      FROM planillas
      WHERE id = ANY(${planillaIds})
    `

    console.log(`[CUADRE] Planillas encontradas: ${planillasExistentes.length}/${planillaIds.length}`)

    if (planillasExistentes.length === 0) {
      console.error('[CUADRE] NO SE ENCONTRARON PLANILLAS CON ESOS IDs')
      return NextResponse.json({ error: 'Planillas no encontradas' }, { status: 404 })
    }

    // GUARDAR FIADOS
    console.log('[CUADRE] Buscando pedidos fiados...')
    
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

    console.log(`[CUADRE] Fiados encontrados: ${pedidosFiados.length}`)

    if (pedidosFiados.length > 0) {
      console.log('[CUADRE] Guardando fiados...')
      
      for (const pedido of pedidosFiados) {
        const montoTotal = Number(pedido.total)
        const montoPagado = Number(pedido.monto_pagado)
        const saldoPendiente = Number(pedido.saldo_pendiente)

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
          console.error('[CUADRE] Error guardando fiado:', err)
          throw err
        }
      }
      
      console.log(`[CUADRE] ${pedidosFiados.length} fiados guardados`)
    }

    // GUARDAR REPASOS
    // Los repasos se insertan en la tabla 'repasos' para que aparezcan
    // visiblemente en el Admin y puedan ser reasignados a una nueva ruta.
    console.log('[CUADRE] Buscando pedidos de repaso...')

    const pedidosRepaso = await sql`
      SELECT 
        p.id,
        p.cliente,
        p.direccion,
        p.telefono,
        p.total,
        p.observaciones,
        pl.fecha,
        pl.entregador,
        pl.tipo_ruta
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'repaso'
        AND pl.id = ANY(${planillaIds})
    `

    console.log(`[CUADRE] Repasos encontrados: ${pedidosRepaso.length}`)

    if (pedidosRepaso.length > 0) {
      console.log('[CUADRE] Guardando repasos...')

      for (const pedido of pedidosRepaso) {
        try {
          await sql`
            INSERT INTO repasos (
              pedido_id,
              cliente,
              direccion,
              telefono,
              monto_total,
              fecha_repaso,
              entregador,
              ruta,
              estado,
              observaciones
            ) VALUES (
              ${pedido.id},
              ${pedido.cliente},
              ${pedido.direccion || null},
              ${pedido.telefono || null},
              ${Number(pedido.total)},
              ${pedido.fecha},
              ${pedido.entregador},
              ${pedido.tipo_ruta},
              'pendiente',
              ${pedido.observaciones || null}
            )
            ON CONFLICT (pedido_id)
            DO UPDATE SET
              estado = 'pendiente',
              updated_at = NOW()
          `
        } catch (err) {
          console.error('[CUADRE] Error guardando repaso:', err)
          throw err
        }
      }

      console.log(`[CUADRE] ${pedidosRepaso.length} repasos guardados`)
    }

    // CONTAR DEVOLUCIONES
    const pedidosDevoluciones = await sql`
      SELECT COUNT(*) as total
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'devolucion'
        AND pl.id = ANY(${planillaIds})
    `
    console.log(`[CUADRE] Devoluciones: ${pedidosDevoluciones[0].total}`)

    // CALCULOS
    const totalConsignado = Number(montoConsignacion || 0)
    const totalEfectivo = Number(efectivoRecibido) || 0
    const descuentoNum = Number(descuento || 0)
    const agotadosNum = Number(agotados || 0)
    const fiadoNum = Number(fiado || 0)
    const devolucionesNum = Number(devoluciones || 0)
    const repasosNum = Number(repasos || 0)
    const erroresFacturacionNum = Number(erroresFacturacion || 0)

    // El totalEsperado viene calculado correctamente desde el frontend:
    // cargue - (fiado + repasos + devoluciones + agotados + descuentos + erroresFacturacion)
    const totalEsperadoNum = Number(totalEsperado) || 0

    console.log('[CUADRE] Verificando efectivo esperado:', {
      totalEsperado: totalEsperadoNum,
      erroresFacturacion: erroresFacturacionNum,
      nota: 'totalEsperado ya viene calculado desde frontend (cargue - todas las novedades incluyendo errores de facturación)'
    })
    
    const totalRecibido = totalEfectivo + totalConsignado
    const diferencia = Math.round((totalRecibido - totalEsperadoNum) * 100) / 100
    const estado = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    // GUARDAR CUADRE
    console.log('[CUADRE] Guardando cuadre...')
    
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
    console.log(`[CUADRE] Cuadre guardado - ID: ${cuadreId}`)

    // MARCAR PLANILLAS COMO CUADRADAS
    console.log('[CUADRE] Actualizando planillas...')
    
    const updateResult = await sql`
      UPDATE planillas
      SET 
        cuadrado_en_caja = true,
        fecha_cuadre = NOW(),
        updated_at = NOW()
      WHERE id = ANY(${planillaIds})
      RETURNING id, tipo_ruta, cuadrado_en_caja
    `
    
    console.log(`[CUADRE] Planillas actualizadas: ${updateResult.length}`)

    // COMISION
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
      console.log('[CUADRE] Comision guardada')
    }

    console.log('[CUADRE] PROCESO COMPLETADO')

    return NextResponse.json({
      success: true,
      cuadreId,
      planillasMarcadas: updateResult.length,
      fiadosGuardados: pedidosFiados.length,
      repasosGuardados: pedidosRepaso.length,
      devolucionesPreservadas: pedidosDevoluciones[0].total,
      mensaje: `Cuadre registrado - ${pedidosFiados.length} fiado(s), ${pedidosRepaso.length} repaso(s)`
    })

  } catch (error) {
    console.error('[CUADRE] ERROR CRITICO:', error)
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
