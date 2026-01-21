import { NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

export async function POST(request: NextRequest) {
  try {
    const { pedidoId, planillaId } = await request.json()

    // Validar datos
    if (!pedidoId || !planillaId) {
      return NextResponse.json(
        { error: "Faltan datos requeridos: pedidoId y planillaId" },
        { status: 400 }
      )
    }

    const sql = neon(process.env.DATABASE_URL!)

    // 1. Obtener el total del pedido antes de eliminarlo
    const pedidoResult = await sql`
      SELECT total FROM pedidos WHERE id = ${pedidoId}
    `

    if (!pedidoResult || pedidoResult.length === 0) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 }
      )
    }

    const totalPedido = Number(pedidoResult[0].total) || 0

    // 2. Eliminar los productos del pedido
    await sql`
      DELETE FROM productos_pedido WHERE pedido_id = ${pedidoId}
    `

    // 3. Eliminar el pedido
    await sql`
      DELETE FROM pedidos WHERE id = ${pedidoId}
    `

    // 4. Obtener el total actual de la planilla
    const planillaResult = await sql`
      SELECT total_cargue FROM planillas WHERE id = ${planillaId}
    `

    if (!planillaResult || planillaResult.length === 0) {
      return NextResponse.json(
        { error: "Planilla no encontrada" },
        { status: 404 }
      )
    }

    // 5. Actualizar el total_cargue de la planilla
    const nuevoTotalCargue = Number(planillaResult[0].total_cargue) - totalPedido

    await sql`
      UPDATE planillas 
      SET total_cargue = ${nuevoTotalCargue}
      WHERE id = ${planillaId}
    `

    return NextResponse.json({
      success: true,
      mensaje: "Pedido eliminado exitosamente",
      pedidoId,
      totalEliminado: totalPedido,
      nuevoTotalCargue,
    })
  } catch (error) {
    console.error("Error en /api/pedidos/eliminar:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
