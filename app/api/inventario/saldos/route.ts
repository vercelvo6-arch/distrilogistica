import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { handleDBError } from "@/lib/db-helpers"
import { exigirAdministrador, enBloques, fechaBogota } from "@/lib/inventario-api"
import { parsearInventarioCSV } from "@/lib/inventario"

// POST /api/inventario/saldos { archivo, texto, fecha? }
// Guarda el inventario del POS (saldo por código) de una fecha. Cada carga se conserva para poder
// comparar semana contra semana. Además agrega al catálogo los productos que aún no estén.
export async function POST(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const { archivo, texto, fecha } = await request.json()
    if (!texto || typeof texto !== "string") {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 })
    }

    const { filas, ignoradas } = parsearInventarioCSV(texto)
    if (filas.length === 0) {
      return NextResponse.json({ error: "No se reconoció ningún producto en el archivo" }, { status: 400 })
    }
    const conSaldo = filas.filter((f) => f.cantidad !== 0).length
    if (conSaldo === 0) {
      return NextResponse.json(
        { error: "Todas las cantidades del archivo están en 0. Sube el inventario con las cantidades reales del POS." },
        { status: 400 }
      )
    }

    const fechaCarga = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || "")) ? fecha : fechaBogota(0)
    const sql = getDB()

    const [carga] = (await sql`
      INSERT INTO inventario_cargas (tipo, archivo, periodo_hasta, filas, subido_por)
      VALUES ('inventario', ${archivo || null}, ${fechaCarga}::date, ${filas.length},
              ${auth.session.user.nombre || auth.session.user.email || null})
      RETURNING id
    `) as any[]

    for (const bloque of enBloques(filas, 1000)) {
      await sql`
        INSERT INTO inventario_saldos_pos (carga_id, codigo, codigo_original, nombre, categoria, cantidad, precio_unitario)
        SELECT ${carga.id}, x.codigo, x.codigo_original, x.nombre, NULLIF(x.categoria, ''), x.cantidad, x.precio_unitario
        FROM jsonb_to_recordset(${JSON.stringify(bloque)}::jsonb)
          AS x(codigo text, codigo_original text, nombre text, categoria text, cantidad numeric, precio_unitario numeric)
        ON CONFLICT (carga_id, codigo) DO UPDATE SET cantidad = EXCLUDED.cantidad
      `
    }

    // Productos nuevos del archivo -> catálogo (sin tocar los que ya existen).
    for (const bloque of enBloques(filas, 1000)) {
      await sql`
        INSERT INTO inventario_catalogo (codigo, codigo_original, nombre, categoria, precio_unitario, es_kit, composicion, carga_id)
        SELECT x.codigo, x.codigo_original, x.nombre, NULLIF(x.categoria, ''), x.precio_unitario, x.es_kit,
               NULLIF(x.composicion, ''), ${carga.id}
        FROM jsonb_to_recordset(${JSON.stringify(bloque)}::jsonb)
          AS x(codigo text, codigo_original text, nombre text, categoria text,
               precio_unitario numeric, es_kit boolean, composicion text)
        ON CONFLICT (codigo) DO NOTHING
      `
    }

    const unidades = filas.reduce((s, f) => s + (f.cantidad > 0 ? f.cantidad : 0), 0)
    return NextResponse.json({
      success: true,
      mensaje: `Inventario del ${fechaCarga} cargado: ${conSaldo} productos con saldo, ${unidades} unidades`,
      cargaId: carga.id,
      productos: filas.length,
      conSaldo,
      unidades,
      ignoradas,
    })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_SALDOS_POST")
  }
}
