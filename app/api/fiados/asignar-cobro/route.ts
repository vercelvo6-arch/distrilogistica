import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    console.log('[API asignar-cobro] 📥 Datos recibidos:', body)
    
    const { pedidoFiadoId, planillaDestinoId } = body

    if (!pedidoFiadoId || !planillaDestinoId) {
      console.error('[API asignar-cobro] ❌ Validación falló:', {
        pedidoFiadoId,
        planillaDestinoId
      })
      return NextResponse.json(
        { error: 'Datos incompletos: pedidoFiadoId y planillaDestinoId son requeridos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Verificar que el pedido fiado existe
    const pedidoFiado = await sql`
      SELECT 
        p.id, 
        p.cliente, 
        p.saldo_pendiente,
        p.estado,
        p.direccion,
        p.telefono,
        p.barrio
      FROM pedidos p
      WHERE p.id = ${pedidoFiadoId} 
        AND p.estado = 'fiado'
        AND p.saldo_pendiente > 0
    `

    if (pedidoFiado.length === 0) {
      console.error('[API asignar-cobro] ❌ Pedido fiado no encontrado:', pedidoFiadoId)
      return NextResponse.json(
        { error: 'Pedido fiado no encontrado o sin saldo pendiente' },
        { status: 404 }
      )
    }

    // Verificar que la planilla destino existe y está disponible
    const planillaDestino = await sql`
      SELECT id, tipo_ruta, entregador, total_cargue, estado, cuadrado_en_caja
      FROM planillas
      WHERE id = ${planillaDestinoId}
        AND (cuadrado_en_caja IS NULL OR cuadrado_en_caja = false)
    `

    if (planillaDestino.length === 0) {
      console.error('[API asignar-cobro] ❌ Planilla no encontrada o ya cuadrada:', planillaDestinoId)
      return NextResponse.json(
        { error: 'Planilla destino no encontrada o ya fue cuadrada en caja' },
        { status: 404 }
      )
    }

    const saldoPendiente = Number(pedidoFiado[0].saldo_pendiente)
    const totalCargueActual = Number(planillaDestino[0].total_cargue) || 0

    // Generar ID único para el pedido de cobro
    const cobroId = `COB${Date.now()}${Math.random().toString(36).substring(2, 9)}`

    // Crear el pedido de COBRO
    await sql`
      INSERT INTO pedidos (
        id,
        planilla_id,
        cliente,
        direccion,
        telefono,
        barrio,
        total,
        estado,
        es_cobro,
        pedido_fiado_id,
        observaciones,
        created_at,
        updated_at
      ) VALUES (
        ${cobroId},
        ${planillaDestinoId},
        ${pedidoFiado[0].cliente + ' (COBRO)'},
        ${pedidoFiado[0].direccion || null},
        ${pedidoFiado[0].telefono || null},
        ${pedidoFiado[0].barrio || null},
        ${saldoPendiente},
        'pendiente',
        true,
        ${pedidoFiadoId},
        ${'Cobro de fiado pendiente'},
        NOW(),
        NOW()
      )
    `

    // Agregar un "producto" descriptivo al cobro
    await sql`
      INSERT INTO pedido_productos (
        pedido_id,
        codigo,
        nombre,
        cantidad,
        precio_unitario,
        total,
        created_at,
        updated_at
      ) VALUES (
        ${cobroId},
        'COBRO',
        ${'Cobro de cuenta por cobrar - ' + pedidoFiado[0].cliente},
        1,
        ${saldoPendiente},
        ${saldoPendiente},
        NOW(),
        NOW()
      )
    `

    // Actualizar el total_cargue de la planilla destino
    const nuevoTotalCargue = totalCargueActual + saldoPendiente

    await sql`
      UPDATE planillas
      SET 
        total_cargue = ${nuevoTotalCargue},
        updated_at = NOW()
      WHERE id = ${planillaDestinoId}
    `

    console.log('[API asignar-cobro] ✅ Cobro asignado exitosamente:', {
      cobroId,
      pedidoFiadoId,
      planillaDestinoId: planillaDestinoId,
      montoCobro: saldoPendiente,
      totalCargueAnterior: totalCargueActual,
      nuevoTotalCargue
    })

    return NextResponse.json({
      success: true,
      mensaje: 'Cobro asignado exitosamente',
      cobro: {
        id: cobroId,
        monto: saldoPendiente,
        cliente: pedidoFiado[0].cliente
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
    console.error('[API asignar-cobro] ❌ Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al asignar cobro',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
