"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, DollarSign, ArrowLeft } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { useToast } from "@/hooks/use-toast"

interface AgrupacionFechasProps {
  onBack: () => void
  entregador: string
}

interface AgrupacionDia {
  fecha: string
  totalRutas: number
  planillasIds: number[]
  rutasNombres: string[]
  totales: {
    cargue: number
    entregado: number
    fiado: number
    repasos: number
    devoluciones: number
    agotados: number
  }
}

export function AgrupacionFechas({ onBack, entregador }: AgrupacionFechasProps) {
  const { toast } = useToast()
  const [agrupaciones, setAgrupaciones] = useState<AgrupacionDia[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAgrupacion()
  }, [])

  async function loadAgrupacion() {
    try {
      const response = await fetch('/api/entregadores/agrupacion')
      
      if (!response.ok) throw new Error('Error al cargar agrupación')
      
      const data = await response.json()
      setAgrupaciones(data.agrupacion || [])
    } catch (err) {
      console.error("[AGRUPACION] Error:", err)
      toast({
        title: "Error",
        description: "No se pudo cargar la agrupación",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // CALCULAR TOTALES GENERALES (SUMA DE TODAS LAS FECHAS)
  const totalesGenerales = agrupaciones.reduce((acc, agrupacion) => ({
    cargue: acc.cargue + agrupacion.totales.cargue,
    entregado: acc.entregado + agrupacion.totales.entregado,
    fiado: acc.fiado + agrupacion.totales.fiado,
    repasos: acc.repasos + agrupacion.totales.repasos,
    devoluciones: acc.devoluciones + agrupacion.totales.devoluciones,
    agotados: acc.agotados + agrupacion.totales.agotados,
  }), { cargue: 0, entregado: 0, fiado: 0, repasos: 0, devoluciones: 0, agotados: 0 })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h2 className="text-xl font-bold">Mis Entregas - Totales</h2>
            <p className="text-sm text-muted-foreground">
              Vista consolidada de todas tus novedades
            </p>
          </div>
        </div>
      </div>

      {/* TOTALES GENERALES - IGUAL QUE CAJA */}
      {agrupaciones.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-3 md:p-4 text-center bg-blue-50 border-blue-200">
            <p className="text-xs text-blue-600 font-medium mb-1">Total Cargue</p>
            <p className="text-lg md:text-xl font-bold text-blue-700">{formatCOP(totalesGenerales.cargue)}</p>
          </Card>
          <Card className="p-3 md:p-4 text-center bg-green-50 border-green-200">
            <p className="text-xs text-green-600 font-medium mb-1">Entregado</p>
            <p className="text-lg md:text-xl font-bold text-green-700">{formatCOP(totalesGenerales.entregado)}</p>
          </Card>
          <Card className="p-3 md:p-4 text-center bg-orange-50 border-orange-200">
            <p className="text-xs text-orange-600 font-medium mb-1">Fiado (CxC)</p>
            <p className="text-lg md:text-xl font-bold text-orange-700">{formatCOP(totalesGenerales.fiado)}</p>
          </Card>
          <Card className="p-3 md:p-4 text-center bg-red-50 border-red-200">
            <p className="text-xs text-red-600 font-medium mb-1">Devoluciones</p>
            <p className="text-lg md:text-xl font-bold text-red-700">{formatCOP(totalesGenerales.devoluciones)}</p>
          </Card>
          <Card className="p-3 md:p-4 text-center bg-blue-50 border-blue-200">
            <p className="text-xs text-blue-600 font-medium mb-1">Repasos</p>
            <p className="text-lg md:text-xl font-bold text-blue-700">{formatCOP(totalesGenerales.repasos)}</p>
          </Card>
          <Card className="p-3 md:p-4 text-center bg-gray-50 border-gray-200">
            <p className="text-xs text-gray-600 font-medium mb-1">Agotados</p>
            <p className="text-lg md:text-xl font-bold text-gray-700">{formatCOP(totalesGenerales.agotados)}</p>
          </Card>
        </div>
      )}

      {agrupaciones.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No hay entregas pendientes</h3>
          <p className="text-muted-foreground">
            Todas tus rutas han sido cuadradas
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Detalle por Fecha</h3>
          {agrupaciones.map((agrupacion) => {
            const totalNovedades = agrupacion.totales.fiado + 
                                    agrupacion.totales.repasos + 
                                    agrupacion.totales.devoluciones + 
                                    agrupacion.totales.agotados
            
            const efectivoAEntregar = agrupacion.totales.cargue - totalNovedades

            return (
              <Card key={agrupacion.fecha} className="p-4 md:p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base md:text-lg font-bold">
                      {new Date(agrupacion.fecha).toLocaleDateString('es-CO', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </h3>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {agrupacion.totalRutas} ruta{agrupacion.totalRutas !== 1 ? 's' : ''} · 
                      Rutas: {agrupacion.rutasNombres.join(', ')}
                    </p>
                  </div>
                </div>

                {/* Totales por fecha */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="text-center p-3 bg-blue-50 rounded">
                    <span className="text-xs text-blue-600 font-medium">Cargue</span>
                    <p className="font-bold text-blue-700">{formatCOP(agrupacion.totales.cargue)}</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded">
                    <span className="text-xs text-green-600 font-medium">Entregado</span>
                    <p className="font-bold text-green-700">{formatCOP(agrupacion.totales.entregado)}</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded">
                    <span className="text-xs text-orange-600 font-medium">Fiado</span>
                    <p className="font-bold text-orange-700">{formatCOP(agrupacion.totales.fiado)}</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded">
                    <span className="text-xs text-red-600 font-medium">Devoluciones</span>
                    <p className="font-bold text-red-700">{formatCOP(agrupacion.totales.devoluciones)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-blue-50 rounded">
                    <span className="text-xs text-blue-600 font-medium">Repasos</span>
                    <p className="font-bold text-blue-700">{formatCOP(agrupacion.totales.repasos)}</p>
                  </div>
                  <div className="text-center p-3 bg-gray-100 rounded">
                    <span className="text-xs text-gray-600 font-medium">Agotados</span>
                    <p className="font-bold text-gray-700">{formatCOP(agrupacion.totales.agotados)}</p>
                  </div>
                </div>

                {/* Efectivo a Entregar */}
                <div className="mt-4 p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded border-2 border-emerald-300">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-6 w-6 text-emerald-600" />
                      <div>
                        <p className="text-sm font-medium text-emerald-800">Efectivo a Entregar</p>
                        <p className="text-xs text-emerald-600">
                          Cargue - Novedades ({formatCOP(agrupacion.totales.cargue)} - {formatCOP(totalNovedades)})
                        </p>
                      </div>
                    </div>
                    <p className="text-xl md:text-2xl font-bold text-emerald-700">
                      {formatCOP(efectivoAEntregar)}
                    </p>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
