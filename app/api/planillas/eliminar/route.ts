import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { registrarSnapshotPlanilla } from "@/lib/eliminaciones-historial"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { planillaId } = await request.json()

    if (!planillaId) {
      return NextResponse.json(
        { error: "Falta el ID de la planilla" },
        { status: 400 }
      )
    }

    const sql = getDB()

    // 1. Verificar que la planilla existe y NO está cuadrada
    const planillaCheck = await sql`
      SELECT id, cuadrado_en_caja, estado, tipo_ruta
      FROM planillas 
      WHERE id = ${planillaId}
    `

    if (!planillaCheck || planillaCheck.length === 0) {
      return NextResponse.json(
        { error: "Planilla no encontrada" },
        { status: 404 }
      )
    }

    const planilla = planillaCheck[0]

    // Prevenir eliminación de planillas cuadradas
    if (planilla.cuadrado_en_caja) {
      return NextResponse.json(
        { error: "No se puede eliminar una planilla que ya fue cuadrada en caja" },
        { status: 400 }
      )
    }

    console.log(`[API /planillas/eliminar] Eliminando planilla ${planillaId} (Ruta: ${planilla.tipo_ruta})`)

    // 2. Obtener todos los pedidos de esta planilla (para el conteo de respuesta)
    const pedidos = await sql`
      SELECT id FROM pedidos WHERE planilla_id = ${planillaId}
    `

    console.log(`[API /planillas/eliminar] ${pedidos.length} pedidos encontrados`)

    await sql`BEGIN`
    try {
      // 3. Respaldar planilla + pedidos + productos antes de borrar (permite restaurar después)
      await registrarSnapshotPlanilla(
        sql,
        planillaId,
        { id: session.user.id, nombre: session.user.nombre },
        "planillas/eliminar"
      )

      // 4. Eliminar productos de cada pedido
      await sql`
        DELETE FROM pedido_productos
        WHERE pedido_id IN (SELECT id FROM pedidos WHERE planilla_id = ${planillaId})
      `

      // 5. Eliminar todos los pedidos
      await sql`
        DELETE FROM pedidos WHERE planilla_id = ${planillaId}
      `

      // 6. Eliminar la planilla
      await sql`
        DELETE FROM planillas WHERE id = ${planillaId}
      `

      await sql`COMMIT`
    } catch (txError) {
      await sql`ROLLBACK`
      throw txError
    }

    console.log(`[API /planillas/eliminar] ✓ Planilla ${planillaId} eliminada exitosamente`)

    return NextResponse.json({
      success: true,
      mensaje: `Planilla ${planilla.tipo_ruta} eliminada exitosamente`,
      planillaId,
      pedidosEliminados: pedidos.length
    })

  } catch (error) {
    console.error("[API /planillas/eliminar] ERROR:", error)
    return NextResponse.json(
      {
        error: "Error al eliminar planilla",
        details: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    )
  }
}
