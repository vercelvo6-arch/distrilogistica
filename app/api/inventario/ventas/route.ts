import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { handleDBError } from "@/lib/db-helpers"
import { exigirAdministrador, enBloques } from "@/lib/inventario-api"
import { parsearVentasPOS } from "@/lib/inventario"

// POST /api/inventario/ventas { archivo, texto }
// Carga el CSV de ventas del POS. Si el archivo cubre fechas que ya se habían subido, esas
// fechas se REEMPLAZAN (se puede volver a subir el mismo archivo o uno corregido sin duplicar).
export async function POST(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const { archivo, texto } = await request.json()
    if (!texto || typeof texto !== "string") {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 })
    }

    const { filas, ignoradas } = parsearVentasPOS(texto)
    if (filas.length === 0) {
      return NextResponse.json({ error: "No se reconoció ninguna venta en el archivo" }, { status: 400 })
    }

    const fechas = filas.map((f) => f.fecha).filter(Boolean) as string[]
    if (fechas.length === 0) {
      return NextResponse.json({ error: "No se pudo leer la fecha de las ventas" }, { status: 400 })
    }
    const desde = fechas.reduce((a, b) => (a < b ? a : b))
    const hasta = fechas.reduce((a, b) => (a > b ? a : b))

    const sql = getDB()

    // Reemplazo por fechas: se borran las líneas ya cargadas dentro del mismo rango.
    const borradas = (await sql`
      DELETE FROM inventario_ventas_pos WHERE fecha BETWEEN ${desde}::date AND ${hasta}::date RETURNING id
    `) as any[]
    await sql`
      DELETE FROM inventario_cargas c
      WHERE c.tipo = 'ventas' AND NOT EXISTS (SELECT 1 FROM inventario_ventas_pos v WHERE v.carga_id = c.id)
    `

    const [carga] = (await sql`
      INSERT INTO inventario_cargas (tipo, archivo, periodo_desde, periodo_hasta, filas, subido_por)
      VALUES ('ventas', ${archivo || null}, ${desde}::date, ${hasta}::date, ${filas.length},
              ${auth.session.user.nombre || auth.session.user.email || null})
      RETURNING id
    `) as any[]

    for (const bloque of enBloques(filas, 1500)) {
      await sql`
        INSERT INTO inventario_ventas_pos (
          carga_id, fecha, id_venta, numero_factura, ruta, vendedor, cliente,
          codigo, codigo_original, nombre, cantidad, valor, es_devolucion
        )
        SELECT ${carga.id}, x.fecha, x.id_venta, x.numero_factura, NULLIF(x.ruta, ''), x.vendedor, x.cliente,
               x.codigo, x.codigo_original, x.nombre, x.cantidad, x.valor, x.es_devolucion
        FROM jsonb_to_recordset(${JSON.stringify(bloque)}::jsonb)
          AS x(fecha date, id_venta text, numero_factura text, ruta text, vendedor text, cliente text,
               codigo text, codigo_original text, nombre text, cantidad numeric, valor numeric, es_devolucion boolean)
      `
    }

    const devoluciones = filas.filter((f) => f.es_devolucion)
    return NextResponse.json({
      success: true,
      mensaje: `Ventas del ${desde} al ${hasta} cargadas: ${filas.length} líneas`
        + (borradas.length > 0 ? ` (reemplazaron ${borradas.length} líneas anteriores de esas fechas)` : ""),
      desde,
      hasta,
      lineas: filas.length,
      unidades: filas.reduce((s, f) => s + (f.cantidad > 0 ? f.cantidad : 0), 0),
      devoluciones: devoluciones.length,
      ignoradas,
    })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_VENTAS_POST")
  }
}
