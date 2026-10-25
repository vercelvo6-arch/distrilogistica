import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { handleDBError } from "@/lib/db-helpers"
import { exigirAdministrador, leerRango } from "@/lib/inventario-api"

// GET /api/inventario/cruce-saldos?desde&hasta&carga_id
// Cruza el inventario del POS con lo que realmente salió. El POS descuenta lo FACTURADO (y suma lo
// devuelto), pero a la calle solo salió lo alistado, así que por producto:
//   ajuste sugerido en el POS = (facturado − devuelto) − salió
//   saldo real sugerido        = saldo del POS + ajuste pendiente
// Los ajustes manuales ya registrados en esas fechas se restan para no volver a sugerirlos.
// No incluye compras: si el POS ya las sumó al saldo, no afectan este cruce.
export async function GET(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const { desde, hasta } = leerRango(request.url)
    const sql = getDB()

    const cargaParam = Number(new URL(request.url).searchParams.get("carga_id"))
    const cargas = (await sql`
      SELECT id, archivo, periodo_hasta, subido_en
      FROM inventario_cargas WHERE tipo = 'inventario'
      ORDER BY periodo_hasta DESC NULLS LAST, subido_en DESC LIMIT 12
    `) as any[]
    const carga = cargas.find((c) => c.id === cargaParam) || cargas[0]
    if (!carga) {
      return NextResponse.json({ success: true, desde, hasta, cargas: [], carga: null, filas: [] })
    }

    const filas = (await sql`
      WITH s AS (
        SELECT codigo, MIN(nombre) AS nombre, SUM(cantidad) AS saldo
        FROM inventario_saldos_pos WHERE carga_id = ${carga.id} GROUP BY codigo
      ),
      sal AS (
        SELECT codigo, MIN(nombre) AS nombre, SUM(cantidad_salida) AS salio
        FROM inventario_salidas
        WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date GROUP BY codigo
      ),
      v AS (
        SELECT codigo, MIN(nombre) AS nombre,
               SUM(CASE WHEN NOT es_devolucion THEN cantidad ELSE 0 END) AS facturado,
               SUM(CASE WHEN es_devolucion THEN -cantidad ELSE 0 END) AS devuelto
        FROM inventario_ventas_pos
        WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date AND COALESCE(ruta, '') <> ''
        GROUP BY codigo
      ),
      adj AS (
        SELECT codigo, SUM(cantidad) AS ajustes
        FROM inventario_ajustes WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date GROUP BY codigo
      ),
      cods AS (SELECT codigo FROM s UNION SELECT codigo FROM sal UNION SELECT codigo FROM v UNION SELECT codigo FROM adj)
      SELECT cods.codigo,
             COALESCE(c.nombre, s.nombre, v.nombre, sal.nombre) AS nombre,
             COALESCE(s.saldo, 0) AS saldo_pos,
             COALESCE(v.facturado, 0) AS facturado,
             COALESCE(v.devuelto, 0) AS devuelto,
             COALESCE(sal.salio, 0) AS salio,
             COALESCE(v.facturado, 0) - COALESCE(v.devuelto, 0) - COALESCE(sal.salio, 0) AS ajuste_sugerido,
             COALESCE(adj.ajustes, 0) AS ajustes_aplicados,
             COALESCE(v.facturado, 0) - COALESCE(v.devuelto, 0) - COALESCE(sal.salio, 0) - COALESCE(adj.ajustes, 0) AS pendiente,
             COALESCE(s.saldo, 0)
               + (COALESCE(v.facturado, 0) - COALESCE(v.devuelto, 0) - COALESCE(sal.salio, 0) - COALESCE(adj.ajustes, 0)) AS saldo_real
      FROM cods
      LEFT JOIN s ON s.codigo = cods.codigo
      LEFT JOIN sal ON sal.codigo = cods.codigo
      LEFT JOIN v ON v.codigo = cods.codigo
      LEFT JOIN adj ON adj.codigo = cods.codigo
      LEFT JOIN inventario_catalogo c ON c.codigo = cods.codigo
      WHERE COALESCE(s.saldo, 0) <> 0
         OR COALESCE(v.facturado, 0) - COALESCE(v.devuelto, 0) - COALESCE(sal.salio, 0) <> 0
         OR COALESCE(adj.ajustes, 0) <> 0
      ORDER BY ABS(COALESCE(v.facturado, 0) - COALESCE(v.devuelto, 0) - COALESCE(sal.salio, 0) - COALESCE(adj.ajustes, 0)) DESC,
               cods.codigo
      LIMIT 3000
    `) as any[]

    return NextResponse.json({ success: true, desde, hasta, cargas, carga, filas })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_CRUCE_SALDOS")
  }
}
