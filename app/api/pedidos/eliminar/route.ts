import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { pedidoId, planillaId } = await request.json()

    // Validar datos
    if (!pedidoId || !planillaId) {
      return NextResponse.json(
        { error: "Faltan datos requeridos: pedidoId y planillaId" },
        { status: 400 }
      )
    }

    // 1. Obtener el total del pedido antes de eliminarlo
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("total")
      .eq("id", pedidoId)
      .single()

    if (pedidoError || !pedido) {
      return NextResponse.json(
        { error: "Pedido no encontrado" },
        { status: 404 }
      )
    }

    const totalPedido = Number(pedido.total) || 0

    // 2. Eliminar los productos del pedido
    const { error: productosError } = await supabase
      .from("productos_pedido")
      .delete()
      .eq("pedido_id", pedidoId)

    if (productosError) {
      console.error("Error eliminando productos:", productosError)
      return NextResponse.json(
        { error: "Error al eliminar productos del pedido" },
        { status: 500 }
      )
    }

    // 3. Eliminar el pedido
    const { error: deletePedidoError } = await supabase
      .from("pedidos")
      .delete()
      .eq("id", pedidoId)

    if (deletePedidoError) {
      console.error("Error eliminando pedido:", deletePedidoError)
      return NextResponse.json(
        { error: "Error al eliminar el pedido" },
        { status: 500 }
      )
    }

    // 4. Obtener el total actual de la planilla
    const { data: planilla, error: planillaError } = await supabase
      .from("planillas")
      .select("total_cargue")
      .eq("id", planillaId)
      .single()

    if (planillaError || !planilla) {
      console.error("Error obteniendo planilla:", planillaError)
      return NextResponse.json(
        { error: "Planilla no encontrada" },
        { status: 404 }
      )
    }

    // 5. Actualizar el total_cargue de la planilla
    const nuevoTotalCargue = Number(planilla.total_cargue) - totalPedido

    const { error: updatePlanillaError } = await supabase
      .from("planillas")
      .update({ total_cargue: nuevoTotalCargue })
      .eq("id", planillaId)

    if (updatePlanillaError) {
      console.error("Error actualizando planilla:", updatePlanillaError)
      return NextResponse.json(
        { error: "Error al actualizar el cargue de la planilla" },
        { status: 500 }
      )
    }

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
