"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"

interface BadgeNovedadesProps {
  pedidoId: string
}

interface Novedad {
  id: string
  tipo_novedad: string
  validado: boolean
}

export function BadgeNovedades({ pedidoId }: BadgeNovedadesProps) {
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNovedades()
  }, [pedidoId])

  async function loadNovedades() {
    try {
      const response = await fetch(`/api/novedades?pedidoId=${pedidoId}`)
      if (!response.ok) return

      const data = await response.json()
      setNovedades(data.novedades || [])
    } catch (error) {
      console.error("Error cargando novedades:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading || novedades.length === 0) return null

  const getIcon = (tipo: string) => {
    switch (tipo) {
      case "agotado": return "⚫"
      case "devolucion": return "🔴"
      case "fiado_parcial": return "🟠"
      case "error_facturacion": return "🟡"
      default: return "⚪"
    }
  }

  const getColor = (tipo: string) => {
    switch (tipo) {
      case "agotado": return "bg-gray-500 text-white"
      case "devolucion": return "bg-red-500 text-white"
      case "fiado_parcial": return "bg-orange-500 text-white"
      case "error_facturacion": return "bg-yellow-500 text-black"
      default: return "bg-gray-400 text-white"
    }
  }

  // Agrupar por tipo
  const novedadesPorTipo = novedades.reduce((acc: Record<string, number>, nov) => {
    acc[nov.tipo_novedad] = (acc[nov.tipo_novedad] || 0) + 1
    return acc
  }, {})

  const hayPendientes = novedades.some(n => !n.validado)

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {Object.entries(novedadesPorTipo).map(([tipo, cantidad]) => (
        <Badge
          key={tipo}
          variant="outline"
          className={`text-xs px-1.5 py-0.5 ${getColor(tipo)}`}
        >
          {getIcon(tipo)}
          {cantidad > 1 && ` x${cantidad}`}
        </Badge>
      ))}

      {hayPendientes && (
        <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-800 border-yellow-300">
          ⚠️
        </Badge>
      )}
    </div>
  )
}
