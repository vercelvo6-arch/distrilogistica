import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"

export const dynamic = "force-dynamic"

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

    const sql = getDB()

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
      DELETE FROM pedido_productos WHERE pedido_id = ${pedidoId}
    `

    // 3. Eliminar el pedido
    await sql`
      DELETE FROM pedidos WHERE id = ${pedidoId}
    `

    // 4. Actualizar el total_cargue de la planilla
    await sql`
      UPDATE planillas 
      SET total_cargue = total_cargue - ${totalPedido},
          updated_at = NOW()
      WHERE id = ${planillaId}
    `

    // 5. Obtener el nuevo total
    const planillaResult = await sql`
      SELECT total_cargue FROM planillas WHERE id = ${planillaId}
    `

    const nuevoTotalCargue = Number(planillaResult[0].total_cargue) || 0

    console.log(`[API /pedidos/eliminar] ✓ Pedido ${pedidoId} eliminado. Total restado: ${totalPedido}`)

    return NextResponse.json({
      success: true,
      mensaje: "Pedido eliminado exitosamente",
      pedidoId,
      totalEliminado: totalPedido,
      nuevoTotalCargue,
    })
  } catch (error) {
    console.error("[API /pedidos/eliminar] ERROR:", error)
    return NextResponse.json(
      { error: "Error interno del servidor: " + (error instanceof Error ? error.message : "Unknown error") },
      { status: 500 }
    )
  }
}
