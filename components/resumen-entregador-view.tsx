"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, ChevronRight } from "lucide-react"
import { formatCOP, getFechaHoyBogota } from "@/lib/format-utils"

interface CobroDetalle {
  id: string
  cliente: string | null
  entregador: string | null
  tipo: "entregador" | "administrativo"
  cuadreId: number | null
  efectivo: number
  electronico: number
  referencia: string | null
}

interface DiaResumen {
  fecha: string
  entregado: number
  cobros: number
  descuadre: number
  devoluciones: number
  detalle: CobroDetalle[]
}

const formatDia = (f: string) => {
  const d = new Date(`${f}T12:00:00`)
  return isNaN(d.getTime()) ? f : d.toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "2-digit" })
}

const formatDescuadre = (n: number) => (n > 0 ? `+${formatCOP(n)}` : n < 0 ? `−${formatCOP(Math.abs(n))}` : formatCOP(0))

// Pestaña "Resumen" del Historial: por día, cuatro datos de cada entregador —Entregado,
// Cobros, Descuadre y Devoluciones— solo a título de información: no se suman ni se
// restan entre sí. Debajo de cada día, cada cobro (de él o administrativo).
// Igual que en /api/cuadres-caja/resumen: el Resumen no muestra nada antes de octubre de 2026.
const RESUMEN_DESDE_MINIMO = "2026-10-01"

export function ResumenEntregadorView() {
  const hoy = getFechaHoyBogota()
  const [desde, setDesde] = useState(`${hoy.slice(0, 7)}-01`)
  const [hasta, setHasta] = useState(hoy)
  const [familia, setFamilia] = useState("todos")
  const [familias, setFamilias] = useState<string[]>([])
  const [dias, setDias] = useState<DiaResumen[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  // Mismas familias de nombres que el filtro de Cuadres: "Alfonso" reúne sus variantes.
  useEffect(() => {
    fetch("/api/cuadres-caja?listar=entregadores")
      .then((r) => r.json())
      .then((d) => {
        const mapa = new Map<string, string>()
        for (const nombre of d.entregadores || []) {
          const palabras = String(nombre || "").trim().split(/\s+/)
          const clave = (palabras[0] || "").toLowerCase()
          if (!clave) continue
          const etiqueta = clave === "entregador" ? String(nombre).trim() : palabras[0]
          mapa.set(etiqueta.toLowerCase(), etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1).toLowerCase())
        }
        setFamilias(Array.from(mapa.values()).sort((a, b) => a.localeCompare(b)))
      })
      .catch(() => setFamilias([]))
  }, [])

  const cargar = async () => {
    setCargando(true)
    setError(null)
    try {
      const params = new URLSearchParams({ desde, hasta })
      if (familia !== "todos") params.set("familia", familia)
      const res = await fetch(`/api/cuadres-caja/resumen?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudo cargar el resumen")
      setDias(data.dias || [])
      setAbiertos(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el resumen")
      setDias([])
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familia])

  const totales = useMemo(
    () => dias.reduce(
      (t, d) => ({
        entregado: t.entregado + d.entregado,
        cobros: t.cobros + d.cobros,
        descuadre: t.descuadre + d.descuadre,
        devoluciones: t.devoluciones + d.devoluciones,
      }),
      { entregado: 0, cobros: 0, descuadre: 0, devoluciones: 0 }
    ),
    [dias]
  )

  const alternar = (fecha: string) => {
    setAbiertos((prev) => {
      const s = new Set(prev)
      if (s.has(fecha)) s.delete(fecha)
      else s.add(fecha)
      return s
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Entregador</label>
          <Select value={familia} onValueChange={setFamilia}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {familias.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Desde</label>
          <Input type="date" min={RESUMEN_DESDE_MINIMO} value={desde} onChange={(e) => setDesde(e.target.value && e.target.value < RESUMEN_DESDE_MINIMO ? RESUMEN_DESDE_MINIMO : e.target.value)} className="w-[150px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Hasta</label>
          <Input type="date" min={RESUMEN_DESDE_MINIMO} value={hasta} onChange={(e) => setHasta(e.target.value)} className="w-[150px]" />
        </div>
        <Button size="sm" onClick={cargar} disabled={cargando || !desde || !hasta}>
          {cargando ? "Cargando..." : "Ver"}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Datos informativos por día. <b>Entregado</b>: lo que entregó (cargue menos novedades). <b>Cobros</b>: cobros de
        fiados, los que él trajo a su cuadre y los pagos administrativos (el día en que se confirmaron).{" "}
        <b>Descuadre</b>: diferencia del cuadre (− es faltante). <b>Devoluciones</b>: las del cuadre. Toque un día para
        ver cada cobro.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left py-2 px-3 font-semibold">Día</th>
              <th className="text-right py-2 px-3 font-semibold">Entregado</th>
              <th className="text-right py-2 px-3 font-semibold">Cobros</th>
              <th className="text-right py-2 px-3 font-semibold">Descuadre</th>
              <th className="text-right py-2 px-3 font-semibold">Devoluciones</th>
            </tr>
          </thead>
          <tbody>
            {dias.length === 0 && !cargando && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">No hay datos en esas fechas</td>
              </tr>
            )}
            {dias.map((d) => {
              const abierto = abiertos.has(d.fecha)
              return (
                <Fragment key={d.fecha}>
                  <tr className="border-b hover:bg-muted/50 cursor-pointer" onClick={() => alternar(d.fecha)}>
                    <td className="py-2 px-3 font-medium whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        {abierto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        {formatDia(d.fecha)}
                      </span>
                    </td>
                    <td className="text-right py-2 px-3">{formatCOP(d.entregado)}</td>
                    <td className="text-right py-2 px-3">{formatCOP(d.cobros)}</td>
                    <td className={`text-right py-2 px-3 ${d.descuadre < 0 ? "text-red-600" : d.descuadre > 0 ? "text-green-700" : ""}`}>
                      {formatDescuadre(d.descuadre)}
                    </td>
                    <td className="text-right py-2 px-3">{formatCOP(d.devoluciones)}</td>
                  </tr>
                  {abierto && (
                    <tr className="border-b bg-muted/30">
                      <td colSpan={5} className="px-3 py-2">
                        {d.detalle.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin cobros este día</p>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody>
                              {d.detalle.map((c) => (
                                <tr key={c.id} className="border-t first:border-t-0">
                                  <td className="py-1 pr-2">{c.cliente || "-"}</td>
                                  <td className="py-1 pr-2">
                                    <span className={`px-2 py-0.5 rounded-full ${c.tipo === "administrativo" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}`}>
                                      {c.tipo === "administrativo" ? "Administrativo" : "Cobro de él"}
                                    </span>
                                  </td>
                                  <td className="py-1 pr-2 text-muted-foreground">{c.entregador || "-"}</td>
                                  <td className="py-1 pr-2">
                                    {c.efectivo > 0 && c.electronico > 0 ? "Mixto" : c.electronico > 0 ? "Nequi/banco" : "Efectivo"}
                                  </td>
                                  <td className="py-1 pr-2 text-right font-medium">{formatCOP(c.efectivo + c.electronico)}</td>
                                  <td className="py-1 pr-2 font-mono">{c.referencia ? `Ref ${c.referencia}` : ""}</td>
                                  <td className="py-1 text-muted-foreground">{c.cuadreId ? `Cuadre #${c.cuadreId}` : "Cuadre Adm."}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
          {dias.length > 0 && (
            <tfoot className="bg-muted font-semibold">
              <tr>
                <td className="py-2 px-3">Total</td>
                <td className="text-right py-2 px-3">{formatCOP(totales.entregado)}</td>
                <td className="text-right py-2 px-3">{formatCOP(totales.cobros)}</td>
                <td className="text-right py-2 px-3">{formatDescuadre(totales.descuadre)}</td>
                <td className="text-right py-2 px-3">{formatCOP(totales.devoluciones)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
