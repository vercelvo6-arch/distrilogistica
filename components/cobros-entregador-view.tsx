"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ChevronDown, ChevronUp } from "lucide-react"
import { formatCOP, getFechaHoyBogota } from "@/lib/format-utils"

interface Cobro {
  id: string
  entregador: string
  fecha: string | null
  cuadreId: number | null
  cliente: string | null
  efectivo: number
  electronico: number
  medio: string | null
  referencia: string | null
  administrativo: boolean
}

interface Totales {
  rutaEfectivo: number
  rutaElectronico: number
  adminEfectivo: number
  adminElectronico: number
  total: number
}

// Un mismo entregador aparece con nombres distintos según el grupo de rutas
// ("Alfonso 72 - 84", "Alfonso 6C-7B-93"…): se suman juntos por la primera palabra,
// igual que el filtro del Historial. "Entregador Extra" se deja con su nombre completo.
const familiaDe = (nombre: string) => {
  const palabras = String(nombre || "").trim().split(/\s+/)
  const primera = (palabras[0] || "").toLowerCase()
  if (!primera) return "(sin entregador)"
  if (primera === "entregador") return String(nombre).trim()
  return primera.charAt(0).toUpperCase() + primera.slice(1)
}

const sumar = (cobros: Cobro[]): Totales => {
  const t = { rutaEfectivo: 0, rutaElectronico: 0, adminEfectivo: 0, adminElectronico: 0, total: 0 }
  for (const c of cobros) {
    if (c.administrativo) {
      t.adminEfectivo += c.efectivo
      t.adminElectronico += c.electronico
    } else {
      t.rutaEfectivo += c.efectivo
      t.rutaElectronico += c.electronico
    }
    t.total += c.efectivo + c.electronico
  }
  return t
}

const formatFecha = (f: string | null) => {
  if (!f) return "-"
  const d = new Date(`${String(f).slice(0, 10)}T12:00:00`)
  return isNaN(d.getTime()) ? String(f).slice(0, 10) : d.toLocaleDateString("es-CO")
}

// Pestaña "Cobros por entregador" del Historial: cuánto cobró cada entregador en fiados,
// separando lo que cobró él (en ruta o en el cuadre) de los pagos administrativos que
// entraron a su cuadre. Es la suma que sirve para revisar su comisión.
export function CobrosEntregadorView() {
  const hoy = getFechaHoyBogota()
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const [cobros, setCobros] = useState<Cobro[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)

  const cargar = async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/cuadres-caja/cobros?desde=${desde}&hasta=${hasta}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudieron cargar los cobros")
      setCobros(data.cobros || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los cobros")
      setCobros([])
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const porEntregador = useMemo(() => {
    const grupos = new Map<string, Cobro[]>()
    for (const c of cobros) {
      const k = familiaDe(c.entregador)
      if (!grupos.has(k)) grupos.set(k, [])
      grupos.get(k)!.push(c)
    }
    return Array.from(grupos.entries())
      .map(([entregador, lista]) => ({ entregador, lista, totales: sumar(lista) }))
      .sort((a, b) => b.totales.total - a.totales.total)
  }, [cobros])

  const general = useMemo(() => sumar(cobros), [cobros])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Desde</label>
          <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="w-[150px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-[150px]" />
        </div>
        <Button size="sm" onClick={cargar} disabled={cargando || !desde || !hasta}>
          {cargando ? "Cargando..." : "Ver cobros"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Cobros de fiados que entraron en cuadres cerrados entre esas fechas (fecha del cuadre). "Cobrado por él" es lo que
        cobró el entregador en ruta o caja registró en su cuadre; "Pagos administrativos" son los del Cuadre Administrativo:
        ese efectivo no lo trae él, pero el cobro es suyo y suma a su comisión. Toque un entregador para ver el detalle.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left py-2 px-3 font-semibold">Entregador</th>
              <th className="text-right py-2 px-3 font-semibold">Cobrado por él · efectivo</th>
              <th className="text-right py-2 px-3 font-semibold">Cobrado por él · Nequi/banco</th>
              <th className="text-right py-2 px-3 font-semibold">Pagos administrativos · efectivo</th>
              <th className="text-right py-2 px-3 font-semibold">Pagos administrativos · Nequi/banco</th>
              <th className="text-right py-2 px-3 font-semibold">Total cobros</th>
            </tr>
          </thead>
          <tbody>
            {porEntregador.length === 0 && !cargando && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted-foreground">No hay cobros en esas fechas</td>
              </tr>
            )}
            {porEntregador.map(({ entregador, lista, totales }) => (
              <Fragment key={entregador}>
                <tr
                  className="border-b hover:bg-muted/50 cursor-pointer"
                  onClick={() => setAbierto(abierto === entregador ? null : entregador)}
                >
                  <td className="py-2 px-3 font-medium">
                    <span className="inline-flex items-center gap-1">
                      {abierto === entregador ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      {entregador}
                      <span className="text-xs text-muted-foreground">({lista.length})</span>
                    </span>
                  </td>
                  <td className="text-right py-2 px-3">{formatCOP(totales.rutaEfectivo)}</td>
                  <td className="text-right py-2 px-3">{formatCOP(totales.rutaElectronico)}</td>
                  <td className="text-right py-2 px-3">{formatCOP(totales.adminEfectivo)}</td>
                  <td className="text-right py-2 px-3">{formatCOP(totales.adminElectronico)}</td>
                  <td className="text-right py-2 px-3 font-bold">{formatCOP(totales.total)}</td>
                </tr>
                {abierto === entregador && (
                  <tr className="border-b bg-muted/30">
                    <td colSpan={6} className="p-3">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left py-1 px-2">Fecha cuadre</th>
                            <th className="text-left py-1 px-2">Cuadre</th>
                            <th className="text-left py-1 px-2">Cliente</th>
                            <th className="text-left py-1 px-2">Origen</th>
                            <th className="text-right py-1 px-2">Efectivo</th>
                            <th className="text-right py-1 px-2">Nequi/banco</th>
                            <th className="text-left py-1 px-2">Referencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lista.map((c) => (
                            <tr key={c.id} className="border-t">
                              <td className="py-1 px-2 whitespace-nowrap">{formatFecha(c.fecha)}</td>
                              <td className="py-1 px-2">{c.cuadreId ? `#${c.cuadreId}` : "-"}</td>
                              <td className="py-1 px-2">{c.cliente || "-"}</td>
                              <td className="py-1 px-2">
                                {c.administrativo ? "Pago administrativo" : "Cobrado por él"}
                                <span className="text-muted-foreground"> · {c.entregador}</span>
                              </td>
                              <td className="text-right py-1 px-2">{c.efectivo ? formatCOP(c.efectivo) : "-"}</td>
                              <td className="text-right py-1 px-2">{c.electronico ? formatCOP(c.electronico) : "-"}</td>
                              <td className="py-1 px-2 font-mono">{c.referencia || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
          {porEntregador.length > 0 && (
            <tfoot className="bg-muted font-semibold">
              <tr>
                <td className="py-2 px-3">Total</td>
                <td className="text-right py-2 px-3">{formatCOP(general.rutaEfectivo)}</td>
                <td className="text-right py-2 px-3">{formatCOP(general.rutaElectronico)}</td>
                <td className="text-right py-2 px-3">{formatCOP(general.adminEfectivo)}</td>
                <td className="text-right py-2 px-3">{formatCOP(general.adminElectronico)}</td>
                <td className="text-right py-2 px-3">{formatCOP(general.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
