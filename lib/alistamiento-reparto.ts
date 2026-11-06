// Reparto del alistamiento entre las planillas de una misma tarjeta.
//
// El alistador ve UNA tarjeta por entregador (todas sus planillas juntas) y marca cada producto
// una sola vez con el total de la tarjeta. Antes ese registro se guardaba en una sola planilla
// (con las cantidades de toda la tarjeta) y las demás quedaban en "pendiente" en la base de datos:
// al reasignar una planilla a otro entregador aparecían pendientes o faltantes que no existían.
//
// Ahora el total se reparte línea por línea (cada producto de cada pedido), en el orden de la
// tarjeta: primero se llenan las primeras planillas y el faltante queda en las últimas. Así cada
// planilla guarda su propio estado real y, si se separa de la tarjeta, se lleva solo lo suyo.
//
// Función pura (sin base de datos): la usan el servidor (/api/faltantes) y las pruebas.

export type EstadoAlistamiento = "pendiente" | "completo" | "incompleto" | "no_alistado" | "reemplazo"

export interface LineaAlistamiento {
  /** id de pedido_productos */
  id: string
  /** planilla donde está la mercancía: COALESCE(planilla_mercancia_id, planilla_id) */
  planillaId: string
  cantidad: number
}

export interface LineaRepartida extends LineaAlistamiento {
  estado: EstadoAlistamiento
  disponible: number
  faltante: number
  unidadIncompleta: boolean
}

export interface ResumenPlanilla {
  planillaId: string
  solicitada: number
  disponible: number
  faltante: number
  estado: EstadoAlistamiento
  unidadIncompleta: boolean
}

// Orden de gravedad: el estado de una planilla (o de la tarjeta) es el de su línea más grave.
// Mismo orden que usa el inventario (lib/inventario-salidas.ts).
const GRAVEDAD: Record<EstadoAlistamiento, number> = {
  pendiente: 0,
  completo: 1,
  incompleto: 2,
  no_alistado: 3,
  reemplazo: 4,
}

export function estadoMasGrave(a: EstadoAlistamiento, b: EstadoAlistamiento): EstadoAlistamiento {
  return GRAVEDAD[b] > GRAVEDAD[a] ? b : a
}

/**
 * Reparte lo que el alistador encontró (disponibleTotal) entre las líneas, en su orden.
 * - completo: todas las líneas completas.
 * - no_alistado: ninguna línea recibe mercancía.
 * - incompleto / reemplazo: se llenan las líneas en orden; las que quedan cortas toman el estado
 *   elegido y las que se llenan quedan completas.
 *   · incompleto sin unidades faltantes (unidad incompleta, p. ej. una caja abierta): se marca la
 *     última línea, para que la novedad no se pierda.
 *   · reemplazo sin unidades faltantes: el reemplazo aplica al producto entero, se marcan todas.
 */
export function repartirAlistamiento(
  lineas: LineaAlistamiento[],
  disponibleTotal: number,
  estadoElegido: EstadoAlistamiento,
): LineaRepartida[] {
  const total = lineas.reduce((s, l) => s + Math.max(0, Number(l.cantidad) || 0), 0)
  let restante = Math.min(Math.max(0, Number(disponibleTotal) || 0), total)

  const repartidas: LineaRepartida[] = lineas.map((l) => {
    const cantidad = Math.max(0, Number(l.cantidad) || 0)
    let disponible: number
    if (estadoElegido === "completo") disponible = cantidad
    else if (estadoElegido === "no_alistado") disponible = 0
    else disponible = Math.min(cantidad, restante)
    restante -= estadoElegido === "completo" || estadoElegido === "no_alistado" ? 0 : disponible

    const faltante = cantidad - disponible
    let estado: EstadoAlistamiento
    if (estadoElegido === "completo") estado = "completo"
    else if (estadoElegido === "no_alistado") estado = "no_alistado"
    else estado = faltante > 0 ? estadoElegido : "completo"

    return {
      ...l,
      cantidad,
      disponible,
      faltante,
      estado,
      unidadIncompleta: estadoElegido === "incompleto" && estado === "incompleto",
    }
  })

  const hayNovedad = repartidas.some((l) => l.estado !== "completo")
  if (!hayNovedad && repartidas.length > 0) {
    if (estadoElegido === "incompleto") {
      const ultima = repartidas[repartidas.length - 1]
      ultima.estado = "incompleto"
      ultima.unidadIncompleta = true
    } else if (estadoElegido === "reemplazo") {
      repartidas.forEach((l) => (l.estado = "reemplazo"))
    }
  }

  return repartidas
}

/** Suma las líneas por planilla, en el orden en que aparecen. */
export function resumirPorPlanilla(lineas: LineaRepartida[]): ResumenPlanilla[] {
  const mapa = new Map<string, ResumenPlanilla>()
  for (const l of lineas) {
    let r = mapa.get(l.planillaId)
    if (!r) {
      r = { planillaId: l.planillaId, solicitada: 0, disponible: 0, faltante: 0, estado: "pendiente", unidadIncompleta: false }
      mapa.set(l.planillaId, r)
    }
    r.solicitada += l.cantidad
    r.disponible += l.disponible
    r.faltante += l.faltante
    r.estado = estadoMasGrave(r.estado, l.estado)
    r.unidadIncompleta = r.unidadIncompleta || l.unidadIncompleta
  }
  return Array.from(mapa.values())
}

/**
 * Reparte unidades subsanadas entre varios faltantes (en orden) sin pasarse del faltante de cada uno.
 * Devuelve cuántas unidades le tocan a cada uno.
 */
export function repartirSubsanacion(faltantes: number[], cantidadResuelta: number): number[] {
  let restante = Math.max(0, Number(cantidadResuelta) || 0)
  return faltantes.map((f) => {
    const toca = Math.min(Math.max(0, Number(f) || 0), restante)
    restante -= toca
    return toca
  })
}
