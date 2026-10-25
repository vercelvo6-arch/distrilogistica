import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { handleDBError } from "@/lib/db-helpers"
import { exigirAdministrador, leerRango } from "@/lib/inventario-api"

// GET /api/inventario/cruce-ventas?desde&hasta
// Cruza, por producto, lo que SALIÓ de bodega (planillas alistadas) contra lo que el POS facturó
// y devolvió en las mismas fechas. Diferencia = (facturado − devuelto en POS) − salió:
//   positiva  -> el POS cobró más de lo que salió (faltante no registrado, sustitución, error de digitación)
//   negativa  -> salió más de lo que el POS facturó
// Solo cuentan las ventas del POS que traen ruta (las que Distrilogística reparte).
export async function GET(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const { desde, hasta } = leerRango(request.url)
    const sql = getDB()

    const filas = (await sql`
      WITH sal AS (
        SELECT codigo, MIN(nombre) AS nombre, SUM(cantidad_salida) AS salio
        FROM inventario_salidas
        WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date
        GROUP BY codigo
      ),
      v AS (
        SELECT codigo, MIN(nombre) AS nombre,
               SUM(CASE WHEN NOT es_devolucion THEN cantidad ELSE 0 END) AS facturado,
               SUM(CASE WHEN es_devolucion THEN -cantidad ELSE 0 END) AS devuelto
        FROM inventario_ventas_pos
        WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date
          AND COALESCE(ruta, '') <> ''
        GROUP BY codigo
      )
      SELECT COALESCE(sal.codigo, v.codigo) AS codigo,
             COALESCE(c.nombre, v.nombre, sal.nombre) AS nombre,
             COALESCE(sal.salio, 0) AS salio,
             COALESCE(v.facturado, 0) AS facturado,
             COALESCE(v.devuelto, 0) AS devuelto,
             COALESCE(v.facturado, 0) - COALESCE(v.devuelto, 0) AS neto_pos,
             COALESCE(v.facturado, 0) - COALESCE(v.devuelto, 0) - COALESCE(sal.salio, 0) AS diferencia
      FROM sal
      FULL JOIN v ON v.codigo = sal.codigo
      LEFT JOIN inventario_catalogo c ON c.codigo = COALESCE(sal.codigo, v.codigo)
      ORDER BY ABS(COALESCE(v.facturado, 0) - COALESCE(v.devuelto, 0) - COALESCE(sal.salio, 0)) DESC,
               COALESCE(sal.codigo, v.codigo)
      LIMIT 2000
    `) as any[]

    // Devoluciones en DINERO: lo que caja registró (por monto, no por producto) contra el valor que
    // el POS marcó como devuelto. Caja se cuenta por fecha de cierre del cuadre.
    const [caja] = (await sql`
      SELECT COALESCE(SUM(devoluciones), 0) AS total
      FROM cuadres_caja
      WHERE (created_at AT TIME ZONE 'America/Bogota')::date BETWEEN ${desde}::date AND ${hasta}::date
    `) as any[]
    const [pos] = (await sql`
      SELECT COALESCE(SUM(-valor), 0) AS total
      FROM inventario_ventas_pos
      WHERE es_devolucion AND fecha BETWEEN ${desde}::date AND ${hasta}::date AND COALESCE(ruta, '') <> ''
    `) as any[]

    const [cobertura] = (await sql`
      SELECT (SELECT COUNT(DISTINCT planilla_id)::int FROM inventario_salidas WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date) AS planillas,
             (SELECT COUNT(*)::int FROM inventario_ventas_pos WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date) AS lineas_ventas
    `) as any[]

    return NextResponse.json({
      success: true,
      desde,
      hasta,
      cobertura,
      devolucionesDinero: { caja: Number(caja.total), pos: Number(pos.total) },
      filas,
    })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_CRUCE_VENTAS")
  }
}
