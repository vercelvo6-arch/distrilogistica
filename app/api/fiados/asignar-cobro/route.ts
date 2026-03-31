import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  console.log('\n💰 [ASIGNAR COBRO] ===== INICIO =====')
  
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { pedidoFiadoId, planillaDestinoId } = body

    console.log('[ASIGNAR COBRO] 📨 Request recibido:', {
      pedidoFiadoId,
      planillaDestinoId,
      tipo_pedido: typeof pedidoFiadoId,
      tipo_planilla: typeof planillaDestinoId
    })

    if (!pedidoFiadoId || !planillaDestinoId) {
      return NextResponse.json(
        { error: 'Datos incompletos: pedidoFiadoId y planillaDestinoId son requeridos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // ===================================================
    // USAR EL ID COMO STRING (sin conversión a número)
    // ===================================================
    const planillaId = String(planillaDestinoId).trim()

    console.log('[ASIGNAR COBRO] 🔍 Planilla ID a buscar:', {
      original: planillaDestinoId,
      limpio: planillaId,
      tipo: typeof planillaId
    })

    // ===================================================
    // PASO 1: Buscar el fiado en AMBAS tablas
    // ===================================================
    let fiadoData: any = null
    let origenFiado: 'pedidos' | 'fiados' = 'pedidos'

    console.log('[ASIGNAR COBRO] 🔍 Buscando fiado:', pedidoFiadoId)

    // Intentar primero en tabla "pedidos"
    const pedidoFiado = await sql`
      SELECT 
        p.id::text as id, 
        p.cliente,
        p.estado,
        p.direccion,
        p.telefono,
        p.barrio,
        (p.total - COALESCE(p.monto_pagado, 0)) as saldo_pendiente
      FROM pedidos p
      WHERE p.id = ${pedidoFiadoId} 
        AND p.estado = 'fiado'
        AND (p.total - COALESCE(p.monto_pagado, 0)) > 0
    `

    if (pedidoFiado.length > 0) {
      fiadoData = pedidoFiado[0]
      origenFiado = 'pedidos'
      console.log('[ASIGNAR COBRO] ✓ Fiado encontrado en tabla pedidos')
    } else {
      // Buscar en tabla "fiados" (importados desde CSV)
      console.log('[ASIGNAR COBRO] 🔍 Buscando en tabla fiados')
      
      const fiadoTabla = await sql`
        SELECT 
          id::text as id,
          cliente,
          COALESCE(saldo_pendiente, monto_total) as saldo_pendiente,
          estado,
          direccion,
          telefono,
          NULL as barrio
        FROM fiados
        WHERE (id::text = ${pedidoFiadoId} OR pedido_id = ${pedidoFiadoId})
          AND estado != 'pagado_completo'
          AND COALESCE(saldo_pendiente, monto_total) > 0
      `

      if (fiadoTabla.length > 0) {
        fiadoData = fiadoTabla[0]
        origenFiado = 'fiados'
        console.log('[ASIGNAR COBRO] ✓ Fiado encontrado en tabla fiados')
      }
    }

    if (!fiadoData) {
      console.error('[ASIGNAR COBRO] ❌ Fiado no encontrado')
      return NextResponse.json(
        { error: 'Fiado no encontrado o sin saldo pendiente' },
        { status: 404 }
      )
    }

    console.log('[ASIGNAR COBRO] ✓ Fiado válido:', {
      cliente: fiadoData.cliente,
      saldo: fiadoData.saldo_pendiente,
      origen: origenFiado
    })

    // ===================================================
    // PASO 2: Verificar planilla destino
    // ===================================================
    console.log('[ASIGNAR COBRO] 🔍 Buscando planilla ID:', planillaId)

    const planillaDestino = await sql`
      SELECT id, tipo_ruta, entregador, total_cargue, estado, cuadrado_en_caja
      FROM planillas
      WHERE id = ${planillaId}
    `

    if (planillaDestino.length === 0) {
      console.error('[ASIGNAR COBRO] ❌ Planilla no encontrada. ID buscado:', planillaId)
      
      // DEBUG: Mostrar qué planillas existen
      const planillasExistentes = await sql`
        SELECT id, tipo_ruta, entregador, fecha 
        FROM planillas 
        ORDER BY fecha DESC 
        LIMIT 10
      `
      console.error('[ASIGNAR COBRO] Planillas recientes:', planillasExistentes)
      
      return NextResponse.json(
        { 
          error: 'Planilla destino no encontrada',
          id_buscado: planillaId,
          debug: {
            planillas_recientes: planillasExistentes.map(p => ({ 
              id: p.id, 
              ruta: p.tipo_ruta, 
              entregador: p.entregador 
            }))
          }
        },
        { status: 404 }
      )
    }

    console.log('[ASIGNAR COBRO] ✓ Planilla encontrada:', {
      id: planillaDestino[0].id,
      ruta: planillaDestino[0].tipo_ruta,
      entregador: planillaDestino[0].entregador,
      cuadrada: planillaDestino[0].cuadrado_en_caja
    })

    const saldoPendiente = Number(fiadoData.saldo_pendiente)
    const totalCargueActual = Number(planillaDestino[0].total_cargue) || 0

    // ===================================================
    // PASO 3: Crear pedido de COBRO en la planilla destino
    // ===================================================
    const cobroId = `COB${Date.now()}${Math.random().toString(36).substring(2, 9)}`

    const ultimaSecuencia = await sql`
      SELECT COALESCE(MAX(secuencia), 0) as max_sec
      FROM pedidos
      WHERE planilla_id = ${planillaId}
    `
    const nuevaSecuencia = (ultimaSecuencia[0]?.max_sec || 0) + 1

    const pedidoFiadoIdFK = origenFiado === 'pedidos' ? pedidoFiadoId : null

    await sql`
      INSERT INTO pedidos (
        id, planilla_id, secuencia, cliente, direccion, telefono, barrio,
        total, estado, es_cobro, pedido_fiado_id, observaciones,
        created_at, updated_at
      ) VALUES (
        ${cobroId},
        ${planillaId},
        ${nuevaSecuencia},
        ${fiadoData.cliente + ' (COBRO)'},
        ${fiadoData.direccion || 'Por definir'},
        ${fiadoData.telefono || 'N/A'},
        ${fiadoData.barrio || 'N/A'},
        ${saldoPendiente},
        'pendiente',
        true,
        ${pedidoFiadoIdFK},
        ${'Cobro de fiado pendiente - Origen: ' + origenFiado},
        NOW(),
        NOW()
      )
    `

    await sql`
      INSERT INTO pedido_productos (
        pedido_id, codigo, nombre, cantidad, precio_unitario, total,
        created_at, updated_at
      ) VALUES (
        ${cobroId},
        'COBRO',
        ${'Cobro de cuenta por cobrar - ' + fiadoData.cliente},
        1,
        ${saldoPendiente},
        ${saldoPendiente},
        NOW(),
        NOW()
      )
    `

    console.log('[ASIGNAR COBRO] ✅ Pedido de cobro creado:', cobroId)

    // ===================================================
    // PASO 4: Actualizar total_cargue de la planilla
    // ===================================================
    const nuevoTotalCargue = totalCargueActual + saldoPendiente

    await sql`
      UPDATE planillas
      SET total_cargue = ${nuevoTotalCargue}, updated_at = NOW()
      WHERE id = ${planillaId}
    `

    console.log('[ASIGNAR COBRO] ✅ Cargue actualizado:', {
      anterior: totalCargueActual,
      nuevo: nuevoTotalCargue
    })

    // ===================================================
    // PASO 5: ACTUALIZAR TABLA FIADOS con tracking
    // ===================================================
    if (origenFiado === 'fiados') {
      console.log('[ASIGNAR COBRO] 📝 Actualizando tabla fiados con tracking...')
      
      await sql`
        UPDATE fiados
        SET 
          planilla_asignado_id = ${planillaId}::text,
          fecha_asignacion = NOW(),
          entregador_asignado = ${planillaDestino[0].entregador},
          updated_at = NOW()
        WHERE (id::text = ${pedidoFiadoId} OR pedido_id = ${pedidoFiadoId})
      `
      
      console.log('[ASIGNAR COBRO] ✅ Fiado marcado como asignado a:', {
        planilla: planillaId,
        entregador: planillaDestino[0].entregador
      })
    }

    console.log('[ASIGNAR COBRO] 🎉 ÉXITO COMPLETO')
    console.log('[ASIGNAR COBRO] ===== FIN =====\n')

    return NextResponse.json({
      success: true,
      mensaje: 'Cobro asignado exitosamente',
      cobro: {
        id: cobroId,
        monto: saldoPendiente,
        cliente: fiadoData.cliente,
        origen: origenFiado
      },
      planilla: {
        id: planillaDestino[0].id,
        tipo_ruta: planillaDestino[0].tipo_ruta,
        entregador: planillaDestino[0].entregador,
        total_cargue_anterior: totalCargueActual,
        total_cargue_nuevo: nuevoTotalCargue
      }
    })

  } catch (error) {
    console.error('[ASIGNAR COBRO] ❌ ERROR FATAL:', error)
    return NextResponse.json(
      { 
        error: 'Error al asignar cobro',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
