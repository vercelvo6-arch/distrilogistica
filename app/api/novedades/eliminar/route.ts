import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { handleDBError } from "@/lib/db-helpers"
import { registrarSnapshotNovedad } from "@/lib/eliminaciones-historial"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    if (!["caja", "administrador"].includes(session.user.rol)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { novedadId } = await request.json()

    if (!novedadId) {
      return NextResponse.json({ error: "novedadId requerido" }, { status: 400 })
    }

    const sql = getDB()

    await sql`BEGIN`
    try {
      await registrarSnapshotNovedad(
        sql,
        novedadId,
        { id: session.user.id, nombre: session.user.nombre },
        "novedades/eliminar"
      )

      await sql`
        DELETE FROM novedades_pedido
        WHERE id = ${novedadId}
      `

      await sql`COMMIT`
    } catch (txError) {
      await sql`ROLLBACK`
      throw txError
    }

    return NextResponse.json({ success: true, mensaje: "Novedad eliminada" })

  } catch (error) {
    return handleDBError(error, "NOVEDADES_ELIMINAR")
  }
}
