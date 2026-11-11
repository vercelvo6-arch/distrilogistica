"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

interface FaltanteEntregado {
  codigo: string
  producto: string
  rutas: string[]
  comentario: string
  faltante: number
  entregado: number
  estado: string
  tipo: string | null
  nota: string | null
  marcadoPor: string | null
  resueltoPor: string | null
  fechaResolucion: string | null
  entregadoDeMas: number
}

const ESTADO: Record<string, { texto: string; clase: string }> = {
  resuelto: { texto: "Entregado", clase: "bg-green-100 text-green-800" },
  definitivo: { texto: "No se entregó", clase: "bg-gray-100 text-gray-700" },
  pendiente: { texto: "Sin subsanar", clase: "bg-yellow-100 text-yellow-800" },
}

const fechaHora = (v: string | null) => {
  if (!v) return "-"
  const d = new Date(v)
  return isNaN(d.getTime())
    ? String(v).slice(0, 10)
    : d.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
}

// "Ver planilla con faltantes entregados" del Historial de caja: lo que faltó al alistar y lo que el
// coordinador entregó después al subsanarlo, junto al comentario del alistador. Se marca en rojo
// cuando se entregó más de lo que el alistador escribió. Se consulta solo al abrirla.
export function FaltantesEntregadosDialog({ cuadreId, onClose }: { cuadreId: number; onClose: () => void }) {
  const [datos, setDatos] = useState<{ cuadre: { entregador: string; cuadradoEn: string }; faltantes: FaltanteEntregado[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")

  useEffect(() => {
    fetch(`/api/cuadres-caja/${cuadreId}/faltantes`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || "No se pudieron cargar los faltantes")
        setDatos(data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "No se pudieron cargar los faltantes"))
  }, [cuadreId])

  const texto = busqueda.trim().toLowerCase()
  const lista = useMemo(
    () => (datos?.faltantes || []).filter((f) => !texto || `${f.codigo} ${f.producto}`.toLowerCase().includes(texto)),
    [datos, texto],
  )
  const resumen = useMemo(() => {
    const todos = datos?.faltantes || []
    return {
      productos: todos.length,
      entregados: todos.filter((f) => f.estado === "resuelto").length,
      deMas: todos.filter((f) => f.entregadoDeMas > 0).length,
    }
  }, [datos])

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="w-[95vw] max-w-5xl sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Faltantes entregados · cuadre #{cuadreId}
            {datos ? ` · ${datos.cuadre.entregador}` : ""}
          </DialogTitle>
          <DialogDescription>Lo que faltó al alistar y lo que entregó el coordinador al subsanarlo.</DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!datos && !error && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </p>
        )}

        {datos && (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded border p-2">
                <p className="text-xs text-muted-foreground">Productos con faltante</p>
                <p className="text-lg font-bold">{resumen.productos}</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-xs text-muted-foreground">Entregados por el coordinador</p>
                <p className="text-lg font-bold">{resumen.entregados}</p>
              </div>
              <div className={`rounded border p-2 ${resumen.deMas > 0 ? "border-red-300 bg-red-50" : ""}`}>
                <p className="text-xs text-muted-foreground">Entregados de más</p>
                <p className={`text-lg font-bold ${resumen.deMas > 0 ? "text-red-700" : ""}`}>{resumen.deMas}</p>
              </div>
            </div>

            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto o código" />

            {lista.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Este cuadre no tiene faltantes.</p>
            ) : (
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-xs md:text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Producto</th>
                      <th className="text-left p-2">Ruta</th>
                      <th className="text-left p-2">Comentario del alistador</th>
                      <th className="text-right p-2">Faltó</th>
                      <th className="text-right p-2">Entregó coordinador</th>
                      <th className="text-left p-2">Estado</th>
                      <th className="text-left p-2">Quién y cuándo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((f, i) => {
                      const est = ESTADO[f.estado] || { texto: f.estado, clase: "bg-gray-100 text-gray-700" }
                      return (
                        <tr key={i} className={`border-t ${f.entregadoDeMas > 0 ? "bg-red-50" : ""}`}>
                          <td className="p-2">
                            {f.producto}
                            <span className="block font-mono text-[11px] text-muted-foreground">{f.codigo}</span>
                          </td>
                          <td className="p-2">{f.rutas.join(", ") || "-"}</td>
                          <td className="p-2">{f.comentario || "-"}</td>
                          <td className="p-2 text-right">{f.faltante}</td>
                          <td className={`p-2 text-right font-semibold ${f.entregadoDeMas > 0 ? "text-red-700" : ""}`}>
                            {f.estado === "resuelto" ? f.entregado : "-"}
                            {f.entregadoDeMas > 0 && (
                              <span className="block text-[11px] font-normal">+{f.entregadoDeMas} de más</span>
                            )}
                          </td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-[11px] ${est.clase}`}>{est.texto}</span>
                          </td>
                          <td className="p-2 text-[11px] text-muted-foreground">
                            {f.marcadoPor ? `Alistó: ${f.marcadoPor}` : ""}
                            {f.resueltoPor ? <span className="block">Subsanó: {f.resueltoPor} · {fechaHora(f.fechaResolucion)}</span> : null}
                            {f.nota ? <span className="block italic">“{f.nota}”</span> : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
