// Comentarios del alistador de un producto que falta en varias planillas, tal como los escribió,
// ordenados por ruta. Decisión del coordinador: ver los comentarios originales (no una suma
// calculada sobre el texto) para saber exactamente qué se contó en bodega y en qué ruta.
//
// - Un mismo comentario escrito en UN solo registro del alistador se guarda igual en cada planilla
//   de la tarjeta (reparto por planilla, misma fecha_marcado): sale una vez con todas sus rutas
//   ("Rutas 3, 5: Pendiente 4 blíster") para que no parezca que falta el doble.
// - Un comentario repetido dentro de la misma planilla sale una vez.
// - Los textos que pone el sistema al subsanar o registrar desde Supervisión no se muestran.

const NOTA_DEL_SISTEMA = /^(subsanado (desde|por) coordinador|registrado por coordinador)$/i

export interface FaltanteConNota {
  observaciones?: string | null
  fecha_marcado?: string | Date | null
  ruta?: string | number | null
}

export interface ComentarioRuta {
  rutas: string[]
  texto: string
}

export function esNotaDelSistema(texto: string): boolean {
  return NOTA_DEL_SISTEMA.test(String(texto || "").trim())
}

// Comentario vigente de un faltante: el último que se escribió. Si el coordinador escribió uno al
// subsanar y luego se revirtió, ese es el que vale ("faltan 3 displeys" reemplaza a "FALTAN 10
// DISPLEYS" del alistador): Revertir solo devuelve el estado, no el comentario, y no se muestra
// ningún historial. Los faltantes revertidos antes de este cambio también se ven así.
export function comentarioVigente(f: { observaciones?: string | null; observaciones_resolucion?: string | null }): string {
  const resolucion = String(f.observaciones_resolucion || "")
  if (!resolucion.includes("[REVERTIDO")) return String(f.observaciones || "")
  const notaCoordinador = resolucion.replace(/\s*\[REVERTIDO por [^\]]*\]/g, "").trim()
  return notaCoordinador && !esNotaDelSistema(notaCoordinador) ? notaCoordinador : String(f.observaciones || "")
}

export function comentariosPorRuta(faltantes: FaltanteConNota[]): ComentarioRuta[] {
  const grupos = new Map<string, ComentarioRuta>()
  for (const f of faltantes) {
    const texto = String(f.observaciones || "").trim()
    if (!texto || esNotaDelSistema(texto)) continue
    const ruta = f.ruta === null || f.ruta === undefined ? "" : String(f.ruta)
    // Sin fecha (líneas de producto) cada ruta es su propio registro.
    const registro = f.fecha_marcado ? String(new Date(f.fecha_marcado as any).getTime()) : `ruta:${ruta}`
    const clave = `${registro}|${texto}`
    const g = grupos.get(clave)
    if (!g) grupos.set(clave, { rutas: ruta ? [ruta] : [], texto })
    else if (ruta && !g.rutas.includes(ruta)) g.rutas.push(ruta)
  }
  return Array.from(grupos.values())
}

export function etiquetaRutas(rutas: string[]): string {
  if (rutas.length === 0) return ""
  return rutas.length === 1 ? `Ruta ${rutas[0]}` : `Rutas ${rutas.join(", ")}`
}
