import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { handleDBError } from "@/lib/db-helpers"
import { exigirAdministrador, leerRango, fechaBogota } from "@/lib/inventario-api"
import { normalizarCodigo } from "@/lib/inventario"

// Ajustes manuales de inventario (ej. facturaron 2 Balance Hombre pero salieron 1 Hombre y 1 Dama:
// -1 en Hombre y +1 en Dama). Sirven para que el cruce no vuelva a marcar esa diferencia.

// GET /api/inventario/ajustes?desde&hasta
export async function GET(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const { desde, hasta } = leerRango(request.url)
    const sql = getDB()
    const ajustes = await sql`
      SELECT a.id, a.fecha, a.codigo, COALESCE(c.nombre, a.codigo) AS nombre, a.cantidad, a.motivo, a.registrado_por, a.registrado_en
      FROM inventario_ajustes a
      LEFT JOIN inventario_catalogo c ON c.codigo = a.codigo
      WHERE a.fecha BETWEEN ${desde}::date AND ${hasta}::date
      ORDER BY a.fecha DESC, a.id DESC
      LIMIT 500
    `
    return NextResponse.json({ success: true, ajustes })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_AJUSTES_GET")
  }
}

// POST /api/inventario/ajustes { codigo, cantidad, motivo, fecha? }
export async function POST(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const body = await request.json()
    const codigo = normalizarCodigo(body.codigo)
    const cantidad = Number(body.cantidad)
    if (!codigo || !Number.isFinite(cantidad) || cantidad === 0) {
      return NextResponse.json({ error: "Indica el código y una cantidad distinta de 0" }, { status: 400 })
    }
    const motivo = String(body.motivo || "").trim()
    if (!motivo) return NextResponse.json({ error: "Escribe el motivo del ajuste" }, { status: 400 })
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.fecha || "")) ? body.fecha : fechaBogota(0)

    const sql = getDB()
    const [ajuste] = (await sql`
      INSERT INTO inventario_ajustes (fecha, codigo, cantidad, motivo, registrado_por)
      VALUES (${fecha}::date, ${codigo}, ${cantidad}, ${motivo}, ${auth.session.user.nombre || auth.session.user.email || null})
      RETURNING id
    `) as any[]
    return NextResponse.json({ success: true, id: ajuste.id, mensaje: "Ajuste registrado" })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_AJUSTES_POST")
  }
}

// DELETE /api/inventario/ajustes?id=N
export async function DELETE(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const id = Number(new URL(request.url).searchParams.get("id"))
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })
    const sql = getDB()
    await sql`DELETE FROM inventario_ajustes WHERE id = ${id}`
    return NextResponse.json({ success: true, mensaje: "Ajuste eliminado" })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_AJUSTES_DELETE")
  }
}
