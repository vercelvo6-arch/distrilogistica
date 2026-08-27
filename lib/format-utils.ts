export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatCOPWithDecimals(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(value)
}

// Fecha de "hoy" en horario Colombia (YYYY-MM-DD), sin usar toISOString() que
// convierte a UTC y desfasa el día calendario a partir de las 7pm hora Bogotá
// (UTC-5). Usarla para comparar contra fechas registradas en horario Colombia.
export function getFechaHoyBogota(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
}
