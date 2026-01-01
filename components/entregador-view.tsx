"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Truck, LogOut, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react"
import { User } from "lucide-react"
import type { RouteSheet, Order } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import { Checkbox } from "@/components/ui/checkbox"
import {
  updatePedidoEstado,
  updateProductoDevuelto,
  updatePlanillaTotales,
  completarPlanilla,
} from "@/lib/actions/planillas"
import { useToast } from "@/hooks/use-toast"

interface EntregadorViewProps {
  onLogout: () => void
  user: any
}

export function EntregadorView({ onLogout, user }: EntregadorViewProps) {
  const { toast } = useToast()
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null)

  // CRÍTICO: Usar el nombre del usuario para filtrar
  const deliveryPerson = user.nombre

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
            devuelto: prod.devuelto || false,
          })),
        })),
        cuentasPorCobrar: [],
      }))
      
      console.log('📦 [ENTREGADOR] Planillas totales:', planillas.length)
      console.log('👤 [ENTREGADOR] Mi nombre:', deliveryPerson)
      
      // Filtrar SOLO las rutas de ESTE entregador
      const misRutas = planillas.filter(p => p.entregador === deliveryPerson)
      console.log('🚚 [ENTREGADOR] Mis rutas:', misRutas.length)
      
      setRouteSheets(planillas)
    } catch (err) {
      console.error("[ENTREGADOR] Error loading planillas:", err)
    } finally {
      setLoading(false)
    }
  }

  // FILTRO CRÍTICO: Solo mostrar rutas de ESTE entregador que estén alistadas
  const myRoutes = routeSheets.filter((s) => 
    s.entregador === deliveryPerson && s.estado === "alistado"
  )

  console.log('🔍 [ENTREGADOR] Rutas filtradas para mí:', myRoutes.length)

  const handleItemReturn = async (sheetId: string, orderId: string, codigo: string, currentDevuelto: boolean) => {
    try {
      await updateProductoDevuelto(orderId, codigo, !currentDevuelto)
      await loadData()
    } catch (err) {
      console.error("[ENTREGADOR] Error updating product return:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar el producto",
        variant: "destructive",
      })
    }
  }

  const handleOrderStatusChange = async (sheetId: string, orderId: string, newStatus: Order["estado"]) => {
    try {
      await updatePedidoEstado(orderId, newStatus)
      await loadData()

      // Recalcular totales
      const updatedSheet = routeSheets.find((s) => s.id === sheetId)
      if (updatedSheet) {
        const totals = calculateRouteTotals(updatedSheet)
        await updatePlanillaTotales(sheetId, totals)
        await loadData()
      }

      toast({
        title: "Actualizado",
        description: `Pedido marcado como ${newStatus}`,
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating order status:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar el pedido",
        variant: "destructive",
      })
    }
  }

  const handleCompleteRoute = async (sheetId: string) => {
    try {
      await completarPlanilla(sheetId)
      await loadData()
      setSelectedRoute(null)

      toast({
        title: "Ruta Completada",
        description: "La ruta ha sido marcada como completada y la comisión ha sido calculada",
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error completing route:", err)
      toast({
        title: "Error",
        description: "No se pudo completar la ruta",
        variant: "destructive",
      })
    }
  }

  const calculateRouteTotals = (route: RouteSheet) => {
    let entregado = 0
    let fiado = 0
    let devolucion = 0
    let repaso = 0

    route.orders.forEach((order) => {
      const orderTotal = order.items.reduce((sum, item) => {
        if (item.devuelto) {
          devolucion += item.subtotal
          return sum
        }
        return sum + item.subtotal
      }, 0)

      if (order.estado === "entregado") {
        entregado += orderTotal
      } else if (order.estado === "fiado") {
        fiado += orderTotal
      } else if (order.estado === "devolucion") {
        devolucion += orderTotal
      } else if (order.estado === "repaso") {
        repaso += orderTotal
      }
    })

    return {
      total_entregado: entregado,
      total_fiado: fiado,
      total_devolucion: devolucion,
      total_repaso: repaso,
    }
  }

  const toggleOrder = (orderId: string) => {
    const newExpanded = new Set(expandedOrders)
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId)
    } else {
      newExpanded.add(orderId)
    }
    setExpandedOrders(newExpanded)
  }

  const activeRoute = myRoutes.find((r) => r.id === selectedRoute)

  const allOrdersProcessed = activeRoute?.orders.every((o) => o.estado !== "pendiente") || false

  const totalRoutes = myRoutes.length
  const totalOrders = myRoutes.reduce((sum, sheet) => sum + sheet.totalOrders, 0)
  const totalAmount = myRoutes.reduce((sum, sheet) => sum + (sheet.montoCargue || 0), 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <header className="border-b bg-card">
        <div className="container mx-auto px-3 md:px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-blue-600">
                <User className="h-5 w-5 md:h-6 md:w-6 text-white" />
              </div>
              <div>
                <h2 className="font-bold text-lg md:text-xl">{deliveryPerson}</h2>
                <p className="text-xs md:text-sm text-muted-foreground">
                  {totalRoutes} ruta{totalRoutes !== 1 ? "s" : ""} · {totalOrders} pedidos · Total: {formatCOP(totalAmount)}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 md:px-4 py-4 md:py-8 max-w-6xl">
        {activeRoute ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl md:text-2xl font-bold">Ruta {activeRoute.ruta}</h2>
                <p className="text-sm md:text-base text-muted-foreground">
                  {activeRoute.totalOrders} pedidos · Cargue total: {formatCOP(activeRoute.montoCargue || 0)}
                </p>
              </div>
              <div className="flex gap-2">
                {allOrdersProcessed && (
                  <Button onClick={() => handleCompleteRoute(activeRoute.id)} className="bg-green-600">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Completar Ruta
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setSelectedRoute(null)}>
                  Ver Todas
                </Button>
              </div>
            </div>

            {allOrdersProcessed && (
              <Card className="p-4 bg-green-50 border-green-200">
                <p className="text-sm text-green-700 font-medium">
                  Todos los pedidos han sido procesados. Haz clic en "Completar Ruta" para finalizar y calcular tu comisión.
                </p>
              </Card>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
              <Card className="p-3 md:p-4">
                <p className="text-xs md:text-sm text-muted-foreground">Entregado</p>
                <p className="text-lg md:text-xl font-bold text-green-600">
                  {formatCOP(activeRoute.montoEntregado || 0)}
                </p>
              </Card>
              <Card className="p-3 md:p-4">
                <p className="text-xs md:text-sm text-muted-foreground">Fiado</p>
                <p className="text-lg md:text-xl font-bold text-yellow-600">{formatCOP(activeRoute.montoFiado || 0)}</p>
              </Card>
              <Card className="p-3 md:p-4">
                <p className="text-xs md:text-sm text-muted-foreground">Devoluciones</p>
                <p className="text-lg md:text-xl font-bold text-red-600">
                  {formatCOP(activeRoute.montoDevoluciones || 0)}
                </p>
              </Card>
              <Card className="p-3 md:p-4">
                <p className="text-xs md:text-sm text-muted-foreground">Repasos</p>
                <p className="text-lg md:text-xl font-bold text-blue-600">{formatCOP(activeRoute.montoRepasos || 0)}</p>
              </Card>
            </div>

            <div className="space-y-3">
              {activeRoute.orders.map((order) => {
                const isExpanded = expandedOrders.has(order.id)
                const effectiveTotal = order.items
                  .filter((item) => !item.devuelto)
                  .reduce((sum, item) => sum + item.subtotal, 0)
                const returnedTotal = order.items
                  .filter((item) => item.devuelto)
                  .reduce((sum, item) => sum + item.subtotal, 0)

                return (
                  <Card key={order.id} className="overflow-hidden">
                    <div className="p-3 md:p-4 bg-muted/50">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-sm md:text-base truncate">{order.cliente}</h3>
                            <span
                              className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                                order.estado === "pendiente"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : order.estado === "entregado"
                                    ? "bg-green-100 text-green-700"
                                    : order.estado === "fiado"
                                      ? "bg-orange-100 text-orange-700"
                                      : order.estado === "repaso"
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-red-100 text-red-700"
                              }`}
                            >
                              {order.estado}
                            </span>
                          </div>
                          <p className="text-xs md:text-sm text-muted-foreground mt-1">
                            {order.items.length} productos · {formatCOP(effectiveTotal)}
                            {returnedTotal > 0 && (
                              <span className="text-red-600 ml-2">· Dev: {formatCOP(returnedTotal)}</span>
                            )}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => toggleOrder(order.id)}>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-3 md:p-4 space-y-4">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs md:text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 w-10">Dev.</th>
                                <th className="text-left py-2">Código</th>
                                <th className="text-left py-2">Descripción</th>
                                <th className="text-right py-2">Cant.</th>
                                <th className="text-right py-2">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, idx) => (
                                <tr
                                  key={idx}
                                  className={`border-b ${item.devuelto ? "bg-red-50 line-through opacity-60" : ""}`}
                                >
                                  <td className="py-2">
                                    <Checkbox
                                      checked={item.devuelto || false}
                                      onCheckedChange={() =>
                                        handleItemReturn(activeRoute.id, order.id, item.codigo, item.devuelto || false)
                                      }
                                      disabled={order.estado !== "pendiente"}
                                    />
                                  </td>
                                  <td className="py-2 font-mono">{item.codigo}</td>
                                  <td className="py-2">{item.descripcion}</td>
                                  <td className="text-right py-2">{item.cantidad}</td>
                                  <td className="text-right py-2 font-medium">{formatCOP(item.subtotal)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="font-semibold">
                                <td colSpan={4} className="text-right py-3 text-xs md:text-sm">
                                  Total:
                                </td>
                                <td className="text-right py-3">{formatCOP(effectiveTotal)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleOrderStatusChange(activeRoute.id, order.id, "entregado")}
                            className="bg-green-600 flex-1 sm:flex-none"
                            disabled={order.estado !== "pendiente"}
                          >
                            Entregado
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOrderStatusChange(activeRoute.id, order.id, "fiado")}
                            className="flex-1 sm:flex-none"
                            disabled={order.estado !== "pendiente"}
                          >
                            Fiado
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOrderStatusChange(activeRoute.id, order.id, "repaso")}
                            className="flex-1 sm:flex-none"
                            disabled={order.estado !== "pendiente"}
                          >
                            Repaso
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleOrderStatusChange(activeRoute.id, order.id, "devolucion")}
                            className="flex-1 sm:flex-none"
                            disabled={order.estado !== "pendiente"}
                          >
                            Devolución
                          </Button>
                        </div>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {myRoutes.length > 0 ? (
              <div>
                <h2 className="text-lg md:text-xl font-bold mb-4">Mis Rutas Alistadas</h2>
                <div className="space-y-3">
                  {myRoutes.map((sheet) => (
                    <Card
                      key={sheet.id}
                      className="p-4 cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => setSelectedRoute(sheet.id)}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm md:text-base">Ruta {sheet.ruta}</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {sheet.totalOrders} pedidos · Cargue: {formatCOP(sheet.montoCargue || 0)}
                          </p>
                        </div>
                        <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 w-fit">
                          Lista para entregar
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <Card className="p-8 md:p-12 text-center">
                <Truck className="h-12 w-12 md:h-16 md:w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No hay rutas listas para entrega</h3>
                <p className="text-sm md:text-base text-muted-foreground">
                  Espera a que el alistador prepare tus rutas asignadas
                </p>
              </Card>
            )}
          </div>
        )}
      </main>
    </>
  )
}
