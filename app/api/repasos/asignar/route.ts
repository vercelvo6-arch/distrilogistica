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
    // CRÍTICO: Estado = 'entregado' para que NO aparezca en alistamiento
    // =============================================
    console.log('[ASIGNAR REPASO] 📝 Actualizando pedido...')
    
    await sql`
      UPDATE pedidos
      SET 
        planilla_id = ${planillaDestinoId},
        estado = 'entregado',
        fecha_entrega = NOW(),
        observaciones = COALESCE(observaciones || ' | ', '') || 
          'REPASO de ruta ' || ${pedido[0].ruta_origen} || 
          ' reasignado el ' || NOW()::date,
        updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log('[ASIGNAR REPASO] ✅ Pedido reasignado con estado "entregado"')

    // =============================================
    // PASO D: Marcar productos como "ya_en_ruta"
    // CRÍTICO: Para que alistador NO los vuelva a entregar
    // =============================================
    console.log('[ASIGNAR REPASO] 📝 Marcando productos como "ya_en_ruta"...')
    
    const productosActualizados = await sql`
      UPDATE pedido_productos
      SET 
        estado_alistamiento = 'ya_en_ruta',
        observaciones = COALESCE(observaciones || ' | ', '') || 
          'REPASO - Mercancía ya en poder del entregador',
        updated_at = NOW()
      WHERE pedido_id = ${pedidoId}
      RETURNING id, codigo, nombre
    `

    console.log('[ASIGNAR REPASO] ✅ Productos marcados:', productosActualizados.length)

    // =============================================
    // PASO E: Actualizar total_cargue de planilla destino
    // =============================================
    const nuevoTotalCargue = totalCargueActual + totalPedido
    
    console.log('[ASIGNAR REPASO] 📝 Actualizando cargue de planilla destino...')
    console.log('[ASIGNAR REPASO]   Cargue anterior:', totalCargueActual)
    console.log('[ASIGNAR REPASO]   + Repaso:', totalPedido)
    console.log('[ASIGNAR REPASO]   = Nuevo cargue:', nuevoTotalCargue)
    
    await sql`
      UPDATE planillas
      SET 
        total_cargue = ${nuevoTotalCargue},
        updated_at = NOW()
      WHERE id = ${planillaDestinoId}
    `

    console.log('[ASIGNAR REPASO] ✅ Cargue actualizado correctamente')

    // =============================================
    // RESPUESTA EXITOSA
    // =============================================
    const resultado = {
      success: true,
      mensaje: '✅ Repaso asignado. La mercancía ya está en poder del entregador.',
      detalles: {
        pedido: {
          id: pedidoId,
          cliente: pedido[0].cliente,
          total: totalPedido,
          origen: pedido[0].ruta_origen,
          entregador_origen: pedido[0].entregador_origen
        },
        planilla_destino: {
          id: planillaDestino[0].id,
          tipo_ruta: planillaDestino[0].tipo_ruta,
          entregador: planillaDestino[0].entregador,
          total_cargue_anterior: totalCargueActual,
          total_cargue_nuevo: nuevoTotalCargue
        },
        productos_marcados: productosActualizados.length
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
