"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Trash2, RotateCcw, Loader2 } from "lucide-react"

interface Eliminacion {
  id: string
  tipo_entidad: "planilla" | "pedido" | "novedad"
  entidad_id: string
  contexto: Record<string, any> | null
  motivo: string | null
  eliminado_por_nombre: string | null
  eliminado_en: string
}

const ETIQUETA_TIPO: Record<string, string> = {
  planilla: "Planilla",
  pedido: "Pedido",
  novedad: "Novedad (fiado/agotado/devolución)",
}

function describirContexto(item: Eliminacion): string {
  const c = item.contexto || {}
  if (item.tipo_entidad === "planilla") {
    return `Ruta ${c.ruta ?? "?"} · ${c.entregador ?? "sin entregador"} · ${c.num_pedidos ?? 0} pedido(s)`
  }
  if (item.tipo_entidad === "pedido") {
    return `${c.cliente ?? "sin cliente"} · planilla ${c.planilla_id ?? "?"}`
  }
  return `Pedido ${c.pedido_id ?? "?"} · ${c.tipo_novedad ?? "?"}`
}

export function EliminadosView() {
  const [eliminaciones, setEliminaciones] = useState<Eliminacion[]>([])
  const [loading, setLoading] = useState(true)
  const [restaurandoId, setRestaurandoId] = useState<string | null>(null)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    try {
      const response = await fetch("/api/eliminaciones-historial")
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Error al cargar eliminados")
      setEliminaciones(data.eliminaciones || [])
    } catch (err) {
      console.error("[ELIMINADOS] Error:", err)
      alert("No se pudo cargar el historial de eliminados: " + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRestaurar(item: Eliminacion) {
    if (!confirm(`¿Restaurar ${ETIQUETA_TIPO[item.tipo_entidad]} — ${describirContexto(item)}?`)) {
      return
    }

    setRestaurandoId(item.id)
    try {
      const response = await fetch("/api/eliminaciones-historial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Error al restaurar")

      alert(data.mensaje || "Restaurado correctamente")
      await cargar()
    } catch (err) {
      alert("Error al restaurar: " + (err as Error).message)
    } finally {
      setRestaurandoId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Eliminados
        </h2>
        <p className="text-sm text-muted-foreground">
          Planillas, pedidos y novedades (fiados/agotados/devoluciones) eliminados — se pueden restaurar sin necesitar un archivo externo.
        </p>
      </div>

      {eliminaciones.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No hay eliminados pendientes de restaurar</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {eliminaciones.map((item) => (
            <Card key={item.id} className="p-3 md:p-4 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                    {ETIQUETA_TIPO[item.tipo_entidad] || item.tipo_entidad}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.motivo}</span>
                </div>
                <p className="text-sm font-medium truncate">{describirContexto(item)}</p>
                <p className="text-xs text-muted-foreground">
                  Eliminado por {item.eliminado_por_nombre || "desconocido"} el{" "}
                  {new Date(item.eliminado_en).toLocaleString("es-CO")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleRestaurar(item)}
                disabled={restaurandoId === item.id}
                className="shrink-0"
              >
                {restaurandoId === item.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Restaurar
                  </>
                )}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
