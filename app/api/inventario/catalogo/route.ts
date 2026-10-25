import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { handleDBError } from "@/lib/db-helpers"
import { exigirAdministrador, enBloques } from "@/lib/inventario-api"
import { parsearInventarioCSV } from "@/lib/inventario"

// GET /api/inventario/catalogo?q=texto — resumen del catálogo y búsqueda rápida.
export async function GET(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const sql = getDB()
    const q = new URL(request.url).searchParams.get("q")?.trim() || ""

    const [resumen] = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE es_kit)::int AS kits,
             MAX(actualizado_en) AS ultima_actualizacion
      FROM inventario_catalogo
    `) as any[]

    const productos = q
      ? await sql`
          SELECT codigo, codigo_original, nombre, categoria, precio_unitario, es_kit
          FROM inventario_catalogo
          WHERE codigo ILIKE ${"%" + q + "%"} OR nombre ILIKE ${"%" + q + "%"}
          ORDER BY es_kit, codigo
          LIMIT 50
        `
      : []

    return NextResponse.json({ success: true, resumen, productos })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_CATALOGO_GET")
  }
}

// POST /api/inventario/catalogo { archivo, texto }
// Carga o actualiza el catálogo desde el archivo de inventario del POS. Los productos que ya
// existen se actualizan (nombre, categoría, precio); los nuevos se agregan; ninguno se borra.
export async function POST(request: NextRequest) {
  try {
    const auth = await exigirAdministrador()
    if ("error" in auth) return auth.error
    const { archivo, texto } = await request.json()
    if (!texto || typeof texto !== "string") {
      return NextResponse.json({ error: "El archivo está vacío" }, { status: 400 })
    }

    const { filas, ignoradas } = parsearInventarioCSV(texto)
    if (filas.length === 0) {
      return NextResponse.json({ error: "No se reconoció ningún producto en el archivo" }, { status: 400 })
    }

    const sql = getDB()
    const [carga] = (await sql`
      INSERT INTO inventario_cargas (tipo, archivo, filas, subido_por)
      VALUES ('catalogo', ${archivo || null}, ${filas.length}, ${auth.session.user.nombre || auth.session.user.email || null})
      RETURNING id
    `) as any[]

    let nuevos = 0
    let actualizados = 0
    for (const bloque of enBloques(filas, 1000)) {
      const res = (await sql`
        INSERT INTO inventario_catalogo (
          codigo, codigo_original, nombre, categoria, precio_unitario, es_kit, composicion, activo, carga_id, actualizado_en
        )
        SELECT x.codigo, x.codigo_original, x.nombre, NULLIF(x.categoria, ''), x.precio_unitario, x.es_kit,
               NULLIF(x.composicion, ''), TRUE, ${carga.id}, NOW()
        FROM jsonb_to_recordset(${JSON.stringify(bloque)}::jsonb)
          AS x(codigo text, codigo_original text, nombre text, categoria text,
               precio_unitario numeric, es_kit boolean, composicion text)
        ON CONFLICT (codigo) DO UPDATE SET
          codigo_original = EXCLUDED.codigo_original,
          nombre          = EXCLUDED.nombre,
          categoria       = EXCLUDED.categoria,
          precio_unitario = EXCLUDED.precio_unitario,
          es_kit          = EXCLUDED.es_kit,
          composicion     = EXCLUDED.composicion,
          activo          = TRUE,
          carga_id        = EXCLUDED.carga_id,
          actualizado_en  = NOW()
        RETURNING (xmax = 0) AS insertado
      `) as any[]
      for (const r of res) r.insertado ? nuevos++ : actualizados++
    }

    return NextResponse.json({
      success: true,
      mensaje: `Catálogo cargado: ${nuevos} productos nuevos y ${actualizados} actualizados`,
      total: filas.length,
      nuevos,
      actualizados,
      kits: filas.filter((f) => f.es_kit).length,
      ignoradas,
    })
  } catch (error) {
    return handleDBError(error, "INVENTARIO_CATALOGO_POST")
  }
}
