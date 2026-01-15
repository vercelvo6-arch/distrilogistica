"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DollarSign, LogOut, Filter, Wallet, History, Calendar, ChevronDown, ChevronUp } from "lucide-react"
import type { RouteSheet, User, RecepcionCaja } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import {
  updatePedidoEstado,
  updateProductoDevuelto,
  updateCantidadEntregada,
  updateSubtotalAjustado,
} from "@/lib/actions/planillas"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { ComisionesView } from "@/components/comisiones-view"

interface CajaViewProps {
  onLogout: () => void
  user: User
}

export function CajaView({ onLogout, user }: CajaViewProps) {
  const { toast } = useToast()
  const [filterEntregador, setFilterEntregador] = useState<string>("all")
  const [filterRuta, setFilterRuta] = useState<string>("all")
  const [filterFecha, setFilterFecha] = useState<string>(new Date().toISOString().split("T")[0])
  const [selectedView, setSelectedView] = useState<"caja" | "historial" | "comisiones">("caja")
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [recepciones, setRecepciones] = useState<RecepcionCaja[]>([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [selectedPlanilla, setSelectedPlanilla] = useState<RouteSheet | null>(null)
  const [formData, setFormData] = useState({
    efectivoRecibido: "",
    tieneConsignacion: false,
    numeroConsignacion: "",
    banco: "",
    montoConsignacion: "",
    fechaConsignacion: new Date().toISOString().split("T")[0],
    observaciones: "",
  })
  const [submitting, setSubmitting] = useState(false)
  const [validatingConsignacion, setValidatingConsignacion] = useState(false)
  const [selectedRoutes, setSelectedRoutes] = useState<number[]>([])
  const [showAgrupadoModal, setShowAgrupadoModal] = useState(false)
  const [agrupadoData, setAgrupadoData] = useState<any>(null)
  const [expandedRoutes, setExpandedRoutes] = useState<Set<number>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

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

      const planillas: RouteSheet[] = (data.planillas || []).map((p: any) => ({
        id: p.id,
        ruta: p.tipo_ruta,
        fecha: p.fecha,
        entregador: p.entregador,
        estado: p.estado,
        cuadradoEnCaja: p.cuadrado_en_caja || false,
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
            categoria: "",
            cantidad: Number(prod.cantidad) || 0,
            valorUnidad: Number(prod.precio_unitario) || 0,
            subtotal: Number(prod.total) || 0,
          })),
        })),
        cuentasPorCobrar: [],
      }))

      setRouteSheets(planillas)
    } catch (err) {
      console.error("[CAJA] Error loading planillas:", err)
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
      const response = await fetch("/api/caja/recibir-efectivo")
      if (!response.ok) throw new Error("Error al cargar historial")

      const data = await response.json()
      setRecepciones(data.recepciones || [])
    } catch (err) {
      console.error("[CAJA] Error loading historial:", err)
      toast({
        title: "Error",
        description: "No se pudo cargar el historial",
        variant: "destructive",
      })
    }
  }

  const completedRoutes = routeSheets.filter(
    (s) => (s.estado === "alistado" || s.estado === "completado") && !s.cuadradoEnCaja,
  )

  const entregadores = Array.from(new Set(completedRoutes.map((r) => r.entregador).filter(Boolean))) as string[]
  const rutas = Array.from(new Set(completedRoutes.map((r) => r.ruta)))

  const filteredRoutes = completedRoutes.filter((route) => {
    if (filterEntregador !== "all" && route.entregador !== filterEntregador) return false
    if (filterRuta !== "all" && route.ruta !== filterRuta) return false
    if (filterFecha) {
      const routeDate = new Date(route.fecha).toISOString().split("T")[0]
      if (routeDate !== filterFecha) return false
    }
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

    return {
      entregado: Math.round(entregado * 100) / 100,
      fiado: Math.round(fiado * 100) / 100,
      devoluciones: Math.round(devoluciones * 100) / 100,
      repasos: Math.round(repasos * 100) / 100,
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

  const handleItemReturn = async (orderId: string, codigo: string, currentDevuelto: boolean) => {
    try {
      await updateProductoDevuelto(orderId, codigo, !currentDevuelto)
      await loadData()
      
      toast({
        title: currentDevuelto ? "Producto activado" : "Producto devuelto",
        description: `El producto ha sido marcado como ${!currentDevuelto ? "devuelto" : "activo"}`,
      })
    } catch (err) {
      console.error("[CAJA] Error updating product return:", err)
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
      console.error("[CAJA] Error updating quantity:", err)
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
      console.error("[CAJA] Error updating subtotal:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar el subtotal",
        variant: "destructive",
      })
    }
  }

  const handleOrderStatusChange = async (orderId: string, newStatus: Order["estado"]) => {
    try {
      await updatePedidoEstado(orderId, newStatus)
      await loadData()

      toast({
        title: "Actualizado",
        description: `Pedido marcado como ${newStatus}`,
      })
    } catch (err) {
      console.error("[CAJA] Error updating order status:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar el pedido",
        variant: "destructive",
      })
    }
  }
  
  const handleOpenModal = (planilla: RouteSheet) => {
    const totals = calculateRouteTotals(planilla)
    setSelectedPlanilla(planilla)
    setFormData({
      efectivoRecibido: totals.entregado.toString(),
      tieneConsignacion: false,
      numeroConsignacion: "",
      banco: "",
      montoConsignacion: "",
      fechaConsignacion: new Date().toISOString().split("T")[0],
      observaciones: "",
    })
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedPlanilla(null)
    setFormData({
      efectivoRecibido: "",
      tieneConsignacion: false,
      numeroConsignacion: "",
      banco: "",
      montoConsignacion: "",
      fechaConsignacion: new Date().toISOString().split("T")[0],
      observaciones: "",
    })
  }

  const validateConsignacion = async (numero: string): Promise<boolean> => {
    if (!numero.trim()) return false

    setValidatingConsignacion(true)
    try {
      const response = await fetch("/api/caja/validar-consignacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeroConsignacion: numero }),
      })

      const data = await response.json()

      if (data.existe) {
        toast({
          title: "⚠️ Consignación Duplicada",
          description: "Este número de consignación ya fue registrado anteriormente",
          variant: "destructive",
        })
      }

      return data.existe
    } catch (error) {
      console.error("Error validando consignación:", error)
      return false
    } finally {
      setValidatingConsignacion(false)
    }
  }

  const handleConsignacionBlur = async () => {
    if (formData.tieneConsignacion && formData.numeroConsignacion) {
      await validateConsignacion(formData.numeroConsignacion)
    }
  }

  const handleAgruparRutas = () => {
    if (selectedRoutes.length === 0) {
      toast({
        title: "Error",
        description: "Selecciona al menos una ruta para agrupar",
        variant: "destructive",
      })
      return
    }

    const rutasSeleccionadas = filteredRoutes.filter((r) => selectedRoutes.includes(r.id))

    const entregadores = new Set(rutasSeleccionadas.map((r) => r.entregador))

    if (entregadores.size > 1) {
      toast({
        title: "Error",
        description: "Solo puedes agrupar rutas del mismo entregador",
        variant: "destructive",
      })
      return
    }

    let totalCargue = 0
    let totalEntregado = 0
    let totalFiado = 0
    let totalDevoluciones = 0
    let totalRepasos = 0

    rutasSeleccionadas.forEach((route) => {
      totalCargue += route.totalAmount

      route.orders.forEach((order) => {
        let effectiveTotal = 0
        
        order.items.forEach((item) => {
          if (item.devuelto) return // No cuenta
          
          const estadoProd = item.estadoProducto || 'normal'
          if (estadoProd === 'agotado') return // Agotados no suman
          
          // Usar subtotal ajustado si existe, sino calcular basado en cantidad entregada
          if (item.subtotalAjustado !== null && item.subtotalAjustado !== undefined) {
            effectiveTotal += Number(item.subtotalAjustado)
          } else if (item.cantidadEntregada !== null && item.cantidadEntregada !== undefined) {
            effectiveTotal += Number(item.cantidadEntregada) * Number(item.valorUnidad)
          } else {
            effectiveTotal += Number(item.subtotal)
          }
        })

        // Clasificar por estado del pedido
        if (order.estado === 'entregado') {
          totalEntregado += effectiveTotal
        } else if (order.estado === 'fiado') {
          totalFiado += effectiveTotal
        } else if (order.estado === 'devolucion') {
          totalDevoluciones += effectiveTotal
        } else if (order.estado === 'repaso') {
          totalRepasos += effectiveTotal
        }
      })
    })

    const agrupado = {
      entregador: rutasSeleccionadas[0].entregador,
      planillas: rutasSeleccionadas,
      planillaIds: selectedRoutes,
      totalRutas: rutasSeleccionadas.length,
      totales: {
        cargue: totalCargue,
        entregado: totalEntregado,
        fiado: totalFiado,
        devoluciones: totalDevoluciones,
        repasos: totalRepasos,
      },
    }

    setAgrupadoData(agrupado)
    setFormData({
      efectivoRecibido: totalEntregado.toString(),
      tieneConsignacion: false,
      numeroConsignacion: "",
      banco: "",
      montoConsignacion: "",
      fechaConsignacion: new Date().toISOString().split("T")[0],
      observaciones: "",
    })
    setShowAgrupadoModal(true)
  }

  const handleSubmitAgrupado = async () => {
    if (!agrupadoData) return

    if (!formData.efectivoRecibido || Number(formData.efectivoRecibido) < 0) {
      toast({
        title: "Error",
        description: "El efectivo recibido debe ser un valor válido",
        variant: "destructive",
      })
      return
    }

    if (formData.tieneConsignacion) {
      if (!formData.numeroConsignacion || !formData.banco || !formData.montoConsignacion) {
        toast({
          title: "Error",
          description: "Complete todos los datos de la consignación",
          variant: "destructive",
        })
        return
      }

      const existe = await validateConsignacion(formData.numeroConsignacion)
      if (existe) return
    }

    try {
      setSubmitting(true)

      const response = await fetch("/api/cuadres-caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaIds: agrupadoData.planillaIds,
          entregador: agrupadoData.entregador,
          totalEsperado: agrupadoData.totales.entregado,
          efectivoRecibido: Number(formData.efectivoRecibido),
          tieneConsignacion: formData.tieneConsignacion,
          numeroConsignacion: formData.tieneConsignacion ? formData.numeroConsignacion : null,
          banco: formData.tieneConsignacion ? formData.banco : null,
          montoConsignacion: formData.tieneConsignacion ? Number(formData.montoConsignacion) : null,
          observaciones: formData.observaciones || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al registrar cuadre agrupado")
      }

      toast({
        title: "✅ Cuadre Agrupado Registrado",
        description: data.mensaje,
      })

      setShowAgrupadoModal(false)
      setSelectedRoutes([])
      setAgrupadoData(null)
      await loadData()
    } catch (error) {
      console.error("Error al registrar cuadre agrupado:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al registrar cuadre",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedPlanilla) return

    if (!formData.efectivoRecibido || Number(formData.efectivoRecibido) < 0) {
      toast({
        title: "Error",
        description: "El efectivo recibido debe ser un valor válido",
        variant: "destructive",
      })
      return
    }

    if (formData.tieneConsignacion) {
      if (!formData.numeroConsignacion || !formData.banco || !formData.montoConsignacion) {
        toast({
          title: "Error",
          description: "Complete todos los datos de la consignación",
          variant: "destructive",
        })
        return
      }

      const existe = await validateConsignacion(formData.numeroConsignacion)
      if (existe) {
        return
      }
    }

    try {
      setSubmitting(true)

      const totals = calculateRouteTotals(selectedPlanilla)

      const response = await fetch("/api/caja/recibir-efectivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaId: selectedPlanilla.id,
          efectivoEsperado: totals.entregado,
          efectivoRecibido: Number(formData.efectivoRecibido),
          tieneConsignacion: formData.tieneConsignacion,
          numeroConsignacion: formData.tieneConsignacion ? formData.numeroConsignacion : null,
          banco: formData.tieneConsignacion ? formData.banco : null,
          montoConsignacion: formData.tieneConsignacion ? Number(formData.montoConsignacion) : null,
          fechaConsignacion: formData.tieneConsignacion ? formData.fechaConsignacion : null,
          observaciones: formData.observaciones || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al registrar recepción")
      }

      toast({
        title: "✅ Recepción Registrada",
        description: data.mensaje,
      })

      handleCloseModal()
      await loadData()
    } catch (error) {
      console.error("Error al registrar recepción:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al registrar recepción",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
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

  const totalRecibido = selectedPlanilla
    ? Number(formData.efectivoRecibido || 0) +
      (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0)
    : 0

  const diferencia = selectedPlanilla
    ? Math.round((totalRecibido - calculateRouteTotals(selectedPlanilla).entregado) * 100) / 100
    : 0

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
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedView === "caja" ? "default" : "outline"}
              onClick={() => setSelectedView("caja")}
              size="sm"
            >
              <DollarSign className="h-4 w-4 mr-2" />
              Cuadre de Caja
            </Button>
            <Button
              variant={selectedView === "historial" ? "default" : "outline"}
              onClick={() => setSelectedView("historial")}
              size="sm"
            >
              <History className="h-4 w-4 mr-2" />
              Historial
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
          ) : selectedView === "historial" ? (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Historial de Recepciones</h2>
              {recepciones.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay recepciones registradas</p>
              ) : (
                <div className="space-y-3">
                  {recepciones.map((rec) => (
                    <div key={rec.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold">
                            {rec.entregador} - Ruta {rec.tipo_ruta}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(rec.fecha_recepcion).toLocaleString("es-CO")}
                          </p>
                        </div>
                        <Badge variant={rec.estado === "cuadrado" ? "default" : "destructive"}>
                          {rec.estado === "cuadrado" ? "✓ Cuadrado" : "⚠ Con Diferencia"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Esperado</p>
                          <p className="font-semibold">{formatCOP(Number(rec.efectivo_esperado))}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Recibido</p>
                          <p className="font-semibold text-green-600">{formatCOP(Number(rec.efectivo_recibido))}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Diferencia</p>
                          <p
                            className={`font-semibold ${Number(rec.diferencia_efectivo) === 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {Number(rec.diferencia_efectivo) > 0 ? "+" : ""}
                            {formatCOP(Number(rec.diferencia_efectivo))}
                          </p>
                        </div>
                      </div>

                      {rec.tiene_consignacion && (
                        <div className="mt-3 pt-3 border-t bg-blue-50 -m-4 p-4 rounded-b-lg">
                          <p className="text-sm font-medium mb-2">📄 Consignación</p>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Número</p>
                              <p className="font-mono">{rec.numero_consignacion}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Banco</p>
                              <p>{rec.banco}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Monto</p>
                              <p className="font-semibold">{formatCOP(Number(rec.monto_consignacion))}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {rec.observaciones && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm text-muted-foreground">Observaciones:</p>
                          <p className="text-sm">{rec.observaciones}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ) : (
            <>
              <Card className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <Filter className="h-5 w-5 text-muted-foreground" />

                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      value={filterFecha}
                      onChange={(e) => setFilterFecha(e.target.value)}
                      className="w-[180px]"
                    />
                  </div>

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
                <h2 className="text-lg font-semibold mb-4">Entregas Pendientes de Cuadrar</h2>
                {filteredRoutes.length > 0 && (
                  <div className="flex items-center justify-between mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedRoutes.length === filteredRoutes.length && filteredRoutes.length > 0}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRoutes(filteredRoutes.map((r) => r.id))
                          } else {
                            setSelectedRoutes([])
                          }
                        }}
                      />
                      <span className="text-sm font-medium">Seleccionar todas ({filteredRoutes.length})</span>
                    </div>

                    {selectedRoutes.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{selectedRoutes.length} seleccionadas</Badge>
                        <Button size="sm" onClick={handleAgruparRutas}>
                          Agrupar y Cuadrar ({selectedRoutes.length})
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setSelectedRoutes([])}>
                          Limpiar
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {filteredRoutes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    ✅ No hay entregas pendientes de cuadrar para la fecha seleccionada
                  </p>
                ) : (
                  <div className="space-y-4">
                    {filteredRoutes.map((route) => {
                      const totals = calculateRouteTotals(route)
                      const isSelected = selectedRoutes.includes(route.id)

                      return (
                        <div key={route.id} className="border rounded-lg p-4 bg-amber-50 border-amber-200">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedRoutes([...selectedRoutes, route.id])
                                } else {
                                  setSelectedRoutes(selectedRoutes.filter((id) => id !== route.id))
                                }
                              }}
                              className="mt-1"
                            />

                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-4">
                                <p className="font-semibold text-lg">
                                  {route.entregador} - Ruta {route.ruta}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {route.totalOrders} pedidos · Fecha:{" "}
                                  {new Date(route.fecha).toLocaleDateString("es-CO")}
                                </p>
                              </div>
                              <div className="flex gap-2">
  <Button 
    onClick={() => toggleRouteExpansion(route.id)} 
    variant="outline" 
    size="sm"
  >
    {expandedRoutes.has(route.id) ? (
      <>
        <ChevronUp className="h-4 w-4 mr-2" />
        Ocultar Clientes
      </>
    ) : (
      <>
        <ChevronDown className="h-4 w-4 mr-2" />
        Ver Clientes
      </>
    )}
  </Button>
  <Button onClick={() => handleOpenModal(route)} size="sm">
    <DollarSign className="h-4 w-4 mr-2" />
    Recibir Efectivo
  </Button>
</div>
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
                          </div>

                          <div className="mt-4 pt-4 border-t bg-white -mx-4 -mb-4 px-4 py-3 rounded-b-lg">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">💵 Efectivo Esperado:</p>
                              <p className="text-xl font-bold text-green-600">{formatCOP(totals.entregado)}</p>
                            </div>
                            </div>
              </div>
              {expandedRoutes.has(route.id) && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="font-semibold mb-3">Clientes de la ruta:</h3>
                  
                  <div className="space-y-3">
                    {route.orders.map((order) => {
                      const isExpanded = expandedOrders.has(order.id)
                      
                      // Calcular totales correctamente
                      let effectiveTotal = 0
                      let returnedTotal = 0
                      
                      order.items.forEach((item) => {
                        if (item.devuelto) {
                          returnedTotal += Number(item.subtotal) || 0
                        } else {
                          const estadoProd = item.estadoProducto || 'normal'
                          if (estadoProd === 'agotado') return
                          
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
                                
                                <p className="text-xs md:text-sm text-muted-foreground">
                                  {order.items.length} productos · {formatCOP(effectiveTotal)}
                                  {returnedTotal > 0 && (
                                    <span className="text-red-600 ml-2">· Dev: {formatCOP(returnedTotal)}</span>
                                  )}
                                </p>
                              </div>
                              <Button 
                                variant="outline" 
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
                                                handleItemReturn(order.id, item.codigo, item.devuelto || false)
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
                                  onClick={() => handleOrderStatusChange(order.id, "entregado")}
                                  className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
                                  disabled={order.estado !== "pendiente"}
                                >
                                  Entregado
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOrderStatusChange(order.id, "fiado")}
                                  className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50"
                                  disabled={order.estado !== "pendiente"}
                                >
                                  Fiado
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleOrderStatusChange(order.id, "repaso")}
                                  className="flex-1 sm:flex-none border-blue-300 text-blue-700 hover:bg-blue-50"
                                  disabled={order.estado !== "pendiente"}
                                >
                                  Repaso
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleOrderStatusChange(order.id, "devolucion")}
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
              )}

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

      <Dialog open={showAgrupadoModal} onOpenChange={setShowAgrupadoModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cuadre Agrupado</DialogTitle>
            <DialogDescription>
              {agrupadoData?.entregador} - {agrupadoData?.totalRutas} rutas agrupadas
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {agrupadoData && (
              <>
                <div className="bg-blue-50 p-3 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Rutas:</span>
                    <span className="font-medium">{agrupadoData.totalRutas}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Cargue:</span>
                    <span className="font-semibold">{formatCOP(agrupadoData.totales.cargue)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="text-blue-700">Efectivo Esperado:</span>
                    <span className="text-xl font-bold text-blue-900">{formatCOP(agrupadoData.totales.entregado)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="efectivo-agrupado">💵 Efectivo Recibido *</Label>
                  <Input
                    id="efectivo-agrupado"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.efectivoRecibido}
                    onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consignacion-agrupado"
                    checked={formData.tieneConsignacion}
                    onCheckedChange={(checked) => setFormData({ ...formData, tieneConsignacion: checked as boolean })}
                    disabled={submitting}
                  />
                  <Label htmlFor="consignacion-agrupado" className="cursor-pointer">
                    ¿Hay Consignación Bancaria?
                  </Label>
                </div>

                {formData.tieneConsignacion && (
                  <div className="space-y-3 p-3 border rounded-lg bg-gray-50">
                    <div className="space-y-2">
                      <Label>Número de Consignación *</Label>
                      <Input
                        placeholder="Ej: 123456789"
                        value={formData.numeroConsignacion}
                        onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                        onBlur={handleConsignacionBlur}
                        disabled={submitting || validatingConsignacion}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Banco *</Label>
                      <Select
                        value={formData.banco}
                        onValueChange={(value) => setFormData({ ...formData, banco: value })}
                        disabled={submitting}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar banco" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bancolombia">Bancolombia</SelectItem>
                          <SelectItem value="Davivienda">Davivienda</SelectItem>
                          <SelectItem value="BBVA">BBVA</SelectItem>
                          <SelectItem value="Nequi">Nequi</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Monto *</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.montoConsignacion}
                          onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                          disabled={submitting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Fecha *</Label>
                        <Input
                          type="date"
                          value={formData.fechaConsignacion}
                          onChange={(e) => setFormData({ ...formData, fechaConsignacion: e.target.value })}
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAgrupadoModal(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitAgrupado} disabled={submitting}>
              Confirmar Cuadre Agrupado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recibir Efectivo</DialogTitle>
            <DialogDescription>
              {selectedPlanilla?.entregador} - Ruta {selectedPlanilla?.ruta}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {selectedPlanilla && (
              <>
                <div className="bg-blue-50 p-3 rounded-lg">
                  <p className="text-sm text-blue-700 mb-1">Efectivo Esperado</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {formatCOP(calculateRouteTotals(selectedPlanilla).entregado)}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="efectivo">💵 Efectivo Recibido *</Label>
                  <Input
                    id="efectivo"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.efectivoRecibido}
                    onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="consignacion"
                    checked={formData.tieneConsignacion}
                    onCheckedChange={(checked) => setFormData({ ...formData, tieneConsignacion: checked as boolean })}
                    disabled={submitting}
                  />
                  <Label htmlFor="consignacion" className="cursor-pointer">
                    ¿Hay Consignación Bancaria?
                  </Label>
                </div>

                {formData.tieneConsignacion && (
                  <div className="space-y-3 p-3 border rounded-lg bg-gray-50">
                    <div className="space-y-2">
                      <Label htmlFor="numero">Número de Consignación *</Label>
                      <Input
                        id="numero"
                        placeholder="Ej: 123456789"
                        value={formData.numeroConsignacion}
                        onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                        onBlur={handleConsignacionBlur}
                        disabled={submitting || validatingConsignacion}
                      />
                      {validatingConsignacion && <p className="text-xs text-blue-600">Validando...</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="banco">Banco *</Label>
                      <Select
                        value={formData.banco}
                        onValueChange={(value) => setFormData({ ...formData, banco: value })}
                        disabled={submitting}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar banco" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bancolombia">Bancolombia</SelectItem>
                          <SelectItem value="Davivienda">Davivienda</SelectItem>
                          <SelectItem value="BBVA">BBVA</SelectItem>
                          <SelectItem value="Banco de Bogotá">Banco de Bogotá</SelectItem>
                          <SelectItem value="Nequi">Nequi</SelectItem>
                          <SelectItem value="Daviplata">Daviplata</SelectItem>
                          <SelectItem value="Otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="monto">Monto *</Label>
                        <Input
                          id="monto"
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={formData.montoConsignacion}
                          onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                          disabled={submitting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="fecha">Fecha *</Label>
                        <Input
                          id="fecha"
                          type="date"
                          value={formData.fechaConsignacion}
                          onChange={(e) => setFormData({ ...formData, fechaConsignacion: e.target.value })}
                          disabled={submitting}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="obs">📝 Observaciones (opcional)</Label>
                  <Textarea
                    id="obs"
                    placeholder="Notas adicionales..."
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    disabled={submitting}
                    rows={2}
                  />
                </div>

                {(formData.efectivoRecibido || formData.montoConsignacion) && (
                  <div
                    className={`p-3 rounded-lg ${
                      diferencia === 0 ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Efectivo:</span>
                        <span className="font-medium">{formatCOP(Number(formData.efectivoRecibido || 0))}</span>
                      </div>
                      {formData.tieneConsignacion && formData.montoConsignacion && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Consignación:</span>
                          <span className="font-medium">{formatCOP(Number(formData.montoConsignacion))}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm pt-2 border-t">
                        <span className="text-muted-foreground">Total Recibido:</span>
                        <span className="font-semibold">{formatCOP(totalRecibido)}</span>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <p className="text-sm font-medium">Diferencia:</p>
                        <p className={`text-xl font-bold ${diferencia === 0 ? "text-green-600" : "text-amber-600"}`}>
                          {diferencia > 0 ? "+" : ""}
                          {formatCOP(diferencia)}
                        </p>
                      </div>
                    </div>
                    {diferencia !== 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        {diferencia > 0
                          ? "Sobrante (se registra para auditoría)"
                          : "Faltante (se registra para auditoría)"}
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting || validatingConsignacion}>
              {submitting ? "Registrando..." : "Confirmar Recepción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
