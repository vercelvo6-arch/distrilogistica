import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  console.log('[API asignar-cobro] ===== INICIO =====')
  
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

    // ===================================================
    // PASO 1: Buscar el fiado en AMBAS tablas
    // ===================================================
    let fiadoData: any = null
    let origenFiado: 'pedidos' | 'fiados' = 'pedidos'

    // Intentar primero en tabla "pedidos"
    console.log('[API asignar-cobro] 🔍 Buscando en tabla pedidos:', pedidoFiadoId)
    const pedidoFiado = await sql`
      SELECT 
        p.id::text as id, 
        p.cliente,
        p.estado,
        p.direccion,
        p.telefono,
        p.barrio,
        -- Calcular saldo en lugar de confiar en la columna (puede ser NULL)
        (p.total - COALESCE(p.monto_pagado, 0)) as saldo_pendiente
      FROM pedidos p
      WHERE p.id = ${pedidoFiadoId} 
        AND p.estado = 'fiado'
        AND (p.total - COALESCE(p.monto_pagado, 0)) > 0
    `

    if (pedidoFiado.length > 0) {
      fiadoData = pedidoFiado[0]
      origenFiado = 'pedidos'
      console.log('[API asignar-cobro] ✓ Fiado encontrado en tabla pedidos')
    } else {
      // Buscar en tabla "fiados" (importados desde CSV)
      console.log('[API asignar-cobro] 🔍 No encontrado en pedidos, buscando en tabla fiados:', pedidoFiadoId)
      
      // El ID puede venir como número o como string
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
        console.log('[API asignar-cobro] ✓ Fiado encontrado en tabla fiados')
      }
    }

    if (!fiadoData) {
      console.error('[API asignar-cobro] ❌ Fiado no encontrado en ninguna tabla:', pedidoFiadoId)
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
      WHERE id = ${planillaDestinoId}
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
      WHERE planilla_id = ${planillaDestinoId}
    `
    const nuevaSecuencia = (ultimaSecuencia[0]?.max_sec || 0) + 1

    // pedido_fiado_id solo aplica cuando el origen es tabla "pedidos"
    // Si viene de tabla "fiados", la FK no aplica → NULL
    const pedidoFiadoIdFK = origenFiado === 'pedidos' ? pedidoFiadoId : null

    await sql`
      INSERT INTO pedidos (
        id, planilla_id, secuencia, cliente, direccion, telefono, barrio,
        total, estado, es_cobro, pedido_fiado_id, observaciones,
        created_at, updated_at
      ) VALUES (
        ${cobroId},
        ${planillaDestinoId},
        ${nuevaSecuencia},
        ${fiadoData.cliente + ' (COBRO)'},
        ${fiadoData.direccion || 'Por definir'},
        ${fiadoData.telefono || 'N/A'},
        ${fiadoData.barrio || 'N/A'},
        ${saldoPendiente},
        'pendiente',
        true,
        ${pedidoFiadoIdFK},
        ${'Cobro de fiado pendiente'},
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

    // ===================================================
    // PASO 4: Actualizar total_cargue de la planilla
    // ===================================================
    const nuevoTotalCargue = totalCargueActual + saldoPendiente

    await sql`
      UPDATE planillas
      SET total_cargue = ${nuevoTotalCargue}, updated_at = NOW()
      WHERE id = ${planillaDestinoId}
    `

    // ===================================================
    // PASO 5: Si el fiado viene de tabla "fiados",
    // actualizar planilla_id para que aparezca en FiadosAsignadosSection
    // ===================================================
    if (origenFiado === 'fiados') {
      console.log('[API asignar-cobro] 📝 Actualizando planilla_id en tabla fiados:', pedidoFiadoId)
      await sql`
        UPDATE fiados
        SET planilla_id = ${Number(planillaDestinoId)}, updated_at = NOW()
        WHERE (id::text = ${pedidoFiadoId} OR pedido_id = ${pedidoFiadoId})
      `
      console.log('[API asignar-cobro] ✓ planilla_id actualizado en tabla fiados')
    }

    console.log('[API asignar-cobro] ✅ ÉXITO:', {
      cobroId, origen: origenFiado, saldoPendiente, nuevoTotalCargue
    })

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
    console.error('[API asignar-cobro] ❌ ERROR FATAL:', error)
    return NextResponse.json(
      { 
        error: 'Error al asignar cobro',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
