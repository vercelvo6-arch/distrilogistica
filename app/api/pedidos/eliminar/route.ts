import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { registrarSnapshotPedido } from "@/lib/eliminaciones-historial"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
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

    await sql`BEGIN`
    let planillaResult
    try {
      // 2. Respaldar el pedido + sus productos antes de borrar
      await registrarSnapshotPedido(
        sql,
        pedidoId,
        { id: session?.user?.id || "desconocido", nombre: session?.user?.nombre || "desconocido" },
        "pedidos/eliminar"
      )

      // 3. Eliminar los productos del pedido
      await sql`
        DELETE FROM pedido_productos WHERE pedido_id = ${pedidoId}
      `

      // 4. Eliminar el pedido
      await sql`
        DELETE FROM pedidos WHERE id = ${pedidoId}
      `

      // 5. Actualizar el total_cargue de la planilla
      await sql`
        UPDATE planillas
        SET total_cargue = total_cargue - ${totalPedido},
            updated_at = NOW()
        WHERE id = ${planillaId}
      `

      // 6. Obtener el nuevo total
      planillaResult = await sql`
        SELECT total_cargue FROM planillas WHERE id = ${planillaId}
      `

      await sql`COMMIT`
    } catch (txError) {
      await sql`ROLLBACK`
      throw txError
    }

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
