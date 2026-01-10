"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Truck, LogOut, ChevronDown, ChevronUp, CheckCircle2, MapPin, Phone, AlertCircle } from "lucide-react"
import { User } from "lucide-react"
import type { RouteSheet, Order } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import { Checkbox } from "@/components/ui/checkbox"
import {
  updatePedidoEstado,
  updateProductoDevuelto,
  completarPlanilla,
  updateCantidadEntregada,
  updateSubtotalAjustado,
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
  const [completingRoute, setCompletingRoute] = useState(false)

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
          direccion: ped.direccion || '',
          telefono: ped.telefono || '',
          barrio: ped.barrio || '',
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
            cantidadEntregada: prod.cantidad_entregada,
            subtotalAjustado: prod.subtotal_ajustado,
            estadoProducto: prod.estado_producto || 'normal',
          })),
        })),
        cuentasPorCobrar: [],
      }))
      
      console.log('📦 [ENTREGADOR] Planillas totales:', planillas.length)
      console.log('👤 [ENTREGADOR] Mi nombre:', deliveryPerson)
      
      const misRutas = planillas.filter(p => p.entregador === deliveryPerson)
      console.log('🚚 [ENTREGADOR] Mis rutas:', misRutas.length)
      
      setRouteSheets(planillas)
    } catch (err) {
      console.error("[ENTREGADOR] Error loading planillas:", err)
      toast({
        title: "Error",
        description: "No se pudieron cargar las planillas",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const myRoutes = routeSheets.filter((s) => 
    s.entregador === deliveryPerson && s.estado === "alistado"
  )

  console.log('🔍 [ENTREGADOR] Rutas filtradas para mí:', myRoutes.length)

  const handleItemReturn = async (sheetId: string, orderId: string, codigo: string, currentDevuelto: boolean) => {
    try {
      await updateProductoDevuelto(orderId, codigo, !currentDevuelto)
      await loadData()
      
      toast({
        title: currentDevuelto ? "Producto activado" : "Producto devuelto",
        description: `El producto ha sido marcado como ${!currentDevuelto ? "devuelto" : "activo"}`,
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating product return:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar el producto",
        variant: "destructive",
      })
    }
  }

  const handleCantidadChange = async (orderId: string, codigo: string, cantidad: number, cantidadOriginal: number) => {
    if (cantidad < 0 || cantidad > cantidadOriginal) {
      toast({
        title: "Error",
        description: `La cantidad debe estar entre 0 y ${cantidadOriginal}`,
        variant: "destructive",
      })
      return
    }

    try {
      const result = await updateCantidadEntregada(orderId, codigo, cantidad)
      await loadData()
      
      const estadoMsg = result.estadoProducto === 'agotado' 
        ? '🚫 Marcado como Agotado' 
        : result.estadoProducto === 'parcial'
          ? '📦 Entrega Parcial'
          : '✓ Entrega Completa'
      
      toast({
        title: "Cantidad actualizada",
        description: estadoMsg,
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating quantity:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar la cantidad",
        variant: "destructive",
      })
    }
  }

  const handleSubtotalChange = async (orderId: string, codigo: string, nuevoSubtotal: number) => {
    if (nuevoSubtotal < 0) {
      toast({
        title: "Error",
        description: "El subtotal no puede ser negativo",
        variant: "destructive",
      })
      return
    }

    try {
      await updateSubtotalAjustado(orderId, codigo, nuevoSubtotal)
      await loadData()
      
      toast({
        title: "💰 Subtotal ajustado",
        description: "El valor ha sido actualizado manualmente",
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating subtotal:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar el subtotal",
        variant: "destructive",
      })
    }
  }

  const handleOrderStatusChange = async (sheetId: string, orderId: string, newStatus: Order["estado"]) => {
    try {
      await updatePedidoEstado(orderId, newStatus)
      await loadData()

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
    setCompletingRoute(true)
    try {
      const result = await completarPlanilla(sheetId)
      await loadData()
      setSelectedRoute(null)

      toast({
        title: "🎉 Ruta Completada",
        description: `La ruta ha sido completada exitosamente. Comisión calculada: ${formatCOP(result.comision || 0)}`,
      })
    } catch (err: any) {
      console.error("[ENTREGADOR] Error completing route:", err)
      toast({
        title: "Error",
        description: err.message || "No se pudo completar la ruta",
        variant: "destructive",
      })
    } finally {
      setCompletingRoute(false)
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

  const allOrdersProcessed = activeRoute 
    ? activeRoute.orders.every((o) => o.estado !== "pendiente")
    : false

  const pendingOrdersCount = activeRoute
    ? activeRoute.orders.filter((o) => o.estado === "pendiente").length
    : 0

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
                <Button variant="outline" size="sm" onClick={() => setSelectedRoute(null)}>
                  Ver Todas
                </Button>
              </div>
            </div>

            {allOrdersProcessed ? (
              <Card className="p-4 md:p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-300">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0 mt-1" />
                    <div>
                      <h3 className="font-semibold text-green-900 mb-1">¡Todos los pedidos procesados!</h3>
                      <p className="text-sm text-green-700">
                        Completa la ruta para calcular tu comisión y notificar a caja
                      </p>
                    </div>
                  </div>
                  <Button 
                    onClick={() => handleCompleteRoute(activeRoute.id)} 
                    className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
                    size="lg"
                    disabled={completingRoute}
                  >
                    {completingRoute ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Procesando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5 mr-2" />
                        Completar Ruta
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-4 bg-blue-50 border-blue-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-blue-900 font-medium">
                      Faltan {pendingOrdersCount} pedido{pendingOrdersCount !== 1 ? "s" : ""} por procesar
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      Marca todos los pedidos como entregado, fiado, repaso o devolución para completar la ruta
                    </p>
                  </div>
                </div>
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
                
                // Calcular totales correctamente
                let effectiveTotal = 0
                let returnedTotal = 0
                
                order.items.forEach((item) => {
                  if (item.devuelto) {
                    // Producto devuelto
                    returnedTotal += Number(item.subtotal) || 0
                  } else {
                    // Producto entregado
                    const estadoProd = item.estadoProducto || 'normal'
                    
                    // Agotados no suman
                    if (estadoProd === 'agotado') return
                    
                    // Usar subtotal ajustado si existe, sino calcular
                    if (item.subtotalAjustado !== null && item.subtotalAjustado !== undefined) {
                      effectiveTotal += Number(item.subtotalAjustado) || 0
                    } else if (item.cantidadEntregada !== null && item.cantidadEntregada !== undefined) {
                      effectiveTotal += (Number(item.cantidadEntregada) || 0) * (Number(item.valorUnidad) || 0)
                    } else {
                      effectiveTotal += Number(item.subtotal) || 0
                    }
                  }
                })

                return (
                  <Card key={order.id} className="overflow-hidden">
                    <div className="p-3 md:p-4 bg-muted/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="font-semibold text-sm md:text-base truncate">{order.cliente}</h3>
                            <span
                              className={`text-xs px-2 py-1 rounded-full shrink-0 font-medium ${
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
                          
                          <div className="space-y-1 mb-2">
                            {order.direccion && (
                              <div className="flex items-start gap-2 text-xs md:text-sm text-muted-foreground">
                                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                                <span className="break-words">
                                  {order.direccion}
                                  {order.barrio && ` - ${order.barrio}`}
                                </span>
                              </div>
                            )}
                            {order.telefono && (
                              <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                                <Phone className="h-4 w-4 shrink-0" />
                                <a 
                                  href={`tel:${order.telefono}`}
                                  className="hover:text-primary hover:underline font-medium"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {order.telefono}
                                </a>
                              </div>
                            )}
                          </div>

                          <p className="text-xs md:text-sm text-muted-foreground">
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
                        <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                          💡 <strong>Ajustes manuales:</strong> Edita "Cant. Entregada" para entregas parciales. Para promociones con precios especiales, ajusta el "Subtotal" directamente.
                        </div>
                        
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs md:text-sm">
                            <thead>
                              <tr className="border-b">
                                <th className="text-left py-2 w-10">Dev.</th>
                                <th className="text-left py-2">Código</th>
                                <th className="text-left py-2">Descripción</th>
                                <th className="text-right py-2">Cant. Original</th>
                                <th className="text-right py-2">Cant. Entregada</th>
                                <th className="text-right py-2">Subtotal</th>
                                <th className="text-center py-2">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, idx) => {
                                const cantidadEntregada = Number(item.cantidadEntregada) || Number(item.cantidad) || 0
                                const subtotalCalculado = cantidadEntregada * (Number(item.valorUnidad) || 0)
                                const subtotalFinal = (item.subtotalAjustado !== null && item.subtotalAjustado !== undefined) 
                                  ? Number(item.subtotalAjustado) 
                                  : subtotalCalculado
                                const estadoProducto = item.estadoProducto || 'normal'
                                const tieneAjusteManual = item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
                                
                                return (
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
                                    <td className="text-right py-2">
                                      {order.estado === "pendiente" && !item.devuelto ? (
                                        <input
                                          type="number"
                                          min="0"
                                          max={item.cantidad}
                                          defaultValue={cantidadEntregada}
                                          onBlur={(e) => {
                                            const newCant = parseInt(e.target.value) || 0
                                            if (newCant !== cantidadEntregada) {
                                              handleCantidadChange(order.id, item.codigo, newCant, item.cantidad)
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              e.currentTarget.blur()
                                            }
                                          }}
                                          className="w-16 px-2 py-1 border rounded text-center"
                                        />
                                      ) : (
                                        <span className="font-medium">{cantidadEntregada}</span>
                                      )}
                                    </td>
                                    <td className="text-right py-2">
                                      {order.estado === "pendiente" && !item.devuelto ? (
                                        <div className="flex flex-col items-end gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            defaultValue={subtotalFinal}
                                            onBlur={(e) => {
                                              const newSubtotal = parseFloat(e.target.value) || 0
                                              if (newSubtotal !== subtotalFinal) {
                                                handleSubtotalChange(order.id, item.codigo, newSubtotal)
                                              }
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.currentTarget.blur()
                                              }
                                            }}
                                            placeholder={formatCOP(subtotalFinal)}
                                            className={`w-28 px-2 py-1 border rounded text-right font-medium ${
                                              tieneAjusteManual ? 'border-orange-400 bg-orange-50' : ''
                                            }`}
                                          />
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">{formatCOP(subtotalFinal)}</span>
                                            {tieneAjusteManual && (
                                              <span className="text-xs text-orange-600">✏️ Ajustado</span>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex flex-col items-end">
                                          <span className="font-medium">{formatCOP(subtotalFinal)}</span>
                                          {tieneAjusteManual && (
                                            <span className="text-xs text-orange-600">✏️ Ajustado</span>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td className="text-center py-2">
                                      {estadoProducto === 'agotado' && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                          🚫 Agotado
                                        </span>
                                      )}
                                      {estadoProducto === 'parcial' && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                          📦 Parcial
                                        </span>
                                      )}
                                      {estadoProducto === 'normal' && !item.devuelto && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                                          ✓ Normal
                                        </span>
                                      )}
                                      {item.devuelto && (
                                        <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                          ❌ Devuelto
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="font-semibold">
                                <td colSpan={5} className="text-right py-3 text-xs md:text-sm">
                                  Total:
                                </td>
                                <td className="text-right py-3">{formatCOP(effectiveTotal)}</td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleOrderStatusChange(activeRoute.id, order.id, "entregado")}
                            className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
                            disabled={order.estado !== "pendiente"}
                          >
                            Entregado
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOrderStatusChange(activeRoute.id, order.id, "fiado")}
                            className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50"
                            disabled={order.estado !== "pendiente"}
                          >
                            Fiado
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOrderStatusChange(activeRoute.id, order.id, "repaso")}
                            className="flex-1 sm:flex-none border-blue-300 text-blue-700 hover:bg-blue-50"
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
                        <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 w-fit font-medium">
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
