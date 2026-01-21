import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { planillaId, nuevaFecha } = await request.json()

    if (!planillaId || !nuevaFecha) {
      return NextResponse.json(
        { error: "Faltan datos: planillaId y nuevaFecha son requeridos" },
        { status: 400 }
      )
    }

    // Validar formato de fecha
    const fechaValida = /^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha)
    if (!fechaValida) {
      return NextResponse.json(
        { error: "Formato de fecha inválido. Use YYYY-MM-DD" },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Verificar que la planilla existe
    const planillaCheck = await sql`
      SELECT id, fecha, tipo_ruta, cuadrado_en_caja
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
    const fechaAnterior = planilla.fecha

    // Prevenir cambio de fecha en planillas cuadradas
    if (planilla.cuadrado_en_caja) {
      return NextResponse.json(
        { error: "No se puede cambiar la fecha de una planilla ya cuadrada en caja" },
        { status: 400 }
      )
    }

    console.log(`[API /planillas/cambiar-fecha] Cambiando fecha de planilla ${planillaId}`)
    console.log(`[API /planillas/cambiar-fecha] Fecha anterior: ${fechaAnterior}`)
    console.log(`[API /planillas/cambiar-fecha] Nueva fecha: ${nuevaFecha}`)

    // Actualizar la fecha de la planilla
    await sql`
      UPDATE planillas
      SET fecha = ${nuevaFecha}::date,
          updated_at = NOW()
      WHERE id = ${planillaId}
    `

    console.log(`[API /planillas/cambiar-fecha] ✓ Fecha actualizada exitosamente`)

    return NextResponse.json({
      success: true,
      mensaje: `Fecha de ruta ${planilla.tipo_ruta} actualizada exitosamente`,
      planillaId,
      fechaAnterior,
      fechaNueva: nuevaFecha
    })

  } catch (error) {
    console.error("[API /planillas/cambiar-fecha] ERROR:", error)
    return NextResponse.json(
      { 
        error: "Error al cambiar fecha",
        details: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500 }
    )
  }
}
