"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Truck, LogOut, Filter, History, Calendar, ChevronDown, ChevronUp } from "lucide-react"
import type { RouteSheet, User, Order } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import {
  updatePedidoEstado,
  updateCantidadEntregada,
  updateSubtotalAjustado,
  updateDescuentoPedido,
  updateMotivoDescuentoPedido,
  updateMotivoAjuste,
} from "@/lib/actions/planillas"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ModalNovedadesEntregador } from "@/components/novedades/modal-novedades-entregador"

interface EntregadorViewProps {
  onLogout: () => void
  user: User
}

export function EntregadorView({ onLogout, user }: EntregadorViewProps) {
  const { toast } = useToast()
  const [filterFechaDesde, setFilterFechaDesde] = useState(new Date().toISOString().split("T")[0])
  const [filterFechaHasta, setFilterFechaHasta] = useState(new Date().toISOString().split("T")[0])
  const [selectedView, setSelectedView] = useState<"rutas" | "historial">("rutas")
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRoutes, setExpandedRoutes] = useState<Set<number>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  const [showFiadoModal, setShowFiadoModal] = useState(false)
  const [selectedOrderForFiado, setSelectedOrderForFiado] = useState<Order | null>(null)
  const [montoPagadoFiado, setMontoPagadoFiado] = useState("")
  const [totalEfectivoFiado, setTotalEfectivoFiado] = useState(0)

  // Estados para modal de novedades
  const [selectedOrderForNovedades, setSelectedOrderForNovedades] = useState<Order | null>(null)
  const [selectedPlanillaId, setSelectedPlanillaId] = useState<number>(0)

  const entregador = user.nombre

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedView === "historial") {
      loadHistorial()
    }
  }, [selectedView])

  async function loadData() {
    try {
      const response = await fetch("/api/planillas")
      if (!response.ok) throw new Error("Error al cargar planillas")

      const data = await response.json()

      const planillas: RouteSheet[] = (Array.isArray(data.planillas) ? data.planillas : []).map((p: any) => ({
        id: p.id,
        ruta: p.tipo_ruta,
        fecha: p.fecha,
        entregador: p.entregador,
        estado: p.estado,
        cuadradoEnCaja: p.cuadrado_en_caja || false,
        totalOrders: Array.isArray(p.pedidos) ? p.pedidos.length : 0,
        totalAmount: Number(p.total_cargue) || 0,
        montoCargue: Number(p.total_cargue) || 0,
        montoEntregado: Number(p.total_entregado) || 0,
        montoFiado: Number(p.total_fiado) || 0,
        montoDevoluciones: Number(p.total_devolucion) || 0,
        montoRepasos: Number(p.total_repaso) || 0,
        orders: (Array.isArray(p.pedidos) ? p.pedidos : []).map((ped: any) => ({
          id: ped.id,
          cliente: ped.cliente,
          ruta: p.tipo_ruta,
          fecha: p.fecha,
          estado: ped.estado,
          total: Number(ped.total) || 0,
          montoPagado: Number(ped.monto_pagado) || 0,
          saldoPendiente: Number(ped.saldo_pendiente) || Number(ped.total) || 0,
          comentarios: ped.observaciones,
          esCobro: ped.es_cobro || false,
          descuento: Number(ped.descuento) || 0,
          motivoDescuento: ped.motivo_descuento || "",
          items: (Array.isArray(ped.productos) ? ped.productos : []).map((prod: any) => ({
            codigo: prod.codigo,
            descripcion: prod.nombre,
            categoria: "",
            cantidad: Number(prod.cantidad) || 0,
            valorUnidad: Number(prod.precio_unitario) || 0,
            subtotal: Number(prod.total) || 0,
            devuelto: prod.devuelto || false,
            subtotalAjustado: prod.subtotal_ajustado,
            cantidadEntregada: prod.cantidad_entregada,
            estadoProducto: prod.estado_producto,
            motivoAjuste: prod.motivo_ajuste,
          })),
        })),
        cuentasPorCobrar: [],
      }))

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

  async function loadHistorial() {
    try {
      const responseIndividuales = await fetch("/api/caja/recibir-efectivo")
      const dataIndividuales = await responseIndividuales.json()

      const responseAgrupados = await fetch("/api/cuadres-caja")
      const dataAgrupados = await responseAgrupados.json()

      const recepcionesIndividuales = Array.isArray(dataIndividuales.recepciones)
        ? dataIndividuales.recepciones
            .filter((r: any) => r.entregador === entregador)
            .map((r: any) => ({ ...r, tipo: "individual" }))
        : []

      const cuadresAgrupados = Array.isArray(dataAgrupados.cuadres)
        ? dataAgrupados.cuadres
            .filter((c: any) => c.entregador === entregador)
            .map((c: any) => {
              const numRutas = Array.isArray(c.planillas_ids) ? c.planillas_ids.length : 0
              const tipoRutaDisplay =
                c.rutas_nombres && c.rutas_nombres.length > 0
                  ? c.rutas_nombres.join(", ")
                  : numRutas > 1
                    ? `${numRutas} rutas agrupadas`
                    : "1 ruta"

              return {
                ...c,
                tipo: "agrupado",
                fecha_recepcion: c.fecha_cuadre,
                efectivo_esperado: c.total_esperado,
                efectivo_recibido: c.total_efectivo,
                diferencia_efectivo: c.diferencia,
                tipo_ruta: tipoRutaDisplay,
                monto_consignacion:
                  c.total_consignado !== null && c.total_consignado !== undefined ? c.total_consignado : 0,
              }
            })
        : []

      const todosLosCuadres = [...recepcionesIndividuales, ...cuadresAgrupados].sort(
        (a, b) => new Date(b.fecha_recepcion).getTime() - new Date(a.fecha_recepcion).getTime(),
      )

      setHistorial(todosLosCuadres)
    } catch (err) {
      console.error("[ENTREGADOR] Error loading historial:", err)
      toast({
        title: "Error",
        description: "No se pudo cargar el historial",
        variant: "destructive",
      })
    }
  }

  const misRutas = routeSheets.filter(
    (s) => s.entregador === entregador && (s.estado === 'alistado' || s.estado === 'completado') && !s.cuadradoEnCaja
  )

  const filteredRoutes = misRutas.filter((route) => {
    if (filterFechaDesde || filterFechaHasta) {
      const routeDate = new Date(route.fecha).toISOString().split("T")[0]
      if (filterFechaDesde && routeDate < filterFechaDesde) return false
      if (filterFechaHasta && routeDate > filterFechaHasta) return false
    }
    return true
  })

  const calculateOrderEffectiveTotal = (order: Order): number => {
    if (!order || !Array.isArray(order.items)) return 0

    let effectiveTotal = 0

    order.items.forEach((item) => {
      if (!item) return

      const cantOriginal = Number(item.cantidad) || 0
      const precioUnit = Number(item.valorUnidad) || 0

      if (item.motivoAjuste === 'error_facturacion') return
      if (item.motivoAjuste === 'devuelto' || item.devuelto) return

      const cantEntregada =
        item.cantidadEntregada !== null && item.cantidadEntregada !== undefined
          ? Number(item.cantidadEntregada)
          : cantOriginal

      if (cantEntregada === 0 || item.estadoProducto === "agotado") return

      const subtotalReal =
        item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
          ? Number(item.subtotalAjustado)
          : cantEntregada * precioUnit

      effectiveTotal += subtotalReal
    })

    if (order.descuento) {
      effectiveTotal -= Number(order.descuento)
    }

    return Math.round(effectiveTotal * 100) / 100
  }

  const calculateRouteTotals = (route: RouteSheet | null) => {
    if (!route || !Array.isArray(route.orders)) {
      return {
        entregado: 0,
        fiado: 0,
        devoluciones: 0,
        repasos: 0,
        agotados: 0,
        erroresFacturacion: 0,
      }
    }

    let entregado = 0
    let fiado = 0
    let devoluciones = 0
    let repasos = 0
    let agotados = 0
    let erroresFacturacion = 0

    route.orders.forEach((order) => {
      if (!order || !Array.isArray(order.items)) return

      let effectiveTotal = 0
      let returnedTotal = 0
      let agotadosEnPedido = 0
      let erroresEnPedido = 0

      order.items.forEach((item) => {
        if (!item) return

        const cantOriginal = Number(item.cantidad) || 0
        const precioUnit = Number(item.valorUnidad) || 0
        const subtotalOriginal = cantOriginal * precioUnit

        if (item.motivoAjuste === 'error_facturacion') {
          erroresEnPedido += subtotalOriginal
          return
        }

        if (item.motivoAjuste === 'devuelto' || item.devuelto) {
          returnedTotal += subtotalOriginal
          return
        }

        const cantEntregada =
          item.cantidadEntregada !== null && item.cantidadEntregada !== undefined
            ? Number(item.cantidadEntregada)
            : cantOriginal

        if (cantEntregada === 0 || item.estadoProducto === "agotado") {
          agotadosEnPedido += subtotalOriginal
          return
        }

        const subtotalReal =
          item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
            ? Number(item.subtotalAjustado)
            : cantEntregada * precioUnit

        effectiveTotal += subtotalReal
      })

      agotados += agotadosEnPedido
      devoluciones += returnedTotal
      erroresFacturacion += erroresEnPedido

      if (order.estado === "fiado") {
        const montoPagadoReal = Number(order.montoPagado) || 0
        const saldoPendienteReal = effectiveTotal - montoPagadoReal
        fiado += saldoPendienteReal
        entregado += montoPagadoReal
      } else if (order.estado === "repaso") {
        repasos += effectiveTotal
      } else if (order.estado === "devolucion") {
        devoluciones += effectiveTotal
      } else {
        entregado += effectiveTotal
        if (order.descuento) {
          entregado -= Number(order.descuento)
        }
      }
    })

    return {
      entregado: Math.round(entregado * 100) / 100,
      fiado: Math.round(fiado * 100) / 100,
      devoluciones: Math.round(devoluciones * 100) / 100,
      repasos: Math.round(repasos * 100) / 100,
      agotados: Math.round(agotados * 100) / 100,
      erroresFacturacion: Math.round(erroresFacturacion * 100) / 100,
    }
  }

  const toggleRouteExpansion = (routeId: number) => {
    const newExpanded = new Set(expandedRoutes)
    if (newExpanded.has(routeId)) {
      newExpanded.delete(routeId)
    } else {
      newExpanded.add(routeId)
    }
    setExpandedRoutes(newExpanded)
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
      setRouteSheets(prevSheets =>
        prevSheets.map(sheet => ({
          ...sheet,
          orders: sheet.orders.map(order => {
            if (order.id !== orderId) return order

            return {
              ...order,
              items: order.items.map(item =>
                item.codigo === codigo
                  ? {
                      ...item,
                      cantidadEntregada: cantidad,
                      estadoProducto: cantidad === 0 ? "agotado" : cantidad < cantidadOriginal ? "parcial" : "normal"
                    }
                  : item
              )
            }
          })
        }))
      )

      const result = await updateCantidadEntregada(orderId, codigo, cantidad)

      const estadoMsg =
        result.estadoProducto === "agotado"
          ? "Marcado como Agotado"
          : result.estadoProducto === "parcial"
            ? "Entrega Parcial"
            : "Entrega Completa"

      toast({
        title: "Cantidad actualizada",
        description: estadoMsg,
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating quantity:", err)
      await loadData()
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
      setRouteSheets(prevSheets =>
        prevSheets.map(sheet => ({
          ...sheet,
          orders: sheet.orders.map(order => {
            if (order.id !== orderId) return order

            return {
              ...order,
              items: order.items.map(item =>
                item.codigo === codigo
                  ? { ...item, subtotalAjustado: nuevoSubtotal }
                  : item
              )
            }
          })
        }))
      )

      await updateSubtotalAjustado(orderId, codigo, nuevoSubtotal)

      toast({
        title: "Subtotal ajustado",
        description: "El valor ha sido actualizado manualmente",
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating subtotal:", err)
      await loadData()
      toast({
        title: "Error",
        description: "No se pudo actualizar el subtotal",
        variant: "destructive",
      })
    }
  }

  const handleDescuentoChange = async (orderId: string, descuento: number) => {
    try {
      setRouteSheets(prevSheets =>
        prevSheets.map(sheet => ({
          ...sheet,
          orders: sheet.orders.map(order =>
            order.id === orderId
              ? { ...order, descuento: descuento }
              : order
          )
        }))
      )

      await updateDescuentoPedido(orderId, descuento)

      toast({
        title: "Descuento aplicado",
        description: `Descuento de ${formatCOP(descuento)} registrado`,
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating descuento:", err)
      await loadData()
      toast({
        title: "Error",
        description: "No se pudo actualizar el descuento",
        variant: "destructive",
      })
    }
  }

  const handleMotivoDescuentoChange = async (orderId: string, motivo: string) => {
    try {
      setRouteSheets(prevSheets =>
        prevSheets.map(sheet => ({
          ...sheet,
          orders: sheet.orders.map(order =>
            order.id === orderId
              ? { ...order, motivoDescuento: motivo }
              : order
          )
        }))
      )

      await updateMotivoDescuentoPedido(orderId, motivo)
    } catch (err) {
      console.error("[ENTREGADOR] Error updating motivo descuento:", err)
      await loadData()
    }
  }

  const handleMotivoAjusteChange = async (orderId: string, codigo: string, motivoAjuste: string) => {
    try {
      setRouteSheets(prevSheets =>
        prevSheets.map(sheet => ({
          ...sheet,
          orders: sheet.orders.map(order => {
            if (order.id !== orderId) return order

            return {
              ...order,
              items: order.items.map(item =>
                item.codigo === codigo
                  ? { ...item, motivoAjuste: motivoAjuste || null }
                  : item
              )
            }
          })
        }))
      )

      await updateMotivoAjuste(orderId, codigo, motivoAjuste || null)

      const mensaje = motivoAjuste === 'devuelto'
        ? "Producto marcado como devolución"
        : motivoAjuste === 'error_facturacion'
          ? "Producto marcado como error de facturación"
          : "Producto restaurado a normal"

      toast({
        title: "Estado actualizado",
        description: mensaje,
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating motivo ajuste:", err)
      await loadData()
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del producto",
        variant: "destructive",
      })
    }
  }

  const handleOrderStatusChange = async (orderId: string, newStatus: Order["estado"]) => {
    const order = routeSheets
      .flatMap(sheet => sheet.orders)
      .find(o => o.id === orderId)

    if (newStatus === "fiado") {
      if (order) {
        const totalEfectivo = calculateOrderEffectiveTotal(order)
        setSelectedOrderForFiado(order)
        setTotalEfectivoFiado(totalEfectivo)
        setMontoPagadoFiado("")
        setShowFiadoModal(true)
      }
      return
    }

    try {
      setRouteSheets(prevSheets =>
        prevSheets.map(sheet => ({
          ...sheet,
          orders: sheet.orders.map(order =>
            order.id === orderId
              ? { ...order, estado: newStatus }
              : order
          )
        }))
      )

      await updatePedidoEstado(orderId, newStatus)

      toast({
        title: "Actualizado",
        description: `Pedido marcado como ${newStatus}`,
      })
    } catch (err) {
      console.error("[ENTREGADOR] Error updating order status:", err)
      await loadData()
      toast({
        title: "Error",
        description: "No se pudo actualizar el pedido",
        variant: "destructive",
      })
    }
  }

  const handleSubmitFiado = async () => {
    if (!selectedOrderForFiado) return

    const montoPagado = Number(montoPagadoFiado) || 0
    const totalPedido = totalEfectivoFiado

    if (montoPagado < 0 || montoPagado > totalPedido) {
      toast({
        title: "Error",
        description: `El monto debe estar entre $0 y ${formatCOP(totalPedido)}`,
        variant: "destructive",
      })
      return
    }

    try {
      const saldoPendiente = totalPedido - montoPagado

      setRouteSheets(prevSheets =>
        prevSheets.map(sheet => ({
          ...sheet,
          orders: sheet.orders.map(order =>
            order.id === selectedOrderForFiado.id
              ? {
                  ...order,
                  estado: "fiado" as const,
                  montoPagado: montoPagado,
                  saldoPendiente: saldoPendiente
                }
              : order
          )
        }))
      )

      await updatePedidoEstado(selectedOrderForFiado.id, "fiado", montoPagado, saldoPendiente)

      toast({
        title: "Fiado Registrado",
        description: `Pagó: ${formatCOP(montoPagado)} | Debe: ${formatCOP(saldoPendiente)}`,
      })

      setShowFiadoModal(false)
      setSelectedOrderForFiado(null)
      setMontoPagadoFiado("")
      setTotalEfectivoFiado(0)
    } catch (err) {
      console.error("[ENTREGADOR] Error al registrar fiado:", err)
      await loadData()
      toast({
        title: "Error",
        description: "No se pudo registrar el fiado",
        variant: "destructive",
      })
    }
  }

  const totalCargue = filteredRoutes.reduce((sum, r) => sum + (r?.totalAmount || 0), 0)

  let totalEntregado = 0
  let totalFiado = 0
  let totalDevoluciones = 0
  let totalRepasos = 0
  let totalDescuentos = 0
  let totalAgotados = 0
  let totalErroresFacturacion = 0

  filteredRoutes.forEach((route) => {
    const totals = calculateRouteTotals(route)
    totalEntregado += totals.entregado
    totalFiado += totals.fiado
    totalDevoluciones += totals.devoluciones
    totalRepasos += totals.repasos
    totalAgotados += totals.agotados
    totalErroresFacturacion += totals.erroresFacturacion
  })

  filteredRoutes.forEach((route) => {
    if (Array.isArray(route.orders)) {
      route.orders.forEach((order) => {
        if (order.descuento) {
          totalDescuentos += Number(order.descuento)
        }
      })
    }
  })

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Truck className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">{entregador}</h1>
                  <p className="text-sm text-gray-500">Mis Rutas de Entrega</p>
                </div>
              </div>
              <Button variant="outline" onClick={onLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-6">
            <Button
              variant={selectedView === "rutas" ? "default" : "outline"}
              onClick={() => setSelectedView("rutas")}
              size="sm"
            >
              <Truck className="h-4 w-4 mr-2" />
              Mis Rutas
            </Button>
            <Button
              variant={selectedView === "historial" ? "default" : "outline"}
              onClick={() => setSelectedView("historial")}
              size="sm"
            >
              <History className="h-4 w-4 mr-2" />
              Historial
            </Button>
          </div>

          {selectedView === "historial" ? (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Mi Historial de Entregas</h2>
              {historial.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay historial disponible</p>
              ) : (
                <div className="space-y-4">
                  {historial.map((rec) => (
                    <Card key={rec.id} className="p-4 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{rec.tipo_ruta}</p>
                            {rec.tipo === "agrupado" && (
                              <Badge variant="secondary">AGRUPADO</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">
                            {new Date(rec.fecha_recepcion).toLocaleString("es-CO")}
                          </p>
                        </div>
                        <Badge variant={rec.estado === "cuadrado" ? "default" : "destructive"}>
                          {rec.estado === "cuadrado" ? "Cuadrado" : "Con Diferencia"}
                        </Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Esperado</span>
                          <p className="font-semibold">{formatCOP(Number(rec.efectivo_esperado))}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Recibido</span>
                          <p className="font-semibold">{formatCOP(Number(rec.efectivo_recibido))}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Diferencia</span>
                          <p className={`font-semibold ${Number(rec.diferencia_efectivo) !== 0 ? "text-red-600" : "text-green-600"}`}>
                            {Number(rec.diferencia_efectivo) > 0 ? "+" : ""}
                            {formatCOP(Number(rec.diferencia_efectivo))}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <>
              <Card className="p-4 mb-6">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium">Filtros:</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <Input
                      type="date"
                      value={filterFechaDesde}
                      onChange={(e) => setFilterFechaDesde(e.target.value)}
                      className="w-[140px]"
                      placeholder="Desde"
                    />
                    <span>-</span>
                    <Input
                      type="date"
                      value={filterFechaHasta}
                      onChange={(e) => setFilterFechaHasta(e.target.value)}
                      className="w-[140px]"
                      placeholder="Hasta"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mt-4 pt-4 border-t">
                  <div className="text-center p-2 bg-blue-50 rounded">
                    <span className="text-xs text-blue-600 font-medium">Total Cargue</span>
                    <p className="font-bold text-blue-700">{formatCOP(totalCargue)}</p>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded">
                    <span className="text-xs text-green-600 font-medium">Entregado</span>
                    <p className="font-bold text-green-700">{formatCOP(totalEntregado)}</p>
                  </div>
                  <div className="text-center p-2 bg-orange-50 rounded">
                    <span className="text-xs text-orange-600 font-medium">Fiado (CxC)</span>
                    <p className="font-bold text-orange-700">{formatCOP(totalFiado)}</p>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded">
                    <span className="text-xs text-red-600 font-medium">Devoluciones</span>
                    <p className="font-bold text-red-700">{formatCOP(totalDevoluciones)}</p>
                  </div>
                  <div className="text-center p-2 bg-blue-50 rounded">
                    <span className="text-xs text-blue-600 font-medium">Repasos</span>
                    <p className="font-bold text-blue-700">{formatCOP(totalRepasos)}</p>
                  </div>
                  <div className="text-center p-2 bg-gray-100 rounded">
                    <span className="text-xs text-gray-600 font-medium">Agotados</span>
                    <p className="font-bold text-gray-700">{formatCOP(totalAgotados)}</p>
                  </div>
                  <div className="text-center p-2 bg-orange-100 rounded">
                    <span className="text-xs text-orange-700 font-medium">Errores Fact.</span>
                    <p className="font-bold text-orange-800">{formatCOP(totalErroresFacturacion)}</p>
                  </div>
                  <div className="text-center p-2 bg-purple-50 rounded">
                    <span className="text-xs text-purple-600 font-medium">Descuentos</span>
                    <p className="font-bold text-purple-700">{formatCOP(totalDescuentos)}</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Mis Rutas Pendientes</h2>
                {filteredRoutes.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    No hay rutas pendientes para la fecha seleccionada
                  </p>
                ) : (
                  <div className="space-y-4">
                    {filteredRoutes.map((route) => {
                      const totals = calculateRouteTotals(route)

                      return (
                        <Card key={route.id} className="p-4">
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold">Ruta {route.ruta}</p>
                                <p className="text-sm text-gray-500">
                                  {route.totalOrders} pedidos · Fecha:{" "}
                                  {new Date(route.fecha).toLocaleDateString("es-CO")}
                                </p>
                              </div>
                              <Button onClick={() => toggleRouteExpansion(route.id)} variant="outline" size="sm">
                                {expandedRoutes.has(route.id) ? (
                                  <>
                                    <ChevronUp className="h-4 w-4 mr-1" />
                                    Ocultar Clientes
                                  </>
                                ) : (
                                  <>
                                    <ChevronDown className="h-4 w-4 mr-1" />
                                    Ver Clientes
                                  </>
                                )}
                              </Button>
                            </div>

                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-3">
                              <div className="text-center p-2 bg-blue-50 rounded">
                                <span className="text-xs text-blue-600 font-medium">Cargue</span>
                                <p className="font-bold text-blue-700">{formatCOP(route.totalAmount)}</p>
                              </div>
                              <div className="text-center p-2 bg-green-50 rounded">
                                <span className="text-xs text-green-600 font-medium">Entregado</span>
                                <p className="font-bold text-green-700">{formatCOP(totals.entregado)}</p>
                              </div>
                              <div className="text-center p-2 bg-orange-50 rounded">
                                <span className="text-xs text-orange-600 font-medium">Fiado</span>
                                <p className="font-bold text-orange-700">{formatCOP(totals.fiado)}</p>
                              </div>
                              <div className="text-center p-2 bg-red-50 rounded">
                                <span className="text-xs text-red-600 font-medium">Devoluciones</span>
                                <p className="font-bold text-red-700">{formatCOP(totals.devoluciones)}</p>
                              </div>
                              <div className="text-center p-2 bg-blue-50 rounded">
                                <span className="text-xs text-blue-600 font-medium">Repasos</span>
                                <p className="font-bold text-blue-700">{formatCOP(totals.repasos)}</p>
                              </div>
                              <div className="text-center p-2 bg-gray-100 rounded">
                                <span className="text-xs text-gray-600 font-medium">Agotados</span>
                                <p className="font-bold text-gray-700">{formatCOP(totals.agotados)}</p>
                              </div>
                            </div>

                            <div className="mt-2 p-2 bg-emerald-50 rounded text-center">
                              <span className="text-xs text-emerald-600 font-medium">Efectivo Esperado:</span>
                              <span className="font-bold text-emerald-700 ml-2">{formatCOP(totals.entregado)}</span>
                            </div>

                            {expandedRoutes.has(route.id) && Array.isArray(route.orders) && (
                              <div className="mt-4 pt-4 border-t">
                                <h4 className="text-sm font-medium mb-2">Clientes de la ruta:</h4>
                                <div className="space-y-3">
                                  {route.orders.map((order) => {
                                    if (!order) return null

                                    const isExpanded = expandedOrders.has(order.id)

                                    let effectiveTotal = 0
                                    let returnedTotal = 0

                                    if (Array.isArray(order.items)) {
                                      order.items.forEach((item) => {
                                        if (!item) return

                                        if (item.devuelto || item.motivoAjuste === 'devuelto') {
                                          returnedTotal += Number(item.subtotal) || 0
                                        } else {
                                          const estadoProd = item.estadoProducto || "normal"
                                          if (estadoProd === "agotado") return
                                          if (item.motivoAjuste === 'error_facturacion') return

                                          if (item.subtotalAjustado !== null && item.subtotalAjustado !== undefined) {
                                            effectiveTotal += Number(item.subtotalAjustado) || 0
                                          } else if (
                                            item.cantidadEntregada !== null &&
                                            item.cantidadEntregada !== undefined
                                          ) {
                                            effectiveTotal +=
                                              (Number(item.cantidadEntregada) || 0) * (Number(item.valorUnidad) || 0)
                                          } else {
                                            effectiveTotal += Number(item.subtotal) || 0
                                          }
                                        }
                                      })
                                    }

                                    return (
                                      <Card key={order.id} className="p-3 bg-gray-50">
                                        <div className="flex justify-between items-start">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <p className="font-medium text-sm">{order.cliente}</p>
                                              <Badge
                                                variant="outline"
                                                className={
                                                  order.estado === "entregado"
                                                    ? "bg-green-100 text-green-700 border-green-300"
                                                    : order.estado === "fiado"
                                                      ? "bg-orange-100 text-orange-700 border-orange-300"
                                                      : order.estado === "repaso"
                                                        ? "bg-blue-100 text-blue-700 border-blue-300"
                                                        : "bg-red-100 text-red-700 border-red-300"
                                                }
                                              >
                                                {order.estado.toUpperCase()}
                                              </Badge>
                                            </div>
                                            <p className="text-xs text-gray-500">
                                              {Array.isArray(order.items) ? order.items.length : 0} productos ·{" "}
                                              {formatCOP(effectiveTotal)}
                                              {returnedTotal > 0 && (
                                                <span className="text-red-500">
                                                  · Dev: {formatCOP(returnedTotal)}
                                                </span>
                                              )}
                                            </p>
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              const newExpanded = new Set(expandedOrders)
                                              if (newExpanded.has(order.id)) {
                                                newExpanded.delete(order.id)
                                              } else {
                                                newExpanded.add(order.id)
                                              }
                                              setExpandedOrders(newExpanded)
                                            }}
                                          >
                                            {isExpanded ? (
                                              <ChevronUp className="h-4 w-4" />
                                            ) : (
                                              <ChevronDown className="h-4 w-4" />
                                            )}
                                          </Button>
                                        </div>

                                        {isExpanded && Array.isArray(order.items) && (
                                          <div className="mt-3 pt-3 border-t space-y-4">
                                            {/* Botón gestionar novedades */}
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => {
                                                setSelectedOrderForNovedades(order)
                                                setSelectedPlanillaId(route.id)
                                              }}
                                              className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                                            >
                                              📋 Gestionar Novedades
                                            </Button>

                                            {/* Tabla de productos */}
                                            <div>
                                              <p className="text-xs text-gray-500 mb-2">
                                                Productos del pedido: Edita "Cant. Entregada" para entregas parciales. Para promociones, ajusta el "Subtotal" directamente.
                                              </p>

                                              <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                  <thead>
                                                    <tr className="border-b">
                                                      <th className="text-left py-1 px-1 w-16">Dev.</th>
                                                      <th className="text-left py-1 px-1">Código</th>
                                                      <th className="text-left py-1 px-1">Descripción</th>
                                                      <th className="text-center py-1 px-1">Cant. Original</th>
                                                      <th className="text-center py-1 px-1">Cant. Entregada</th>
                                                      <th className="text-right py-1 px-1">Subtotal</th>
                                                      <th className="text-center py-1 px-1">Estado</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody>
                                                    {order.items.map((item, idx) => {
                                                      if (!item) return null

                                                      const cantidadEntregada =
                                                        Number(item.cantidadEntregada) || Number(item.cantidad) || 0
                                                      const subtotalCalculado =
                                                        cantidadEntregada * (Number(item.valorUnidad) || 0)
                                                      const subtotalFinal =
                                                        item.subtotalAjustado !== null &&
                                                        item.subtotalAjustado !== undefined
                                                          ? Number(item.subtotalAjustado)
                                                          : subtotalCalculado
                                                      const estadoProducto = item.estadoProducto || "normal"
                                                      const tieneAjusteManual =
                                                        item.subtotalAjustado !== null &&
                                                        item.subtotalAjustado !== undefined

                                                      return (
                                                        <tr key={idx} className={`border-b ${item.devuelto || item.motivoAjuste === 'devuelto' ? "bg-red-50" : item.motivoAjuste === 'error_facturacion' ? "bg-orange-50" : ""}`}>
                                                          <td className="py-1 px-1">
                                                            <Select
                                                              value={item.motivoAjuste || "normal"}
                                                              onValueChange={(value) => handleMotivoAjusteChange(order.id, item.codigo, value === "normal" ? "" : value)}
                                                            >
                                                              <SelectTrigger className="h-6 w-14 text-xs">
                                                                <SelectValue placeholder="—" />
                                                              </SelectTrigger>
                                                              <SelectContent>
                                                                <SelectItem value="normal">Normal</SelectItem>
                                                                <SelectItem value="devuelto">Devolución</SelectItem>
                                                                <SelectItem value="error_facturacion">Error Fact.</SelectItem>
                                                              </SelectContent>
                                                            </Select>
                                                          </td>
                                                          <td className="py-1 px-1">{item.codigo}</td>
                                                          <td className="py-1 px-1">{item.descripcion}</td>
                                                          <td className="text-center py-1 px-1">{item.cantidad}</td>
                                                          <td className="text-center py-1 px-1">
                                                            {!item.devuelto ? (
                                                              <Input
                                                                type="number"
                                                                defaultValue={cantidadEntregada}
                                                                min={0}
                                                                max={item.cantidad}
                                                                onBlur={(e) => {
                                                                  const newCant = Number.parseInt(e.target.value) || 0
                                                                  if (newCant !== cantidadEntregada) {
                                                                    handleCantidadChange(
                                                                      order.id,
                                                                      item.codigo,
                                                                      newCant,
                                                                      item.cantidad,
                                                                    )
                                                                  }
                                                                }}
                                                                onKeyDown={(e) => {
                                                                  if (e.key === "Enter") {
                                                                    e.currentTarget.blur()
                                                                  }
                                                                }}
                                                                className="w-16 px-2 py-1 border rounded text-center"
                                                              />
                                                            ) : (
                                                              <span>{cantidadEntregada}</span>
                                                            )}
                                                          </td>
                                                          <td className="text-right py-1 px-1">
                                                            {!item.devuelto ? (
                                                              <div className="flex flex-col items-end gap-1">
                                                                <Input
                                                                  type="number"
                                                                  defaultValue={subtotalFinal}
                                                                  min={0}
                                                                  onBlur={(e) => {
                                                                    const newSubtotal =
                                                                      Number.parseFloat(e.target.value) || 0
                                                                    if (newSubtotal !== subtotalFinal) {
                                                                      handleSubtotalChange(
                                                                        order.id,
                                                                        item.codigo,
                                                                        newSubtotal,
                                                                      )
                                                                    }
                                                                  }}
                                                                  onKeyDown={(e) => {
                                                                    if (e.key === "Enter") {
                                                                      e.currentTarget.blur()
                                                                    }
                                                                  }}
                                                                  placeholder={formatCOP(subtotalFinal)}
                                                                  className={`w-28 px-2 py-1 border rounded text-right font-medium ${
                                                                    tieneAjusteManual
                                                                      ? "border-orange-400 bg-orange-50"
                                                                      : ""
                                                                  }`}
                                                                />
                                                                <span className="text-[10px] text-gray-400">
                                                                  {formatCOP(subtotalFinal)}
                                                                </span>
                                                                {tieneAjusteManual && (
                                                                  <Badge variant="outline" className="text-[10px] bg-orange-100">
                                                                    Ajustado
                                                                  </Badge>
                                                                )}
                                                              </div>
                                                            ) : (
                                                              <div className="flex flex-col items-end gap-1">
                                                                <span className="font-medium">
                                                                  {formatCOP(subtotalFinal)}
                                                                </span>
                                                                {tieneAjusteManual && (
                                                                  <Badge variant="outline" className="text-[10px] bg-orange-100">
                                                                    Ajustado
                                                                  </Badge>
                                                                )}
                                                              </div>
                                                            )}
                                                          </td>
                                                          <td className="text-center py-1 px-1">
                                                            {estadoProducto === "agotado" && (
                                                              <Badge variant="outline" className="text-[10px] bg-gray-100">
                                                                Agotado
                                                              </Badge>
                                                            )}
                                                            {estadoProducto === "parcial" && (
                                                              <Badge variant="outline" className="text-[10px] bg-yellow-100">
                                                                Parcial
                                                              </Badge>
                                                            )}
                                                            {estadoProducto === "normal" && !item.devuelto && (
                                                              <Badge variant="outline" className="text-[10px] bg-green-100">
                                                                Normal
                                                              </Badge>
                                                            )}
                                                            {item.devuelto && (
                                                              <Badge variant="outline" className="text-[10px] bg-red-100">
                                                                Devuelto
                                                              </Badge>
                                                            )}
                                                          </td>
                                                        </tr>
                                                      )
                                                    })}
                                                  </tbody>
                                                </table>
                                              </div>

                                              <div className="flex justify-end mt-2 pt-2 border-t">
                                                <span className="font-medium text-sm">Total:</span>
                                                <span className="font-bold text-sm ml-2">
                                                  {formatCOP(effectiveTotal)}
                                                </span>
                                              </div>
                                            </div>

                                            {/* Descuentos */}
                                            <div className="pt-3 border-t">
                                              <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-medium text-gray-600">
                                                  Descuento (Opcional)
                                                </span>
                                              </div>

                                              <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                  <Label className="text-xs text-gray-500">
                                                    Monto del Descuento
                                                  </Label>
                                                  <Input
                                                    type="number"
                                                    min={0}
                                                    max={effectiveTotal}
                                                    defaultValue={order.descuento || ""}
                                                    placeholder="0"
                                                    onBlur={(e) => {
                                                      const descuento = Number(e.target.value) || 0
                                                      if (descuento > effectiveTotal) {
                                                        toast({
                                                          title: "Error",
                                                          description: `El descuento no puede ser mayor al total (${formatCOP(effectiveTotal)})`,
                                                          variant: "destructive",
                                                        })
                                                        e.target.value = "0"
                                                        return
                                                      }
                                                      handleDescuentoChange(order.id, descuento)
                                                    }}
                                                    className="mt-1"
                                                  />
                                                </div>

                                                <div>
                                                  <Label className="text-xs text-gray-500">
                                                    Motivo del Descuento
                                                  </Label>
                                                  <Input
                                                    type="text"
                                                    defaultValue={order.motivoDescuento || ""}
                                                    placeholder="Ej: Promoción, avería..."
                                                    onBlur={(e) => handleMotivoDescuentoChange(order.id, e.target.value)}
                                                    className="mt-1"
                                                  />
                                                </div>
                                              </div>

                                              {order.descuento && Number(order.descuento) > 0 && (
                                                <div className="mt-2 p-2 bg-purple-50 rounded flex justify-between items-center">
                                                  <span className="text-xs text-purple-600 font-medium">
                                                    Total con Descuento:
                                                  </span>
                                                  <span className="font-bold text-purple-700">
                                                    {formatCOP(effectiveTotal - (Number(order.descuento) || 0))}
                                                  </span>
                                                </div>
                                              )}
                                            </div>

                                            {/* Botones de estado */}
                                            <div className="flex flex-wrap gap-2">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleOrderStatusChange(order.id, "fiado")}
                                                className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50"
                                              >
                                                Fiado
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleOrderStatusChange(order.id, "repaso")}
                                                className="flex-1 sm:flex-none border-blue-300 text-blue-700 hover:bg-blue-50"
                                              >
                                                Repaso
                                              </Button>
                                              <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={() => handleOrderStatusChange(order.id, "devolucion")}
                                                className="flex-1 sm:flex-none"
                                              >
                                                Devolución
                                              </Button>
                                              <Button
                                                variant="default"
                                                size="sm"
                                                onClick={() => handleOrderStatusChange(order.id, "entregado")}
                                                className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
                                              >
                                                Entregado
                                              </Button>
                                            </div>
                                          </div>
                                        )}
                                      </Card>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </Card>
            </>
          )}
        </main>
      </div>

      {/* Modal para Fiado Parcial */}
      <Dialog open={showFiadoModal} onOpenChange={setShowFiadoModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Pago Parcial (Fiado)</DialogTitle>
            <DialogDescription>
              {selectedOrderForFiado && `Cliente: ${selectedOrderForFiado.cliente}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedOrderForFiado && (
              <>
                <div className="flex justify-between items-center p-3 bg-gray-100 rounded">
                  <span className="text-sm text-gray-600">Total Efectivo del Pedido:</span>
                  <span className="font-bold text-lg">{formatCOP(totalEfectivoFiado)}</span>
                </div>

                {totalEfectivoFiado !== selectedOrderForFiado.total && (
                  <div className="text-xs text-gray-500 p-2 bg-yellow-50 rounded border border-yellow-200">
                    <p>
                      <strong>Nota:</strong> El total original de la factura era {formatCOP(selectedOrderForFiado.total)}.
                    </p>
                    <p>
                      Se ajustó a {formatCOP(totalEfectivoFiado)} considerando productos devueltos, agotados o con errores de facturación.
                    </p>
                  </div>
                )}

                <div>
                  <Label htmlFor="montoPagadoFiado">¿Cuánto pagó?</Label>
                  <Input
                    id="montoPagadoFiado"
                    type="number"
                    min={0}
                    max={totalEfectivoFiado}
                    value={montoPagadoFiado}
                    onChange={(e) => setMontoPagadoFiado(e.target.value)}
                    placeholder="0"
                    className="col-span-1"
                    autoFocus
                  />
                </div>

                {montoPagadoFiado && (
                  <div className="flex justify-between items-center p-3 bg-orange-50 rounded border border-orange-200">
                    <span className="text-sm text-orange-700 font-medium">Saldo Pendiente:</span>
                    <span className="font-bold text-lg text-orange-700">
                      {formatCOP(totalEfectivoFiado - Number(montoPagadoFiado))}
                    </span>
                  </div>
                )}

                <p className="text-xs text-gray-500">
                  Nota: El pedido se marcará como "Fiado" y se registrará el monto pagado.
                  El saldo pendiente quedará como cuenta por cobrar.
                </p>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFiadoModal(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitFiado}>
              Guardar Fiado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Novedades */}
      {selectedOrderForNovedades && (
        <ModalNovedadesEntregador
          order={selectedOrderForNovedades}
          planillaId={selectedPlanillaId}
          onClose={() => {
            setSelectedOrderForNovedades(null)
            setSelectedPlanillaId(0)
          }}
          onNovedadCreada={() => {
            setSelectedOrderForNovedades(null)
            setSelectedPlanillaId(0)
            loadData()
          }}
        />
      )}
    </>
  )
}
