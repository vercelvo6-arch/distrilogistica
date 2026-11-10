import { comentarioVigente } from "@/lib/sumar-notas"

// Un mismo registro del alistador sobre una tarjeta con varias planillas queda guardado como un
// faltante por planilla (para que al reasignar una planilla se lleve solo lo suyo), y cada uno repite
// el comentario del total. Visto fila por fila parece duplicado: "1 · Pendiente 2 blíster" dos veces
// se lee como 4. Para mostrarlo y exportarlo se juntan en UNA fila: mismo entregador, código, estado y
// minuto en que se marcó, con las cantidades sumadas y el comentario una sola vez.

interface FaltanteBase {
  id: string
  entregador?: string | null
  codigo?: string | null
  estado?: string | null
  fecha_marcado?: string | Date | null
  cantidad_solicitada?: number | string | null
  cantidad_disponible?: number | string | null
  cantidad_faltante?: number | string | null
  observaciones?: string | null
  observaciones_resolucion?: string | null
}

export type FaltanteAgrupado<T extends FaltanteBase> = T & {
  ids: string[]
  cantidad_solicitada: number
  cantidad_disponible: number
  cantidad_faltante: number
}

const minuto = (f: string | Date | null | undefined) => {
  if (!f) return ""
  const d = new Date(f)
  return isNaN(d.getTime()) ? String(f) : d.toISOString().slice(0, 16)
}

export function agruparFaltantes<T extends FaltanteBase>(lista: T[]): FaltanteAgrupado<T>[] {
  const grupos = new Map<string, FaltanteAgrupado<T>>()
  for (const f of lista) {
    const clave = [f.entregador || "", f.codigo || "", f.estado || "", minuto(f.fecha_marcado), comentarioVigente(f)].join("|")
    const actual = grupos.get(clave)
    if (!actual) {
      grupos.set(clave, {
        ...f,
        ids: [f.id],
        cantidad_solicitada: Number(f.cantidad_solicitada) || 0,
        cantidad_disponible: Number(f.cantidad_disponible) || 0,
        cantidad_faltante: Number(f.cantidad_faltante) || 0,
      })
    } else {
      actual.ids.push(f.id)
      actual.cantidad_solicitada += Number(f.cantidad_solicitada) || 0
      actual.cantidad_disponible += Number(f.cantidad_disponible) || 0
      actual.cantidad_faltante += Number(f.cantidad_faltante) || 0
    }
  }
  return Array.from(grupos.values())
}
