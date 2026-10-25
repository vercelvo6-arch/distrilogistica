import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { handleDBError } from "@/lib/db-helpers"
import { exigirAdministrador } from "@/lib/inventario-api"

// GET /api/inventario/cargas — últimos archivos subidos (catálogo, ventas e inventario del POS).
export async function GET() {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const sql = getDB()
    const cargas = await sql`
      SELECT id, tipo, archivo, periodo_desde, periodo_hasta, filas, subido_por, subido_en
      FROM inventario_cargas
      ORDER BY subido_en DESC
      LIMIT 40
    `
    return NextResponse.json({ success: true, cargas })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_CARGAS_GET")
  }
}

// DELETE /api/inventario/cargas?id=N — deshace una carga de ventas o de inventario (con sus líneas).
// Las cargas de catálogo no se pueden deshacer: solo registran qué archivo actualizó el catálogo.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const id = Number(new URL(request.url).searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

    const sql = getDB()
    const [carga] = (await sql`SELECT id, tipo FROM inventario_cargas WHERE id = ${id}`) as any[]
    if (!carga) return NextResponse.json({ error: "Carga no encontrada" }, { status: 404 })
    if (carga.tipo === "catalogo") {
      return NextResponse.json({ error: "Las cargas de catálogo no se pueden deshacer" }, { status: 409 })
    }

    await sql`DELETE FROM inventario_cargas WHERE id = ${id}` // las líneas se borran en cascada
    return NextResponse.json({ success: true, mensaje: "Carga eliminada" })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_CARGAS_DELETE")
  }
}
