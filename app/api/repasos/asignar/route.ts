import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    
    // ✅ AGREGAR LOGGING PARA DEBUG
    console.log('[API asignar-repaso] 📥 Datos recibidos:', body)
    
    const { pedidoId, planillaDestinoId } = body

    // ✅ VALIDACIÓN MEJORADA - Soportar IDs alfanuméricos
    if (!pedidoId || !planillaDestinoId) {
      console.error('[API asignar-repaso] ❌ Validación falló:', {
        pedidoId,
        planillaDestinoId,
        pedidoIdTipo: typeof pedidoId,
        planillaDestinoIdTipo: typeof planillaDestinoId
      })
      return NextResponse.json(
        { error: 'Datos incompletos: pedidoId y planillaDestinoId son requeridos' },
        { status: 400 }
      )
    }

    // Convertir planillaDestinoId a número
    const planillaIdNum = Number(planillaDestinoId)
    
    if (isNaN(planillaIdNum) || planillaIdNum <= 0) {
      console.error('[API asignar-repaso] ❌ planillaDestinoId inválido:', {
        planillaDestinoId,
        planillaIdNum
      })
      return NextResponse.json(
        { error: 'planillaDestinoId debe ser un número válido' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // ✅ ACEPTAR pedidoId como STRING (UUID o alfanumérico)
    const pedido = await sql`
      SELECT id, total, estado, planilla_id
      FROM pedidos
      WHERE id = ${pedidoId} AND estado = 'repaso'
    `

    if (pedido.length === 0) {
      console.error('[API asignar-repaso] ❌ Pedido no encontrado:', pedidoIdNum)
      return NextResponse.json(
        { error: 'Pedido no encontrado o no es un repaso' },
        { status: 404 }
      )
    }

    // ✅ MEJORAR VALIDACIÓN - Aceptar cualquier planilla que NO esté cuadrada
    const planillaDestino = await sql`
      SELECT id, tipo_ruta, total_cargue, estado, cuadrado_en_caja
      FROM planillas
      WHERE id = ${planillaIdNum}
        AND (cuadrado_en_caja IS NULL OR cuadrado_en_caja = false)
    `

    if (planillaDestino.length === 0) {
      console.error('[API asignar-repaso] ❌ Planilla no encontrada o ya cuadrada:', planillaIdNum)
      return NextResponse.json(
        { error: 'Planilla destino no encontrada o ya fue cuadrada en caja' },
        { status: 404 }
      )
    }

    const totalPedido = Number(pedido[0].total)
    const totalCargueActual = Number(planillaDestino[0].total_cargue) || 0

    // Actualizar el pedido para cambiar su planilla_id y estado
    await sql`
      UPDATE pedidos
      SET 
        planilla_id = ${planillaIdNum},
        estado = 'pendiente',
        updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    // Actualizar el total_cargue de la planilla destino
    const nuevoTotalCargue = totalCargueActual + totalPedido
    
    await sql`
      UPDATE planillas
      SET 
        total_cargue = ${nuevoTotalCargue},
        updated_at = NOW()
      WHERE id = ${planillaIdNum}
    `

    console.log('[API asignar-repaso] ✅ Repaso asignado exitosamente:', {
      pedidoId: pedidoId,
      planillaDestinoId: planillaIdNum,
      totalPedido,
      totalCargueAnterior: totalCargueActual,
      nuevoTotalCargue
    })

    return NextResponse.json({
      success: true,
      mensaje: 'Repaso asignado exitosamente',
      planilla: {
        id: planillaDestino[0].id,
        tipo_ruta: planillaDestino[0].tipo_ruta,
        total_cargue_anterior: totalCargueActual,
        total_cargue_nuevo: nuevoTotalCargue
      }
    })

  } catch (error) {
    console.error('[API asignar-repaso] ❌ Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al asignar repaso',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
