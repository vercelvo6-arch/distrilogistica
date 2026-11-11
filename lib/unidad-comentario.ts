// Control de seguridad: el comentario de un faltante debe hablar en la misma unidad del producto.
//
// Si el producto es un BLÍSTER, el comentario no puede decir DISPLAY o CAJA (y al revés): un
// "falta 1 display" sobre un blíster hace que el coordinador entregue una caja entera en vez de
// un blíster, y la diferencia es grande. Se revisa al registrar el faltante (alistador y
// coordinador) y al subsanar, en la pantalla y en el servidor.
//
// Solo se compara cuando la descripción habla de UNA sola familia de unidad. Los kits y promos
// ("C40 LLEVA: 3 BLISTER…", "PROMO … INCLUYE 1 CAJA…") mezclan unidades y no se revisan.

type Familia = "blister" | "display"

const BLISTER = /bl[ií]st[ae]r/i
const DISPLAY = /\b(displ?[ae]?y|display|displey|disply|caja|cajas|cja)\b/i
const KIT = /\b(lleva|incluye|promo)\b/i

function familias(texto: string): Set<Familia> {
  const t = String(texto || "")
  const f = new Set<Familia>()
  if (BLISTER.test(t)) f.add("blister")
  if (DISPLAY.test(t)) f.add("display")
  return f
}

const NOMBRE: Record<Familia, string> = { blister: "blíster", display: "display o caja" }

/**
 * Devuelve el mensaje de error si el comentario usa una unidad distinta a la del producto,
 * o null si está bien (o si no se puede saber).
 */
export function validarUnidadComentario(descripcionProducto: string, comentario: string): string | null {
  const desc = String(descripcionProducto || "")
  const com = String(comentario || "").trim()
  if (!com || KIT.test(desc)) return null
  const fp = familias(desc)
  if (fp.size !== 1) return null
  const unidadProducto = Array.from(fp)[0]
  const fc = familias(com)
  const otra: Familia = unidadProducto === "blister" ? "display" : "blister"
  if (fc.has(otra)) {
    return `El producto se cuenta por ${NOMBRE[unidadProducto]}, pero el comentario dice ${NOMBRE[otra]}. Escribe lo que falta en ${NOMBRE[unidadProducto]}.`
  }
  return null
}

// ── Número del comentario = casilla "¿cuántas faltan?" ──────────────────────────────────────────
// Por costumbre (la casilla vieja preguntaba cuántas había) el alistador puede escribir en la casilla
// lo que SÍ hay: casilla 3 y comentario "Pendiente 1 blíster" guardaba 3 faltantes y el coordinador
// entregaba 3. Si el comentario trae UN número claro y no coincide con la casilla, no se guarda.
// No se revisa: promos y kits, casilla en 0 (unidad incompleta), comentarios sin número o con varios
// números ("1 rojo 1 surtido", "2 de 6"). Los tamaños de empaque ("x12", "X 18") no cuentan.

// Piezas sueltas dentro de un display o blíster
const SUBUNIDAD = /\b(sobres?|piezas?|unidades?|und|tabletas?|pastillas?|c[aá]psulas?|tarros?|frascos?|barras?|sueltas?)\b/i

const NUMEROS_EN_LETRAS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}

/** Cantidades que menciona el comentario (sin tamaños de empaque como "x12"). */
export function numerosDelComentario(comentario: string): number[] {
  const sinEmpaque = String(comentario || "")
    .toLowerCase()
    .replace(/\bx\s*\d+(?:[.,]\d+)?/g, " ") // "x12", "x 18", "displey x12"
    .replace(/\d+\s*(gr|gm|g|ml|cc|mg|kg|lt|l)\b/g, " ") // medidas del producto
  const numeros: number[] = []
  for (const m of sinEmpaque.matchAll(/\d+|[a-záéíóúñ]+/g)) {
    const t = m[0]
    if (/^\d+$/.test(t)) numeros.push(Number(t))
    else if (t in NUMEROS_EN_LETRAS) numeros.push(NUMEROS_EN_LETRAS[t])
  }
  return numeros
}

/**
 * Devuelve el mensaje de error si el número del comentario no coincide con lo que dice la casilla
 * "¿cuántas faltan?", o null si está bien (o si no se puede saber).
 */
export function validarNumeroComentario(descripcionProducto: string, comentario: string, faltan: number): string | null {
  const com = String(comentario || "").trim()
  if (!com || KIT.test(String(descripcionProducto || ""))) return null
  const casilla = Number(faltan)
  if (!Number.isFinite(casilla) || casilla <= 0) return null
  // Un display o blíster al que le faltan piezas cuenta como 1 en la casilla, y el comentario
  // habla de las piezas ("faltan 3 sobres"): son otra unidad, no se comparan.
  if (familias(String(descripcionProducto || "")).size > 0 && SUBUNIDAD.test(com)) return null
  const numeros = numerosDelComentario(com)
  if (numeros.length !== 1) return null
  if (numeros[0] !== casilla) {
    return `La casilla dice que faltan ${casilla} y el comentario dice ${numeros[0]}. Corrija uno de los dos para que coincidan.`
  }
  return null
}
