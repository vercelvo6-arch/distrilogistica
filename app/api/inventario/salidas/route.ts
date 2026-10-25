import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { handleDBError } from "@/lib/db-helpers"
import { exigirAdministrador, leerRango } from "@/lib/inventario-api"
import { registrarSalidasPendientes } from "@/lib/inventario-salidas"

// GET /api/inventario/salidas?desde&hasta — lo que salió de bodega por producto en esas fechas.
export async function GET(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const { desde, hasta } = leerRango(request.url)
    const sql = getDB()

    const [resumen] = (await sql`
      SELECT COUNT(DISTINCT planilla_id)::int AS planillas,
             COUNT(DISTINCT codigo)::int AS productos,
             COALESCE(SUM(cantidad_salida), 0) AS unidades_salieron,
             COALESCE(SUM(cantidad_faltante), 0) AS unidades_faltantes
      FROM inventario_salidas
      WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date
    `) as any[]

    const productos = await sql`
      SELECT s.codigo, COALESCE(c.nombre, MIN(s.nombre)) AS nombre,
             SUM(s.cantidad_pedida) AS pedido, SUM(s.cantidad_faltante) AS faltante, SUM(s.cantidad_salida) AS salio,
             COUNT(DISTINCT s.planilla_id)::int AS planillas
      FROM inventario_salidas s
      LEFT JOIN inventario_catalogo c ON c.codigo = s.codigo
      WHERE s.fecha BETWEEN ${desde}::date AND ${hasta}::date
      GROUP BY s.codigo, c.nombre
      ORDER BY SUM(s.cantidad_salida) DESC
      LIMIT 500
    `

    const [pendientes] = (await sql`
      SELECT COUNT(DISTINCT pl.id)::int AS n
      FROM planillas pl
      JOIN pedidos p ON COALESCE(p.planilla_mercancia_id, p.planilla_id) = pl.id
      WHERE pl.estado = 'alistado'
        AND NOT EXISTS (SELECT 1 FROM inventario_salidas s WHERE s.planilla_id = pl.id)
    `) as any[]

    return NextResponse.json({ success: true, desde, hasta, resumen, productos, planillasSinCargar: pendientes?.n || 0 })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_SALIDAS_GET")
  }
}

// POST /api/inventario/salidas — carga la salida de las planillas ya alistadas que todavía
// conservan su detalle (aún no se cuadró caja) y no estaban registradas.
export async function POST() {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const r = await registrarSalidasPendientes()
    return NextResponse.json({
      success: true,
      mensaje: `Se cargó la salida de ${r.planillasCargadas} planillas (${r.productos} productos)`
        + (r.fallidas.length > 0 ? `; ${r.fallidas.length} fallaron` : ""),
      ...r,
    })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_SALIDAS_POST")
  }
}
