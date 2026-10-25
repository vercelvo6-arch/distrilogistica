import { getDB } from "@/lib/db"

// Guarda en inventario_salidas lo que salió de bodega en una planilla, agrupado por producto.
//
// Se llama cuando el alistador termina la planilla (estado "alistado"). Esa copia NO se borra
// al cuadrar caja: las planillas y sus pedidos sí desaparecen en ese momento, y sin esto el
// inventario perdería el detalle.
//
// - Solo cuentan los pedidos "pendiente" (mismos que muestra el alistador): los ya resueltos
//   salieron otro día con otro entregador y solo se movieron para efectos de cuentas.
// - La mercancía pertenece a la planilla donde se cargó: COALESCE(planilla_mercancia_id, planilla_id).
// - Lo que salió = lo pedido − el faltante que marcó el alistador (tabla faltantes).
// - Es repetible: volver a alistar la misma planilla reemplaza sus filas, nunca las duplica.
//
// Nunca debe romper el alistamiento: quien la llame debe capturar el error.
export async function registrarSalidaPlanilla(planillaId: string, userId?: string | null) {
  const sql = getDB()

  const [planilla] = await sql`
    SELECT id, fecha, entregador, tipo_ruta FROM planillas WHERE id = ${planillaId}
  `
  if (!planilla) return { filas: 0 }

  const quien = userId ? String(userId) : null

  const resultado = await sql.transaction([
    sql`DELETE FROM inventario_salidas WHERE planilla_id = ${planillaId}`,
    sql`
      INSERT INTO inventario_salidas (
        planilla_id, fecha, entregador, ruta, codigo, codigo_original, nombre, categoria,
        cantidad_pedida, cantidad_faltante, cantidad_salida,
        estado_alistamiento, producto_reemplazo, observaciones, alistado_por
      )
      WITH base AS (
        SELECT btrim(pp.codigo, ' "') AS c, pp.codigo AS codigo_original, pp.nombre, pp.categoria,
               pp.cantidad, pp.estado_alistamiento
        FROM pedidos p
        JOIN pedido_productos pp ON pp.pedido_id = p.id
        WHERE COALESCE(p.planilla_mercancia_id, p.planilla_id) = ${planillaId}
          AND p.estado = 'pendiente'
          AND COALESCE(p.es_cobro, false) = false
      ),
      norm AS (
        SELECT CASE WHEN c ~ '^\\d+$' THEN regexp_replace(c, '^0+(?=\\d)', '')
                    ELSE upper(regexp_replace(c, '\\s+', '', 'g')) END AS codigo,
               codigo_original, nombre, categoria, cantidad, estado_alistamiento
        FROM base
        WHERE c <> ''
      ),
      agg AS (
        SELECT codigo,
               MIN(codigo_original) AS codigo_original,
               MIN(nombre) AS nombre,
               MIN(categoria) AS categoria,
               SUM(cantidad) AS pedida,
               CASE WHEN bool_or(estado_alistamiento = 'reemplazo') THEN 'reemplazo'
                    WHEN bool_or(estado_alistamiento = 'no_alistado') THEN 'no_alistado'
                    WHEN bool_or(estado_alistamiento = 'incompleto') THEN 'incompleto'
                    ELSE 'completo' END AS estado
        FROM norm
        GROUP BY codigo
      ),
      fal AS (
        SELECT CASE WHEN btrim(codigo, ' "') ~ '^\\d+$' THEN regexp_replace(btrim(codigo, ' "'), '^0+(?=\\d)', '')
                    ELSE upper(regexp_replace(btrim(codigo, ' "'), '\\s+', '', 'g')) END AS codigo,
               SUM(cantidad_faltante) AS faltante,
               MAX(observaciones) AS observaciones
        FROM faltantes
        WHERE planilla_id = ${planillaId}
        GROUP BY 1
      )
      SELECT ${planillaId}, ${planilla.fecha}::date, ${planilla.entregador}, ${planilla.tipo_ruta},
             a.codigo, a.codigo_original, a.nombre, a.categoria,
             a.pedida,
             LEAST(COALESCE(f.faltante, 0), a.pedida),
             GREATEST(a.pedida - COALESCE(f.faltante, 0), 0),
             a.estado,
             substring(f.observaciones from 'REEMPLAZO POR: ([^|]+)'),
             NULLIF(f.observaciones, ''),
             ${quien}
      FROM agg a
      LEFT JOIN fal f ON f.codigo = a.codigo
      RETURNING id
    `,
  ])

  const insertadas = Array.isArray(resultado?.[1]) ? resultado[1].length : 0
  return { filas: insertadas }
}

// Para planillas que ya estaban alistadas antes de que existiera el módulo y todavía conservan su
// detalle (aún no se cuadró caja): carga su salida una sola vez. No toca las que ya tienen filas.
export async function registrarSalidasPendientes() {
  const sql = getDB()
  const planillas = (await sql`
    SELECT DISTINCT pl.id
    FROM planillas pl
    JOIN pedidos p ON COALESCE(p.planilla_mercancia_id, p.planilla_id) = pl.id
    WHERE pl.estado = 'alistado'
      AND NOT EXISTS (SELECT 1 FROM inventario_salidas s WHERE s.planilla_id = pl.id)
    ORDER BY pl.id
  `) as any[]

  let cargadas = 0
  let productos = 0
  const fallidas: string[] = []
  for (const p of planillas) {
    try {
      const r = await registrarSalidaPlanilla(p.id)
      if (r.filas > 0) {
        cargadas++
        productos += r.filas
      }
    } catch (e) {
      console.error("[INVENTARIO] No se pudo cargar la salida de", p.id, e)
      fallidas.push(p.id)
    }
  }
  return { planillasRevisadas: planillas.length, planillasCargadas: cargadas, productos, fallidas }
}
