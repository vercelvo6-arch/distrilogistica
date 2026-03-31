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

    if (!pedidoFiadoId || !planillaDestinoId) {
      return NextResponse.json(
        { error: 'Datos incompletos: pedidoFiadoId y planillaDestinoId son requeridos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Limpiar prefijo PLN del ID de planilla
    const planillaDestinoIdClean = String(planillaDestinoId).replace(/^PLN/i, '')
    console.log('[ASIGNAR COBRO] Planilla destino:', planillaDestinoIdClean)

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

    // ===================================================
    // PASO 2: Verificar planilla destino
    // ===================================================
    const planillaDestino = await sql`
      SELECT id, tipo_ruta, entregador, total_cargue, estado, cuadrado_en_caja
      FROM planillas
      WHERE id = ${planillaDestinoIdClean}
        AND (cuadrado_en_caja IS NULL OR cuadrado_en_caja = false)
    `

    if (planillaDestino.length === 0) {
      return NextResponse.json(
        { error: 'Planilla destino no encontrada o ya fue cuadrada en caja' },
        { status: 404 }
      )
    }

    const saldoPendiente = Number(fiadoData.saldo_pendiente)
    const totalCargueActual = Number(planillaDestino[0].total_cargue) || 0

    // ===================================================
    // PASO 3: Crear pedido de COBRO en la planilla destino
    // ===================================================
    const cobroId = `COB${Date.now()}${Math.random().toString(36).substring(2, 9)}`

    const ultimaSecuencia = await sql`
      SELECT COALESCE(MAX(secuencia), 0) as max_sec
      FROM pedidos
      WHERE planilla_id = ${planillaDestinoIdClean}
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
        ${planillaDestinoIdClean},
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
      WHERE id = ${planillaDestinoIdClean}
    `

    console.log('[ASIGNAR COBRO] ✅ Cargue actualizado:', {
      anterior: totalCargueActual,
      nuevo: nuevoTotalCargue
    })

    // ===================================================
    // PASO 5: 🔥 ACTUALIZAR TABLA FIADOS con tracking
    // ===================================================
    if (origenFiado === 'fiados') {
      console.log('[ASIGNAR COBRO] 📝 Actualizando tabla fiados con tracking...')
      
      await sql`
        UPDATE fiados
        SET 
          planilla_asignado_id = ${Number(planillaDestinoIdClean)},
          fecha_asignacion = NOW(),
          entregador_asignado = ${planillaDestino[0].entregador},
          updated_at = NOW()
        WHERE (id::text = ${pedidoFiadoId} OR pedido_id = ${pedidoFiadoId})
      `
      
      console.log('[ASIGNAR COBRO] ✅ Fiado marcado como asignado a:', {
        planilla: planillaDestinoIdClean,
        entregador: planillaDestino[0].entregador
      })
    }

    console.log('[ASIGNAR COBRO] 🎉 ÉXITO')
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
