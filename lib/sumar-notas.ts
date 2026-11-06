// Junta las notas del alistador de los faltantes de un mismo producto en varias planillas.
//
// La nota dice lo que falta en la unidad que se cuenta en bodega ("Pendiente 2 blíster").
// Si el producto falta en dos planillas, en Supervisión debe leerse "Pendiente 4 blíster",
// no "Pendiente 2 blíster; Pendiente 2 blíster".
//
// - Una misma nota escrita en un solo registro del alistador se guarda igual en cada planilla de
//   la tarjeta (reparto por planilla, misma fecha_marcado): se cuenta UNA vez.
// - Notas de registros distintos con el mismo texto salvo el número se suman.
// - Notas con textos distintos se muestran una vez cada una.
// - Las notas que pone el sistema al subsanar o registrar desde Supervisión no son del alistador.

const NOTA_DEL_SISTEMA = /^(subsanado (desde|por) coordinador|registrado por coordinador)$/i

export interface FaltanteConNota {
  observaciones?: string | null
  fecha_marcado?: string | Date | null
}

export function sumarNotasAlistador(faltantes: FaltanteConNota[]): string {
  // 1) Una nota por registro del alistador
  const vistos = new Set<string>()
  const notas: string[] = []
  for (const f of faltantes) {
    const texto = String(f.observaciones || "").trim()
    if (!texto || NOTA_DEL_SISTEMA.test(texto)) continue
    const clave = `${f.fecha_marcado ? new Date(f.fecha_marcado as any).getTime() : ""}|${texto}`
    if (vistos.has(clave)) continue
    vistos.add(clave)
    notas.push(texto)
  }

  // 2) Mismo texto con un solo número → se suma el número
  const grupos = new Map<string, { plantilla: string; suma: number; sumable: boolean; texto: string }>()
  for (const nota of notas) {
    const numeros = nota.match(/\d+(?:[.,]\d+)?/g) || []
    const plantilla = nota.replace(/\d+(?:[.,]\d+)?/g, "#").replace(/\s+/g, " ").toLowerCase()
    const sumable = numeros.length === 1
    const valor = sumable ? Number(numeros[0].replace(",", ".")) : 0
    const g = grupos.get(plantilla)
    if (!g) grupos.set(plantilla, { plantilla, suma: valor, sumable, texto: nota })
    else if (sumable) g.suma += valor
  }

  return Array.from(grupos.values())
    .map((g) => (g.sumable ? g.texto.replace(/\d+(?:[.,]\d+)?/, String(Math.round(g.suma * 100) / 100)) : g.texto))
    .join("; ")
}
