"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Truck, Package, CheckCircle2, Clock, AlertCircle, Calendar } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import type { RouteSheet } from "@/lib/types"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"

type FiltroFecha = "hoy" | "ayer" | "ultimos7" | "ultimos30" | "todas" | "personalizado"

export function DashboardOverview() {
  const [planillas, setPlanillas] = useState<RouteSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroFecha, setFiltroFecha] = useState<FiltroFecha>("todas")
  const [fechaDesde, setFechaDesde] = useState("")
  const [fechaHasta, setFechaHasta] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/planillas', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) throw new Error('Error al cargar planillas')
      
      const data = await response.json()
      
      const planillasData: RouteSheet[] = (data.planillas || []).map((p: any) => ({
        id: p.id,
        ruta: p.tipo_ruta,
        fecha: p.fecha,
        entregador: p.entregador,
        estado: p.estado,
        totalOrders: p.pedidos?.length || 0,
        totalAmount: Number(p.total_cargue) || 0,
        montoCargue: Number(p.total_cargue) || 0,
        montoEntregado: Number(p.total_entregado) || 0,
        montoFiado: Number(p.total_fiado) || 0,
        montoDevoluciones: Number(p.total_devolucion) || 0,
        montoRepasos: Number(p.total_repaso) || 0,
        orders: (p.pedidos || []).map((ped: any) => ({
          id: ped.id,
          cliente: ped.cliente,
          ruta: p.tipo_ruta,
          fecha: p.fecha,
          estado: ped.estado,
          total: Number(ped.total) || 0,
          montoPagado: 0,
          saldoPendiente: Number(ped.total) || 0,
          comentarios: ped.observaciones,
          items: (ped.productos || []).map((prod: any) => ({
            codigo: prod.codigo,
            descripcion: prod.nombre,
            categoria: '',
            cantidad: Number(prod.cantidad) || 0,
            valorUnidad: Number(prod.precio_unitario) || 0,
            subtotal: Number(prod.total) || 0,
          })),
        })),
        cuentasPorCobrar: [],
      }))
      
      setPlanillas(planillasData)
    } catch (err) {
      console.error("Error loading planillas:", err)
    } finally {
      setLoading(false)
    }
  }

  // Función para filtrar planillas según el rango de fechas
  const getPlanillasFiltradas = () => {
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    
    return planillas.filter((p) => {
      if (!p.fecha) return false // Ignorar planillas sin fecha
      
      try {
        // Asegurar formato de fecha correcto
        const fechaStr = typeof p.fecha === 'string' ? p.fecha : p.fecha.toString()
        const fechaPlanilla = new Date(fechaStr.includes('T') ? fechaStr : fechaStr + 'T00:00:00')
        
        // Validar que la fecha sea válida
        if (isNaN(fechaPlanilla.getTime())) return false
        
        const fechaPlanillaStr = fechaPlanilla.toISOString().split('T')[0]
        const hoyStr = hoy.toISOString().split('T')[0]
        
        switch (filtroFecha) {
          case "hoy":
            return fechaPlanillaStr === hoyStr
          
          case "ayer":
            const ayer = new Date(hoy)
            ayer.setDate(ayer.getDate() - 1)
            return fechaPlanillaStr === ayer.toISOString().split('T')[0]
          
          case "ultimos7":
            const hace7dias = new Date(hoy)
            hace7dias.setDate(hace7dias.getDate() - 7)
            return fechaPlanilla >= hace7dias && fechaPlanilla <= hoy
          
          case "ultimos30":
            const hace30dias = new Date(hoy)
            hace30dias.setDate(hace30dias.getDate() - 30)
            return fechaPlanilla >= hace30dias && fechaPlanilla <= hoy
          
          case "personalizado":
            if (!fechaDesde || !fechaHasta) return true
            const desde = new Date(fechaDesde + 'T00:00:00')
            const hasta = new Date(fechaHasta + 'T23:59:59')
            return fechaPlanilla >= desde && fechaPlanilla <= hasta
          
          case "todas":
          default:
            return true
        }
      } catch (error) {
        console.error('Error procesando fecha:', p.fecha, error)
        return false
      }
    })
  }

  const planillasFiltradas = getPlanillasFiltradas()

  const estadisticas = {
    totalRutas: planillasFiltradas.length,
    rutasPendientes: planillasFiltradas.filter((p) => p.estado === "pendiente").length,
    rutasAlistando: planillasFiltradas.filter((p) => p.estado === "alistando").length,
    rutasAlistadas: planillasFiltradas.filter((p) => p.estado === "alistado").length,
    rutasEnReparto: planillasFiltradas.filter((p) => p.estado === "en_reparto").length,
    rutasCompletadas: planillasFiltradas.filter((p) => p.estado === "completado").length,
    totalPedidos: planillasFiltradas.reduce((sum, p) => sum + p.totalOrders, 0),
    totalCargue: planillasFiltradas.reduce((sum, p) => sum + p.totalAmount, 0),
  }

  // Agrupar por entregador
  const porEntregador = planillasFiltradas.reduce(
    (acc, p) => {
      if (!p.entregador) return acc
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

  const getFiltroLabel = () => {
    switch (filtroFecha) {
      case "hoy": return "Hoy"
      case "ayer": return "Ayer"
      case "ultimos7": return "Últimos 7 días"
      case "ultimos30": return "Últimos 30 días"
      case "personalizado": return "Rango personalizado"
      case "todas": return "Todas"
      default: return "Todas"
    }
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
      {/* Filtros de fecha */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Filtrar por fecha:</span>
          </div>
          
          <Select value={filtroFecha} onValueChange={(v: FiltroFecha) => setFiltroFecha(v)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las fechas</SelectItem>
              <SelectItem value="hoy">Hoy</SelectItem>
              <SelectItem value="ayer">Ayer</SelectItem>
              <SelectItem value="ultimos7">Últimos 7 días</SelectItem>
              <SelectItem value="ultimos30">Últimos 30 días</SelectItem>
              <SelectItem value="personalizado">Rango personalizado</SelectItem>
            </SelectContent>
          </Select>

          {filtroFecha === "personalizado" && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="w-[150px]"
              />
              <span>hasta</span>
              <Input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="w-[150px]"
              />
            </div>
          )}
        </div>
      </Card>

      {/* Resumen */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Resumen - {getFiltroLabel()}</h2>
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
            <p className="text-sm text-muted-foreground">Total Pedidos</p>
          </div>
          <p className="text-3xl font-bold">{estadisticas.totalPedidos}</p>
        </Card>

        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Cargue</p>
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

      {/* Rutas detalladas */}
      {planillasFiltradas.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Detalle de Rutas ({planillasFiltradas.length})</h2>
          <Card className="p-4">
            <div className="space-y-3">
              {planillasFiltradas.map((planilla) => (
                <div key={planilla.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <p className="font-semibold">Ruta {planilla.ruta}</p>
                      <p className="text-sm text-muted-foreground">{planilla.entregador || "Sin asignar"}</p>
                      <p className="text-xs text-muted-foreground">({planilla.fecha})</p>
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

      {planillasFiltradas.length === 0 && (
        <Card className="p-8">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-semibold mb-1">No hay rutas en el rango seleccionado</p>
            <p className="text-sm text-muted-foreground">Intenta cambiar el filtro de fecha</p>
          </div>
        </Card>
      )}
    </div>
  )
}
