"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DollarSign, LogOut, Filter, Wallet } from "lucide-react"
import type { RouteSheet, User } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ComisionesView } from "@/components/comisiones-view"

interface CajaViewProps {
  onLogout: () => void
  user: User
}

export function CajaView({ onLogout, user }: CajaViewProps) {
  const [filterEntregador, setFilterEntregador] = useState<string>("all")
  const [filterRuta, setFilterRuta] = useState<string>("all")
  const [selectedView, setSelectedView] = useState<"caja" | "comisiones">("caja")
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const response = await fetch('/api/planillas', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) throw new Error('Error al cargar planillas')
      
      const data = await response.json()
      
      // Transformar datos del API al formato RouteSheet
      const planillas: RouteSheet[] = (data.planillas || []).map((p: any) => ({
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
      
      console.log('📦 [CAJA] Planillas cargadas:', planillas.length)
      setRouteSheets(planillas)
    } catch (err) {
      console.error("[CAJA] Error loading planillas:", err)
    } finally {
      setLoading(false)
    }
  }

  // CORRECCIÓN: Estados correctos según la BD
  const completedRoutes = routeSheets.filter((s) => 
    s.estado === "en_ruta" || s.estado === "completado"
  )

  console.log('✅ [CAJA] Rutas completadas:', completedRoutes.length)

  const entregadores = Array.from(new Set(completedRoutes.map((r) => r.entregador).filter(Boolean))) as string[]
  const rutas = Array.from(new Set(completedRoutes.map((r) => r.ruta)))

  const filteredRoutes = completedRoutes.filter((route) => {
    if (filterEntregador !== "all" && route.entregador !== filterEntregador) return false
    if (filterRuta !== "all" && route.ruta !== filterRuta) return false
    return true
  })

  const calculateRouteTotals = (route: RouteSheet) => {
    let entregado = 0
    let fiado = 0
    let devoluciones = 0
    let repasos = 0

    route.orders.forEach((order) => {
      const orderTotal = order.items.reduce((sum, item) => {
        if (item.devuelto) {
          devoluciones += item.subtotal
          return sum
        }
        return sum + item.subtotal
      }, 0)

      if (order.estado === "entregado") {
        entregado += orderTotal
      } else if (order.estado === "fiado") {
        fiado += orderTotal
      } else if (order.estado === "devolucion") {
        devoluciones += orderTotal
      } else if (order.estado === "repaso") {
        repasos += orderTotal
      }
    })

    return { entregado, fiado, devoluciones, repasos }
  }

  const totalCargue = filteredRoutes.reduce((sum, r) => sum + r.totalAmount, 0)

  let totalEntregado = 0
  let totalFiado = 0
  let totalDevoluciones = 0
  let totalRepasos = 0

  filteredRoutes.forEach((route) => {
    const totals = calculateRouteTotals(route)
    totalEntregado += totals.entregado
    totalFiado += totals.fiado
    totalDevoluciones += totals.devoluciones
    totalRepasos += totals.repasos
  })

  return (
    <>
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Caja - Cuadre de Cuentas</h1>
                <p className="text-xs text-muted-foreground">Recepción y control de efectivo</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-6">
          <div className="flex gap-2">
            <Button
              variant={selectedView === "caja" ? "default" : "outline"}
              onClick={() => setSelectedView("caja")}
              size="sm"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Cuadre de Caja
            </Button>
            <Button
              variant={selectedView === "comisiones" ? "default" : "outline"}
              onClick={() => setSelectedView("comisiones")}
              size="sm"
            >
              <Wallet className="h-4 w-4 mr-2" />
              Comisiones
            </Button>
          </div>

          {selectedView === "comisiones" ? (
            <ComisionesView onLogout={onLogout} userRole="caja" userId={user.id} />
          ) : (
            <>
              <Card className="p-4">
                <div className="flex items-center gap-4">
                  <Filter className="h-5 w-5 text-muted-foreground" />
                  <Select value={filterEntregador} onValueChange={setFilterEntregador}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Todos los entregadores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los entregadores</SelectItem>
                      {entregadores.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterRuta} onValueChange={setFilterRuta}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Todas las rutas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las rutas</SelectItem>
                      {rutas.map((r) => (
                        <SelectItem key={r} value={r}>
                          Ruta {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Card>

              <div className="grid grid-cols-5 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-1">Total Cargue</p>
                  <p className="text-2xl font-bold">{formatCOP(totalCargue)}</p>
                </Card>
                <Card className="p-4 bg-green-50 border-green-200">
                  <p className="text-sm text-green-700 mb-1">Entregado</p>
                  <p className="text-2xl font-bold text-green-600">{formatCOP(totalEntregado)}</p>
                </Card>
                <Card className="p-4 bg-yellow-50 border-yellow-200">
                  <p className="text-sm text-yellow-700 mb-1">Fiado (CxC)</p>
                  <p className="text-2xl font-bold text-yellow-600">{formatCOP(totalFiado)}</p>
                </Card>
                <Card className="p-4 bg-red-50 border-red-200">
                  <p className="text-sm text-red-700 mb-1">Devoluciones</p>
                  <p className="text-2xl font-bold text-red-600">{formatCOP(totalDevoluciones)}</p>
                </Card>
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <p className="text-sm text-blue-700 mb-1">Repasos</p>
                  <p className="text-2xl font-bold text-blue-600">{formatCOP(totalRepasos)}</p>
                </Card>
              </div>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Detalle por Entregador y Ruta</h2>
                {filteredRoutes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No hay entregas completadas para mostrar
                  </p>
                ) : (
                  <div className="space-y-4">
                    {filteredRoutes.map((route) => {
                      const totals = calculateRouteTotals(route)

                      return (
                        <div key={route.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <p className="font-semibold">
                                {route.entregador} - Ruta {route.ruta}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {route.totalOrders} pedidos · Fecha: {new Date(route.fecha).toLocaleDateString('es-CO')}
                              </p>
                            </div>
                            <span className="text-sm px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                              {route.estado}
                            </span>
                          </div>

                          <div className="grid grid-cols-5 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">Cargue</p>
                              <p className="font-semibold">{formatCOP(route.totalAmount)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Entregado</p>
                              <p className="font-semibold text-green-600">{formatCOP(totals.entregado)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Fiado</p>
                              <p className="font-semibold text-yellow-600">{formatCOP(totals.fiado)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Devoluciones</p>
                              <p className="font-semibold text-red-600">{formatCOP(totals.devoluciones)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Repasos</p>
                              <p className="font-semibold text-blue-600">{formatCOP(totals.repasos)}</p>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Efectivo a Recibir:</p>
                              <p className="text-lg font-bold text-green-600">{formatCOP(totals.entregado)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </main>
    </>
  )
}
