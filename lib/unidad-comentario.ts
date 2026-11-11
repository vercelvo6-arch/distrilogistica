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
