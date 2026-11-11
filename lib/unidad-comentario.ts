// Controles de seguridad del comentario de un faltante. Se revisan en la pantalla (alistador y
// coordinador) y otra vez en el servidor, con el nombre del producto que está en la base de datos.
//
// 1) UNIDAD: si el producto es BLÍSTER, el comentario no puede contar en DISPLAY o CAJA (y al
//    revés). "Falta 1 display" sobre un blíster hace que se entregue una caja entera.
// 2) NÚMERO: si el comentario trae UNA cantidad clara, debe ser la misma de la casilla
//    "¿cuántas faltan?". Casilla 3 y "Pendiente 1 blíster" guardaba 3 y se entregaban 3.
//
// Criterio: bloquear solo lo que es claramente incoherente. Ante la duda (promos y kits, varios
// números, fechas, comentarios sin cantidad) no se bloquea, para no frenar al alistador.

type Familia = "blister" | "display"

const LETRA = "a-záéíóúñ"
const BLISTER_SRC = "bl[ií]st[ae]r(?:es|s)?"
const DISPLAY_SRC = "(?:displ?[ae]?ys?|cajas?|cja)"
const BLISTER = new RegExp(BLISTER_SRC, "i")
// "1DISPLEY", "DISPLEYS", "CAJA": sin letra pegada antes ni después ("cajatina" no cuenta)
// También "CAJAX 20" (la X del empaque pegada): es una caja.
const DISPLAY = new RegExp(`(?:^|[^${LETRA}])${DISPLAY_SRC}(?:x(?=\\s*\\d)|(?![${LETRA}]))`, "i")

const NUMEROS_EN_LETRAS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
}
const CANTIDAD_SRC = `(?:\\d+|${Object.keys(NUMEROS_EN_LETRAS).join("|")})`

// Piezas sueltas dentro de un display o blíster
const PIEZA_SRC = "(?:sobres?|piezas?|unidad(?:es)?|und|tabletas?|pastillas?|c[aá]psulas?|sueltas?)"
// La cantidad cuenta piezas cuando va seguida de la pieza: "3 sobres", "una unidad"
const CANTIDAD_DE_PIEZAS = new RegExp(`(?:^|[^${LETRA}\\d])${CANTIDAD_SRC}\\s+(?:de\\s+)?${PIEZA_SRC}(?![${LETRA}])`, "i")
// Palabras que pueden ir después de "un / una" cuando sí es una cantidad ("falta un blíster")
const UNIDAD_CONTABLE = `(?:${BLISTER_SRC}|${DISPLAY_SRC}|unidad(?:es)?|und|ristras?|tiras?|tarros?|frascos?|sobres?|paquetes?|paq|promos?|bolsas?|docenas?|potes?|latas?|rollos?|piezas?|ofertas?|combos?|kits?|botellas?|tubos?|pacas?|bultos?)`
const TIEMPO = "(?:d[ií]as?|semanas?|horas?|mes(?:es)?|minutos?|min|años?)"

/** Kits y promos mezclan unidades: no se revisan. (Códigos con letras o nombre con LLEVA/INCLUYE/PROMO.) */
export function esKitOPromo(descripcion: string, codigo?: string | null): boolean {
  return /lleva|incluye|promo/i.test(String(descripcion || "")) || /[a-z]/i.test(String(codigo || ""))
}

function familias(texto: string): Set<Familia> {
  const t = String(texto || "")
  const f = new Set<Familia>()
  if (BLISTER.test(t)) f.add("blister")
  if (DISPLAY.test(t)) f.add("display")
  return f
}

const NOMBRE: Record<Familia, string> = { blister: "blíster", display: "display o caja" }

/**
 * UNIDAD. Devuelve el mensaje de error si el comentario cuenta en una unidad distinta a la del
 * producto, o null si está bien o no se puede saber.
 * Bloquea cuando: una cantidad va seguida de la otra unidad ("1 displey" en un blíster), o el
 * comentario solo menciona la otra unidad. "Pendiente 2 blíster, la caja llegó rota" sí se acepta.
 */
export function validarUnidadComentario(descripcionProducto: string, comentario: string, codigo?: string | null): string | null {
  const desc = String(descripcionProducto || "")
  const com = String(comentario || "").trim()
  if (!com || esKitOPromo(desc, codigo)) return null
  const fp = familias(desc)
  if (fp.size !== 1) return null
  const propia = Array.from(fp)[0]
  const otra: Familia = propia === "blister" ? "display" : "blister"
  const otraSrc = otra === "blister" ? BLISTER_SRC : DISPLAY_SRC
  const cantidadEnOtra = new RegExp(`(?:^|[^${LETRA}\\d])${CANTIDAD_SRC}\\s+(?:de\\s+)?${otraSrc}(?![${LETRA}])`, "i").test(com)
  const fc = familias(com)
  if (cantidadEnOtra || (fc.has(otra) && !fc.has(propia))) {
    return `El producto se cuenta por ${NOMBRE[propia]}, pero el comentario dice ${NOMBRE[otra]}. Escriba lo que falta en ${NOMBRE[propia]}.`
  }
  return null
}

/**
 * Cantidades que menciona el comentario. No cuentan: tamaños de empaque ("x12", "por 12"),
 * medidas ("60 gr"), fechas y horas ("15/11", "2 pm", "el 20"), plazos ("llega en 2 días") ni
 * "un / una" cuando es artículo ("llega en una semana", "falta un poco").
 */
export function numerosDelComentario(comentario: string): number[] {
  const limpio = String(comentario || "")
    .toLowerCase()
    .replace(/\d+\s*[/-]\s*\d+(?:\s*[/-]\s*\d+)?/g, " ") // fechas 15/11, 15-11-2026
    .replace(/\d+(?::\d+)?\s*(?:a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/g, " ") // horas 2 pm, 10:30 a.m.
    .replace(/\d+:\d+/g, " ")
    .replace(new RegExp(`${CANTIDAD_SRC}\\s+${TIEMPO}(?![${LETRA}])`, "g"), " ") // 2 días, una semana
    .replace(/(?:^|\s)(?:el|del|al|hasta el|para el)\s+\d+(?!\s*[a-z])/g, " ") // el 20
    .replace(/(?:^|[^a-z])(?:x|por)\s*\d+(?:[.,]\d+)?/g, " ") // x12, por 12
    .replace(/\d+(?:[.,]\d+)?\s*(?:gr|gm|g|ml|cc|mg|kg|lt|l|cm|mm)(?![a-z])/g, " ") // medidas
  const numeros: number[] = []
  const re = new RegExp(`\\d+|[${LETRA}]+`, "g")
  const tokens = limpio.match(re) || []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (/^\d+$/.test(t)) numeros.push(Number(t))
    else if (t in NUMEROS_EN_LETRAS) {
      const esArticulo = NUMEROS_EN_LETRAS[t] === 1
      // "un / una" solo es cantidad si sigue una unidad contable: "un blíster", "una caja"
      if (!esArticulo || new RegExp(`^${UNIDAD_CONTABLE}$`).test(tokens[i + 1] || "")) numeros.push(NUMEROS_EN_LETRAS[t])
    }
  }
  return numeros
}

/**
 * NÚMERO. Devuelve el mensaje de error si la cantidad del comentario no coincide con la casilla
 * "¿cuántas faltan?", o null si está bien o no se puede saber.
 * - No se revisa: kits y promos, casilla en 0, comentarios sin cantidad o con varias.
 * - Piezas dentro de la unidad ("al displey le faltan 3 sobres"): un display o blíster incompleto
 *   cuenta como 1 en la casilla, así que las piezas pueden ser más que la casilla, nunca menos.
 */
export function validarNumeroComentario(descripcionProducto: string, comentario: string, faltan: number, codigo?: string | null): string | null {
  const desc = String(descripcionProducto || "")
  const com = String(comentario || "").trim()
  if (!com || esKitOPromo(desc, codigo)) return null
  const casilla = Number(faltan)
  if (!Number.isFinite(casilla) || casilla <= 0) return null
  const numeros = numerosDelComentario(com)
  if (numeros.length !== 1) return null
  const n = numeros[0]
  if (n === casilla) return null

  const fp = familias(desc)
  const fc = familias(com)
  // "Al displey le faltan 3 unidades": la cantidad son piezas de un display o blíster
  const hablaDePiezas = CANTIDAD_DE_PIEZAS.test(com) && (fp.size > 0 || fc.size > 0)
  if (hablaDePiezas && n > casilla) return null
  // Productos que vienen en empaque (ristra, tira, paquete, o "X12"): si el comentario cuenta más que la
  // casilla y no nombra el empaque, son piezas de adentro ("Pendiente 4 venus" en una ristra de Gillette).
  const esEmpaque = /ristra|tira|paquete|pack|\bx\s?\d/i.test(desc)
  const nombraEmpaque = /ristra|tira|paquete|pack|displ?[ae]?y|display|caja|bl[ií]st/i.test(com)
  if (esEmpaque && !nombraEmpaque && n > casilla) return null

  return `La casilla dice que faltan ${casilla} y el comentario dice ${n}. Corrija uno de los dos para que coincidan.`
}

/** Las dos revisiones juntas (primero la unidad). */
export function validarComentarioFaltante(p: { descripcion: string; codigo?: string | null; comentario: string; faltan: number }): string | null {
  return (
    validarUnidadComentario(p.descripcion, p.comentario, p.codigo) ||
    validarNumeroComentario(p.descripcion, p.comentario, p.faltan, p.codigo)
  )
}
