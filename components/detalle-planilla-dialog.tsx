"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"

interface Producto {
  codigo: string
  nombre: string
  cantidad: number
  precio: number
  total: number
  alistamiento: string | null
  faltante: number
  comentario: string | null
}
interface Pedido {
  id: string
  cliente: string
  total: number
  productos: Producto[]
}
interface Planilla {
  id: string
  ruta: string
  fechaAlistamiento: string | null
  alistadoEn: string | null
  cargue: number
  pedidos: Pedido[]
}
interface Detalle {
  cuadre: { id: number; entregador: string; cuadradoEn: string }
  planillas: Planilla[]
}

const ESTADO: Record<string, { texto: string; clase: string }> = {
  completo: { texto: "Completo", clase: "bg-green-100 text-green-800" },
  incompleto: { texto: "Incompleto", clase: "bg-yellow-100 text-yellow-800" },
  no_alistado: { texto: "No alistado", clase: "bg-red-100 text-red-800" },
  reemplazo: { texto: "Reemplazo", clase: "bg-orange-100 text-orange-800" },
}

const fechaHora = (v: string | null) => {
  if (!v) return "-"
  const d = new Date(v)
  return isNaN(d.getTime())
    ? String(v).slice(0, 10)
    : d.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// "Ver planilla" del Historial de caja: las planillas de un cuadre ya cerrado con cada cliente y sus
// productos, leídas del archivo (al cuadrar, los pedidos salen de la pantalla pero no se pierden).
// Se consulta solo al abrirla.
export function DetallePlanillaDialog({ cuadreId, onClose }: { cuadreId: number; onClose: () => void }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [ruta, setRuta] = useState<string>("todas")

  useEffect(() => {
    fetch(`/api/cuadres-caja/${cuadreId}/detalle`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || "No se pudo cargar la planilla")
        setDetalle(data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar la planilla"))
  }, [cuadreId])

  const texto = busqueda.trim().toLowerCase()
  const planillas = useMemo(() => {
    if (!detalle) return []
    return detalle.planillas
      .filter((p) => ruta === "todas" || p.ruta === ruta)
      .map((p) => ({
        ...p,
        pedidos: p.pedidos
          .map((pe) => {
            if (!texto || pe.cliente.toLowerCase().includes(texto)) return pe
            const productos = pe.productos.filter((pr) => `${pr.codigo} ${pr.nombre}`.toLowerCase().includes(texto))
            return productos.length > 0 ? { ...pe, productos } : null
          })
          .filter(Boolean) as Pedido[],
      }))
      .filter((p) => p.pedidos.length > 0)
  }, [detalle, ruta, texto])

  const totales = useMemo(() => {
    const todos = detalle?.planillas || []
    return {
      clientes: todos.reduce((s, p) => s + p.pedidos.length, 0),
      lineas: todos.reduce((s, p) => s + p.pedidos.reduce((t, pe) => t + pe.productos.length, 0), 0),
      cargue: todos.reduce((s, p) => s + p.cargue, 0),
    }
  }, [detalle])

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="w-[95vw] max-w-5xl sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Planilla alistada · cuadre #{cuadreId}
            {detalle ? ` · ${detalle.cuadre.entregador}` : ""}
          </DialogTitle>
          <DialogDescription>
            {detalle
              ? `Rutas ${detalle.planillas.map((p) => p.ruta).join(", ")} · alistadas ${fechaHora(detalle.planillas[0]?.alistadoEn ?? null)} · cuadradas ${fechaHora(detalle.cuadre.cuadradoEn)}`
              : "Pedidos y productos tal como se alistaron"}
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!detalle && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        )}

        {detalle && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded border p-2">
                <p className="text-xs text-muted-foreground">Clientes</p>
                <p className="text-lg font-bold">{totales.clientes}</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-xs text-muted-foreground">Líneas de producto</p>
                <p className="text-lg font-bold">{totales.lineas}</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-xs text-muted-foreground">Cargue</p>
                <p className="text-lg font-bold">{formatCOP(totales.cargue)}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente, producto o código"
                className="max-w-xs"
              />
              {["todas", ...detalle.planillas.map((p) => p.ruta)].map((r) => (
                <button
                  key={r}
                  onClick={() => setRuta(r)}
                  className={`px-3 py-1 rounded-full text-sm border ${ruta === r ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                >
                  {r === "todas" ? "Todas" : `Ruta ${r}`}
                </button>
              ))}
            </div>

            {detalle.planillas.every((p) => p.pedidos.length === 0) && (
              <p className="text-sm text-muted-foreground">
                Este cuadre es de antes de que se guardara el archivo de pedidos: no quedó el detalle de productos.
              </p>
            )}

            {planillas.length === 0 && detalle.planillas.some((p) => p.pedidos.length > 0) && (
              <p className="text-sm text-muted-foreground py-4">Ningún cliente ni producto coincide con la búsqueda.</p>
            )}

            <div className="space-y-4">
              {planillas.map((p) => (
                <div key={p.id}>
                  <h3 className="font-semibold text-sm bg-muted rounded px-2 py-1">
                    Ruta {p.ruta} · {p.pedidos.length} cliente(s) · {formatCOP(p.cargue)}
                  </h3>
                  <div className="space-y-2 mt-2">
                    {p.pedidos.map((pe) => (
                      <div key={pe.id} className="border rounded">
                        <div className="flex justify-between px-2 py-1 bg-blue-50 text-sm font-medium">
                          <span>{pe.cliente}</span>
                          <span>{formatCOP(pe.total)}</span>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="text-left px-2 py-1 w-16">Código</th>
                              <th className="text-left px-2 py-1">Producto</th>
                              <th className="text-right px-2 py-1 w-12">Cant.</th>
                              <th className="text-right px-2 py-1 w-20">Precio</th>
                              <th className="text-right px-2 py-1 w-24">Total</th>
                              <th className="text-center px-2 py-1 w-24">Alistamiento</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pe.productos.map((pr, i) => {
                              const est = pr.alistamiento ? ESTADO[pr.alistamiento] : undefined
                              return (
                                <tr key={i} className="border-t align-top">
                                  <td className="px-2 py-1 font-mono">{pr.codigo}</td>
                                  <td className="px-2 py-1">
                                    {pr.nombre}
                                    {pr.comentario && est && pr.alistamiento !== "completo" && (
                                      <span className="block text-amber-700">{pr.comentario}</span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1 text-right">{pr.cantidad}</td>
                                  <td className="px-2 py-1 text-right">{formatCOP(pr.precio)}</td>
                                  <td className="px-2 py-1 text-right">{formatCOP(pr.total)}</td>
                                  <td className="px-2 py-1 text-center">
                                    {est ? <span className={`px-2 py-0.5 rounded-full ${est.clase}`}>{est.texto}</span> : "-"}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
