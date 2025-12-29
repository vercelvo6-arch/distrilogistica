"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Truck, Package, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { getPlanillas } from "@/lib/actions/planillas"
import { formatCOP } from "@/lib/format-utils"
import type { RouteSheet } from "@/lib/types"

export function DashboardOverview() {
  const [planillas, setPlanillas] = useState<RouteSheet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const data = await getPlanillas()
    setPlanillas(data)
    setLoading(false)
  }

  // Obtener estadísticas del día actual
  const hoy = new Date().toISOString().split("T")[0]
  const planillasHoy = planillas.filter((p) => p.fecha === hoy)

  const estadisticas = {
    totalRutas: planillasHoy.length,
    rutasPendientes: planillasHoy.filter((p) => p.estado === "pendiente").length,
    rutasAlistando: planillasHoy.filter((p) => p.estado === "alistando").length,
    rutasAlistadas: planillasHoy.filter((p) => p.estado === "alistado").length,
    rutasEnReparto: planillasHoy.filter((p) => p.estado === "en_reparto").length,
    rutasCompletadas: planillasHoy.filter((p) => p.estado === "completado").length,
    totalPedidos: planillasHoy.reduce((sum, p) => sum + p.totalOrders, 0),
    totalCargue: planillasHoy.reduce((sum, p) => sum + p.totalAmount, 0),
  }

  // Agrupar por entregador
  const porEntregador = planillasHoy.reduce(
    (acc, p) => {
      if (!acc[p.entregador]) {
        acc[p.entregador] = {
          rutas: 0,
          pedidos: 0,
          monto: 0,
          estado: p.estado,
        }
      }
      acc[p.entregador].rutas++
      acc[p.entregador].pedidos += p.totalOrders
      acc[p.entregador].monto += p.totalAmount
      return acc
    },
    {} as Record<string, { rutas: number; pedidos: number; monto: number; estado: string }>,
  )

  const getEstadoBadge = (estado: string) => {
    const estados = {
      pendiente: { color: "bg-gray-100 text-gray-700", icon: Clock },
      alistando: { color: "bg-blue-100 text-blue-700", icon: Package },
      alistado: { color: "bg-purple-100 text-purple-700", icon: CheckCircle2 },
      en_reparto: { color: "bg-yellow-100 text-yellow-700", icon: Truck },
      completado: { color: "bg-green-100 text-green-700", icon: CheckCircle2 },
    }
    const config = estados[estado as keyof typeof estados] || estados.pendiente
    const Icon = config.icon
    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {estado.replace("_", " ")}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
              <div className="h-8 bg-muted rounded w-3/4"></div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Resumen del día */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Resumen del Día - {hoy}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Total Rutas</p>
            </div>
            <p className="text-2xl font-bold">{estadisticas.totalRutas}</p>
          </Card>

          <Card className="p-4 bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-700 mb-1">Alistando</p>
            <p className="text-2xl font-bold text-blue-600">{estadisticas.rutasAlistando}</p>
          </Card>

          <Card className="p-4 bg-purple-50 border-purple-200">
            <p className="text-sm text-purple-700 mb-1">Alistadas</p>
            <p className="text-2xl font-bold text-purple-600">{estadisticas.rutasAlistadas}</p>
          </Card>

          <Card className="p-4 bg-yellow-50 border-yellow-200">
            <p className="text-sm text-yellow-700 mb-1">En Reparto</p>
            <p className="text-2xl font-bold text-yellow-600">{estadisticas.rutasEnReparto}</p>
          </Card>

          <Card className="p-4 bg-green-50 border-green-200">
            <p className="text-sm text-green-700 mb-1">Completadas</p>
            <p className="text-2xl font-bold text-green-600">{estadisticas.rutasCompletadas}</p>
          </Card>
        </div>
      </div>

      {/* Métricas generales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Total Pedidos Hoy</p>
          </div>
          <p className="text-3xl font-bold">{estadisticas.totalPedidos}</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Cargue Hoy</p>
          <p className="text-3xl font-bold text-teal-600">{formatCOP(estadisticas.totalCargue)}</p>
        </Card>
      </div>

      {/* Por Entregador */}
      {Object.keys(porEntregador).length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Actividad por Entregador</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(porEntregador).map(([nombre, data]) => (
              <Card key={nombre} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold">{nombre}</p>
                  {getEstadoBadge(data.estado)}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rutas:</span>
                    <span className="font-semibold">{data.rutas}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pedidos:</span>
                    <span className="font-semibold">{data.pedidos}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Monto:</span>
                    <span className="font-semibold text-teal-600">{formatCOP(data.monto)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Rutas del día con detalles */}
      {planillasHoy.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Detalle de Rutas Hoy</h2>
          <Card className="p-4">
            <div className="space-y-3">
              {planillasHoy.map((planilla) => (
                <div key={planilla.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">Ruta {planilla.ruta}</p>
                      <p className="text-sm text-muted-foreground">{planilla.entregador}</p>
                    </div>
                    {getEstadoBadge(planilla.estado)}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Pedidos</p>
                      <p className="font-semibold">{planilla.totalOrders}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tipo</p>
                      <p className="font-semibold">{planilla.tipoRuta || "Regular"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Monto</p>
                      <p className="font-semibold text-teal-600">{formatCOP(planilla.totalAmount)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {planillasHoy.length === 0 && (
        <Card className="p-8">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-semibold mb-1">No hay rutas programadas para hoy</p>
            <p className="text-sm text-muted-foreground">El coordinador debe crear las planillas del día</p>
          </div>
        </Card>
      )}
    </div>
  )
}
