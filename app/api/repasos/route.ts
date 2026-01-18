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
    const { pedidoId, planillaDestinoId } = body

    if (!pedidoId || !planillaDestinoId) {
      return NextResponse.json(
        { error: 'Datos incompletos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Verificar que el pedido existe y es un repaso
    const pedido = await sql`
      SELECT id, total, estado, planilla_id
      FROM pedidos
      WHERE id = ${pedidoId} AND estado = 'repaso'
    `

    if (pedido.length === 0) {
      return NextResponse.json(
        { error: 'Pedido no encontrado o no es un repaso' },
        { status: 404 }
      )
    }

    // Verificar que la planilla destino existe y está activa
    const planillaDestino = await sql`
      SELECT id, tipo_ruta, total_cargue, estado
      FROM planillas
      WHERE id = ${planillaDestinoId}
        AND estado IN ('activo', 'pendiente', 'alistado')
    `

    if (planillaDestino.length === 0) {
      return NextResponse.json(
        { error: 'Planilla destino no encontrada o no está disponible' },
        { status: 404 }
      )
    }

    const totalPedido = Number(pedido[0].total)
    const totalCargueActual = Number(planillaDestino[0].total_cargue) || 0

    // Actualizar el pedido para cambiar su planilla_id y estado
    await sql`
      UPDATE pedidos
      SET 
        planilla_id = ${planillaDestinoId},
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
      WHERE id = ${planillaDestinoId}
    `

    console.log('[API asignar-repaso] ✓ Repaso asignado exitosamente:', {
      pedidoId,
      planillaDestinoId,
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
    console.error('[API asignar-repaso] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al asignar repaso',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
