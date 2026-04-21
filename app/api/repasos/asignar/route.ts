import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  console.log('\n🔄 [ASIGNAR REPASO] ===== INICIO =====')
  
  try {
    const session = await getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    
    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    console.log('[ASIGNAR REPASO] 📥 Datos recibidos:', body)
    
    const { pedidoId, planillaDestinoId } = body

    if (!pedidoId || !planillaDestinoId) {
      console.error('[ASIGNAR REPASO] ❌ Validación falló')
      return NextResponse.json(
        { error: 'Datos incompletos: pedidoId y planillaDestinoId son requeridos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // =============================================
    // PASO A: Verificar que el pedido existe y es un repaso
    // =============================================
    console.log('[ASIGNAR REPASO] 🔍 Buscando pedido:', pedidoId)
    
    const pedido = await sql`
      SELECT 
        p.id, 
        p.total, 
        p.estado, 
        p.planilla_id,
        p.cliente,
        pl.entregador as entregador_origen,
        pl.tipo_ruta as ruta_origen
      FROM pedidos p
      LEFT JOIN planillas pl ON pl.id = p.planilla_id
      WHERE p.id = ${pedidoId} AND p.estado = 'repaso'
    `

    if (pedido.length === 0) {
      console.error('[ASIGNAR REPASO] ❌ Pedido no encontrado')
      return NextResponse.json(
        { error: 'Pedido no encontrado o no es un repaso' },
        { status: 404 }
      )
    }

    console.log('[ASIGNAR REPASO] ✅ Pedido encontrado:', {
      cliente: pedido[0].cliente,
      total: pedido[0].total,
      origen: pedido[0].ruta_origen
    })

    // =============================================
    // PASO B: Verificar planilla destino
    // =============================================
    console.log('[ASIGNAR REPASO] 🔍 Buscando planilla destino:', planillaDestinoId)
    
    const planillaDestino = await sql`
      SELECT id, tipo_ruta, total_cargue, estado, cuadrado_en_caja, entregador
      FROM planillas
      WHERE id = ${planillaDestinoId}
        AND (cuadrado_en_caja IS NULL OR cuadrado_en_caja = false)
    `

    if (planillaDestino.length === 0) {
      console.error('[ASIGNAR REPASO] ❌ Planilla no encontrada o ya cuadrada')
      return NextResponse.json(
        { error: 'Planilla destino no encontrada o ya fue cuadrada en caja' },
        { status: 404 }
      )
    }

    console.log('[ASIGNAR REPASO] ✅ Planilla destino encontrada:', {
      ruta: planillaDestino[0].tipo_ruta,
      entregador: planillaDestino[0].entregador,
      cargue_actual: planillaDestino[0].total_cargue
    })

    const totalPedido = Number(pedido[0].total)
    const totalCargueActual = Number(planillaDestino[0].total_cargue) || 0

    // =============================================
    // PASO C: Reasignar pedido a nueva planilla
    // 
    // ✅ FIX CRÍTICO: estado = 'pendiente' (NO 'entregado' ni 'repaso')
    //
    // RAZÓN: El pedido debe llegar como un pedido NORMAL a la planilla
    // destino para que:
    //   1. El entregador lo vea como pedido pendiente de entregar
    //   2. Caja lo cuente como parte del cargue a recibir en efectivo
    //   3. El dinero quede registrado correctamente al cuadrar caja
    //
    // Si llega como 'repaso' → caja lo resta del cargue y el entregador
    //   se queda con el dinero sin rendir cuentas. ← BUG ANTERIOR
    // Si llega como 'entregado' → caja asume que ya se cobró sin que
    //   el entregador haya rendido cuentas. ← TAMBIÉN INCORRECTO
    // =============================================
    console.log('[ASIGNAR REPASO] 📝 Actualizando pedido...')
    
    await sql`
      UPDATE pedidos
      SET 
        planilla_id = ${planillaDestinoId},
        estado = 'pendiente',
        observaciones = COALESCE(observaciones || ' | ', '') || 
          'REPASO de ruta ' || ${pedido[0].ruta_origen} || 
          ' reasignado el ' || NOW()::date,
        updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log('[ASIGNAR REPASO] ✅ Pedido reasignado con estado "pendiente"')

    // =============================================
    // PASO D: Resetear productos a estado 'pendiente'
    //
    // ✅ FIX: Los productos deben quedar 'pendiente' (NO 'ya_en_ruta')
    // para que el entregador los vea en su planilla y deba rendir el dinero
    // =============================================
    console.log('[ASIGNAR REPASO] 📝 Reseteando productos a pendiente...')
    
    const productosActualizados = await sql`
      UPDATE pedido_productos
      SET 
        estado_alistamiento = 'pendiente',
        observaciones = COALESCE(observaciones || ' | ', '') || 
          'REPASO - Mercancía reasignada desde ruta ' || ${pedido[0].ruta_origen},
        updated_at = NOW()
      WHERE pedido_id = ${pedidoId}
      RETURNING id, codigo, nombre
    `

    console.log('[ASIGNAR REPASO] ✅ Productos reseteados a pendiente:', productosActualizados.length)

    // =============================================
    // PASO E: Actualizar total_cargue de planilla ORIGEN
    // Recalcular correctamente sin el pedido que se movió
    // =============================================
    const planillaOrigenId = pedido[0].planilla_id

    const totalesOrigen = await sql`
      SELECT 
        COALESCE(SUM(total), 0) as total_cargue,
        COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total ELSE 0 END), 0) as total_entregado,
        COALESCE(SUM(CASE WHEN estado = 'fiado' THEN total ELSE 0 END), 0) as total_fiado,
        COALESCE(SUM(CASE WHEN estado = 'repaso' THEN total ELSE 0 END), 0) as total_repaso,
        COALESCE(SUM(CASE WHEN estado = 'devolucion' THEN total ELSE 0 END), 0) as total_devolucion
      FROM pedidos
      WHERE planilla_id = ${planillaOrigenId}
    `

    await sql`
      UPDATE planillas
      SET 
        total_cargue = ${totalesOrigen[0].total_cargue},
        total_entregado = ${totalesOrigen[0].total_entregado},
        total_fiado = ${totalesOrigen[0].total_fiado},
        total_repaso = ${totalesOrigen[0].total_repaso},
        total_devolucion = ${totalesOrigen[0].total_devolucion},
        updated_at = NOW()
      WHERE id = ${planillaOrigenId}
    `

    console.log('[ASIGNAR REPASO] ✅ Totales de planilla ORIGEN recalculados')

    // =============================================
    // PASO F: Actualizar total_cargue de planilla DESTINO
    // Recalcular correctamente incluyendo el nuevo pedido
    // =============================================
    const totalesDestino = await sql`
      SELECT 
        COALESCE(SUM(total), 0) as total_cargue,
        COALESCE(SUM(CASE WHEN estado = 'entregado' THEN total ELSE 0 END), 0) as total_entregado,
        COALESCE(SUM(CASE WHEN estado = 'fiado' THEN total ELSE 0 END), 0) as total_fiado,
        COALESCE(SUM(CASE WHEN estado = 'repaso' THEN total ELSE 0 END), 0) as total_repaso,
        COALESCE(SUM(CASE WHEN estado = 'devolucion' THEN total ELSE 0 END), 0) as total_devolucion
      FROM pedidos
      WHERE planilla_id = ${planillaDestinoId}
    `

    await sql`
      UPDATE planillas
      SET 
        total_cargue = ${totalesDestino[0].total_cargue},
        total_entregado = ${totalesDestino[0].total_entregado},
        total_fiado = ${totalesDestino[0].total_fiado},
        total_repaso = ${totalesDestino[0].total_repaso},
        total_devolucion = ${totalesDestino[0].total_devolucion},
        updated_at = NOW()
      WHERE id = ${planillaDestinoId}
    `

    console.log('[ASIGNAR REPASO] ✅ Totales de planilla DESTINO recalculados')
    console.log('[ASIGNAR REPASO]   Nuevo cargue destino:', totalesDestino[0].total_cargue)

    // =============================================
    // RESPUESTA EXITOSA
    // =============================================
    const resultado = {
      success: true,
      mensaje: '✅ Repaso asignado correctamente. El pedido aparecerá como pendiente en la planilla destino.',
      detalles: {
        pedido: {
          id: pedidoId,
          cliente: pedido[0].cliente,
          total: totalPedido,
          origen: pedido[0].ruta_origen,
          entregador_origen: pedido[0].entregador_origen,
          nuevo_estado: 'pendiente'
        },
        planilla_destino: {
          id: planillaDestino[0].id,
          tipo_ruta: planillaDestino[0].tipo_ruta,
          entregador: planillaDestino[0].entregador,
          total_cargue_anterior: totalCargueActual,
          total_cargue_nuevo: Number(totalesDestino[0].total_cargue)
        },
        productos_actualizados: productosActualizados.length
      }
    }

    console.log('[ASIGNAR REPASO] 🎉 ÉXITO:', resultado)
    console.log('[ASIGNAR REPASO] ===== FIN =====\n')

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('[ASIGNAR REPASO] ❌ ERROR FATAL:', error)
    return NextResponse.json(
      { 
        error: 'Error al asignar repaso',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
