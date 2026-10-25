// Utilidades del módulo de inventario: normalización de códigos y lectura de los
// tres tipos de archivo (catálogo/inventario del POS y ventas del POS).
//
// Los archivos se leen con un separador simple ";" (igual que lib/csv-parser.ts) y NO con
// comillas CSV: en los archivos reales hay nombres con una comilla suelta ("E18 LLEVA...)
// que romperían un lector CSV estricto.

export function normalizarCodigo(codigo: unknown): string {
  const s = String(codigo ?? "").trim().replace(/^"+|"+$/g, "").trim()
  if (!s) return ""
  // Códigos solo numéricos: "0892" y "892" son el mismo producto.
  if (/^\d+$/.test(s)) return s.replace(/^0+(?=\d)/, "")
  return s.toUpperCase().replace(/\s+/g, "")
}

// "$ 4.510,35" -> 4510.35 ; "$ -" -> 0 ; "-3" -> -3
export function parsearNumero(valor: unknown): number {
  const s = String(valor ?? "").replace(/\$/g, "").replace(/\s/g, "")
  if (!s || s === "-") return 0
  const negativo = s.startsWith("-") || /^\(.*\)$/.test(s)
  const limpio = s.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".")
  const n = Number(limpio)
  if (!Number.isFinite(n)) return 0
  return negativo ? -n : n
}

function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
}

function separarLineas(texto: string): string[] {
  return texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim().length > 0)
}

// Un kit/oferta es todo código con letras (V99, Z1, B145…) o cuyo nombre diga LLEVA / INCLUYE / PROMO / COMBO.
export function esKit(codigoOriginal: string, nombre: string, composicion?: string): boolean {
  if (composicion && composicion.trim()) return true
  if (!/^\d+$/.test(String(codigoOriginal).trim())) return true
  return /\b(LLEVA|INCLUYE|PROMO|COMBO|KIT)\b/i.test(nombre)
}

export interface FilaCatalogo {
  codigo: string
  codigo_original: string
  nombre: string
  categoria: string
  precio_unitario: number
  cantidad: number
  es_kit: boolean
  composicion: string
}

// Archivo de inventario/catálogo del POS. Estructura (11 columnas, separador ";"):
// 0 ubicación · 1 código · 2 nombre · 3 categoría · 4 cantidad · 5 descripción del combo ·
// 6 precio unitario · 7 valor total · 8-10 extras. Se ubican las columnas por el nombre de la
// cabecera; si no se reconocen, se usa esta posición fija.
export function parsearInventarioCSV(texto: string): { filas: FilaCatalogo[]; ignoradas: number } {
  const lineas = separarLineas(texto)
  if (lineas.length < 2) return { filas: [], ignoradas: 0 }

  const cab = lineas[0].split(";").map((c) => normalizarTexto(c))
  const buscar = (pred: (c: string) => boolean, porDefecto: number) => {
    const i = cab.findIndex(pred)
    return i >= 0 ? i : porDefecto
  }
  const iCodigo = buscar((c) => c === "CODIGO" || c.startsWith("CODIGO"), 1)
  const iNombre = buscar((c) => c.startsWith("DESCRIPCION") && c.includes("PRODUCTO"), 2)
  const iCategoria = buscar((c) => c.startsWith("CATEGORIA"), 3)
  const iCantidad = buscar((c) => c.startsWith("CANTIDAD"), 4)
  const iCombo = buscar((c) => c.includes("COMBO"), 5)
  const iPrecio = buscar((c) => c.startsWith("PRECIO"), 6)
  const columnasBase = cab.length

  const porCodigo = new Map<string, FilaCatalogo>()
  let ignoradas = 0

  for (const linea of lineas.slice(1)) {
    let c = linea.split(";")
    // Si el nombre traía un ";" de más, la fila tiene columnas extra y todo lo que va después
    // del nombre queda corrido. Se reconstruye contando desde el FINAL de la fila (las columnas
    // de la derecha son siempre las mismas): el nombre se vuelve a pegar con sus ";".
    if (c.length > columnasBase && iNombre < iCategoria && iCategoria < columnasBase) {
      const desdeElFinal = (i: number) => c.length - (columnasBase - i)
      const iCatFila = desdeElFinal(iCategoria)
      const nombreCompleto = c.slice(iNombre, iCatFila).join(";")
      c = [
        ...c.slice(0, iNombre),
        nombreCompleto,
        ...c.slice(iCatFila),
      ]
    }

    const codigoOriginal = String(c[iCodigo] ?? "").trim().replace(/^"+|"+$/g, "").trim()
    const codigo = normalizarCodigo(codigoOriginal)
    const nombre = String(c[iNombre] ?? "").trim().replace(/^"+|"+$/g, "").trim()
    if (!codigo || !nombre) {
      ignoradas++
      continue
    }
    const composicion = String(c[iCombo] ?? "").trim().replace(/^"+|"+$/g, "").trim()
    porCodigo.set(codigo, {
      codigo,
      codigo_original: codigoOriginal,
      nombre,
      categoria: String(c[iCategoria] ?? "").trim().replace(/\s+/g, " "),
      precio_unitario: parsearNumero(c[iPrecio]),
      cantidad: parsearNumero(c[iCantidad]),
      es_kit: esKit(codigoOriginal, nombre, composicion),
      composicion,
    })
  }

  return { filas: Array.from(porCodigo.values()), ignoradas }
}

export interface FilaVentaPOS {
  fecha: string | null
  id_venta: string
  numero_factura: string
  ruta: string
  vendedor: string
  cliente: string
  codigo: string
  codigo_original: string
  nombre: string
  cantidad: number
  valor: number
  es_devolucion: boolean
}

// "06-08-2026-07:39 am" -> "2026-08-06" ; "2026-08-06" -> igual ; "06/08/2026" -> "2026-08-06"
export function parsearFechaPOS(valor: unknown): string | null {
  const s = String(valor ?? "").trim()
  let m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

// CSV de ventas del POS (16 columnas, separador ";"). Las devoluciones del POS se reconocen por
// cantidad o valor NEGATIVOS; entran con cantidad negativa y es_devolucion = true.
export function parsearVentasPOS(texto: string): { filas: FilaVentaPOS[]; ignoradas: number } {
  const lineas = separarLineas(texto)
  if (lineas.length < 2) return { filas: [], ignoradas: 0 }

  const cab = lineas[0].split(";").map((c) => normalizarTexto(c))
  const buscar = (pred: (c: string) => boolean, porDefecto: number) => {
    const i = cab.findIndex(pred)
    return i >= 0 ? i : porDefecto
  }
  const iCodigo = buscar((c) => c.startsWith("NUMERO DE ARTICULO"), 0)
  const iNombre = buscar((c) => c === "NOMBRE", 2)
  const iCantidad = buscar((c) => c.startsWith("CANTIDAD"), 5)
  const iValor = buscar((c) => c === "TOTALES", 6) // primera columna "Totales" = valor del ítem
  const iVenta = buscar((c) => c.startsWith("ID DE VENTA"), 7)
  const iFactura = buscar((c) => c.startsWith("NUMERO DE FACTURA"), 8)
  const iFecha = buscar((c) => c === "FECHA", 9)
  const iRuta = buscar((c) => c === "RUTA", 10)
  const iVendedor = buscar((c) => c.startsWith("VENDIDO POR"), 12)
  const iCliente = buscar((c) => c.startsWith("VENDIDO A"), 13)

  const filas: FilaVentaPOS[] = []
  let ignoradas = 0

  for (const linea of lineas.slice(1)) {
    const c = linea.split(";").map((v) => v.trim())
    if (c.length < 8) {
      ignoradas++
      continue
    }
    const codigoOriginal = String(c[iCodigo] ?? "").replace(/^"+|"+$/g, "").trim()
    const codigo = normalizarCodigo(codigoOriginal)
    let cantidad = parsearNumero(c[iCantidad])
    const valor = parsearNumero(c[iValor])
    if (!codigo || cantidad === 0) {
      ignoradas++
      continue
    }
    // Línea de devolución con cantidad positiva pero valor negativo: se trata como devolución.
    const esDevolucion = cantidad < 0 || valor < 0
    if (esDevolucion) cantidad = -Math.abs(cantidad)

    filas.push({
      fecha: parsearFechaPOS(c[iFecha]),
      id_venta: String(c[iVenta] ?? ""),
      numero_factura: String(c[iFactura] ?? ""),
      ruta: String(c[iRuta] ?? "").trim(),
      vendedor: String(c[iVendedor] ?? ""),
      cliente: String(c[iCliente] ?? ""),
      codigo,
      codigo_original: codigoOriginal,
      nombre: String(c[iNombre] ?? "").replace(/^"+|"+$/g, "").trim(),
      cantidad,
      valor,
      es_devolucion: esDevolucion,
    })
  }

  return { filas, ignoradas }
}
