"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DollarSign, LogOut, Filter, Wallet, History, Calendar, ChevronDown, ChevronUp, Plus, X } from "lucide-react"
import type { RouteSheet, User, RecepcionCaja, Order } from "@/lib/types"
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

interface NuevoProducto {
  codigo: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  subtotal: number
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

  const [showNuevoPedidoModal, setShowNuevoPedidoModal] = useState(false)
  const [rutaParaNuevoPedido, setRutaParaNuevoPedido] = useState<RouteSheet | null>(null)
  const [nuevoPedidoData, setNuevoPedidoData] = useState({
    cliente: "",
    observaciones: "",
  })
  const [productosNuevoPedido, setProductosNuevoPedido] = useState<NuevoProducto[]>([
    { codigo: "", descripcion: "", cantidad: 1, precioUnitario: 0, subtotal: 0 },
  ])
  const [submittingNuevoPedido, setSubmittingNuevoPedido] = useState(false)

  const [reasignandoRuta, setReasignandoRuta] = useState<number | null>(null)

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
          montoPagado: 0,
          saldoPendiente: Number(ped.total) || 0,
          comentarios: ped.observaciones,
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
      const responseIndividuales = await fetch("/api/caja/recibir-efectivo")
      const dataIndividuales = await responseIndividuales.json()

      const responseAgrupados = await fetch("/api/cuadres-caja/historial")
      const dataAgrupados = await responseAgrupados.json()

      const recepcionesIndividuales = Array.isArray(dataIndividuales.recepciones)
        ? dataIndividuales.recepciones.map((r: any) => ({ ...r, tipo: "individual" }))
        : []

      const cuadresAgrupados = Array.isArray(dataAgrupados.cuadres)
        ? dataAgrupados.cuadres.map((c: any) => {
            const numRutas = Array.isArray(c.planillas_ids) ? c.planillas_ids.length : 0
            const tipoRutaDisplay = c.rutas_nombres && c.rutas_nombres.length > 0
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
              monto_consignacion: c.total_consignado !== null && c.total_consignado !== undefined ? c.total_consignado : 0,
            }
          })
        : []

      const todosLosCuadres = [...recepcionesIndividuales, ...cuadresAgrupados].sort(
        (a, b) => new Date(b.fecha_recepcion).getTime() - new Date(a.fecha_recepcion).getTime(),
      )

      setRecepciones(todosLosCuadres)
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

  const calculateRouteTotals = (route: RouteSheet | null) => {
    if (!route || !Array.isArray(route.orders)) {
      return { entregado: 0, fiado: 0, devoluciones: 0, repasos: 0 }
    }

    let entregado = 0
    let fiado = 0
    let devoluciones = 0
    let repasos = 0

    route.orders.forEach((order) => {
      if (!order || !Array.isArray(order.items)) return

      let effectiveTotal = 0
      let returnedTotal = 0

      order.items.forEach((item) => {
        if (!item) return

        if (item.devuelto) {
          returnedTotal += Number(item.subtotal) || 0
        } else {
          const estadoProd = item.estadoProducto || "normal"
          if (estadoProd === "agotado") return

          if (item.subtotalAjustado !== null && item.subtotalAjustado !== undefined) {
            effectiveTotal += Number(item.subtotalAjustado) || 0
          } else if (item.cantidadEntregada !== null && item.cantidadEntregada !== undefined) {
            effectiveTotal += (Number(item.cantidadEntregada) || 0) * (Number(item.valorUnidad) || 0)
          } else {
            effectiveTotal += Number(item.subtotal) || 0
          }
        }
      })

      if (order.estado === "entregado") {
        entregado += effectiveTotal
      } else if (order.estado === "fiado") {
        fiado += effectiveTotal
      } else if (order.estado === "devolucion") {
        devoluciones += effectiveTotal
      } else if (order.estado === "repaso") {
        repasos += effectiveTotal
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

  const handleReasignarRuta = async (planillaId: number, nuevoEntregador: string) => {
    try {
      setReasignandoRuta(planillaId)

      const response = await fetch("/api/planillas/reasignar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaId,
          nuevoEntregador,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al reasignar ruta")
      }

      toast({
        title: "Ruta Reasignada",
        description: `La ruta ha sido reasignada a ${nuevoEntregador}`,
      })

      await loadData()
    } catch (error) {
      console.error("Error al reasignar ruta:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al reasignar ruta",
        variant: "destructive",
      })
    } finally {
      setReasignandoRuta(null)
    }
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
        title: "Subtotal ajustado",
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

  const handleOpenNuevoPedidoModal = (ruta: RouteSheet) => {
    setRutaParaNuevoPedido(ruta)
    setNuevoPedidoData({ cliente: "", observaciones: "" })
    setProductosNuevoPedido([{ codigo: "", descripcion: "", cantidad: 1, precioUnitario: 0, subtotal: 0 }])
    setShowNuevoPedidoModal(true)
  }

  const handleCloseNuevoPedidoModal = () => {
    setShowNuevoPedidoModal(false)
    setRutaParaNuevoPedido(null)
    setNuevoPedidoData({ cliente: "", observaciones: "" })
    setProductosNuevoPedido([{ codigo: "", descripcion: "", cantidad: 1, precioUnitario: 0, subtotal: 0 }])
  }

  const agregarProducto = () => {
    setProductosNuevoPedido([
      ...productosNuevoPedido,
      { codigo: "", descripcion: "", cantidad: 1, precioUnitario: 0, subtotal: 0 },
    ])
  }

  const eliminarProducto = (index: number) => {
    if (productosNuevoPedido.length > 1) {
      setProductosNuevoPedido(productosNuevoPedido.filter((_, i) => i !== index))
    }
  }

  const actualizarProducto = (index: number, field: keyof NuevoProducto, value: any) => {
    const nuevosProductos = [...productosNuevoPedido]
    nuevosProductos[index] = {
      ...nuevosProductos[index],
      [field]: value,
    }

    if (field === "cantidad" || field === "precioUnitario") {
      const cantidad = field === "cantidad" ? Number(value) : nuevosProductos[index].cantidad
      const precio = field === "precioUnitario" ? Number(value) : nuevosProductos[index].precioUnitario
      nuevosProductos[index].subtotal = Math.round(cantidad * precio * 100) / 100
    }

    setProductosNuevoPedido(nuevosProductos)
  }

  const calcularTotalNuevoPedido = () => {
    return productosNuevoPedido.reduce((total, prod) => total + prod.subtotal, 0)
  }

  const handleSubmitNuevoPedido = async () => {
    if (!rutaParaNuevoPedido) return

    if (!nuevoPedidoData.cliente.trim()) {
      toast({
        title: "Error",
        description: "Debes ingresar el nombre del cliente",
        variant: "destructive",
      })
      return
    }

    const productosValidos = productosNuevoPedido.filter(
      (p) => p.codigo.trim() && p.descripcion.trim() && p.cantidad > 0 && p.precioUnitario >= 0,
    )

    if (productosValidos.length === 0) {
      toast({
        title: "Error",
        description: "Debes agregar al menos un producto válido",
        variant: "destructive",
      })
      return
    }

    try {
      setSubmittingNuevoPedido(true)

      const totalPedido = calcularTotalNuevoPedido()

      const response = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaId: rutaParaNuevoPedido.id,
          cliente: nuevoPedidoData.cliente,
          observaciones: nuevoPedidoData.observaciones || null,
          productos: productosValidos.map((p) => ({
            codigo: p.codigo,
            nombre: p.descripcion,
            cantidad: p.cantidad,
            precio_unitario: p.precioUnitario,
            total: p.subtotal,
          })),
          total: totalPedido,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al crear pedido")
      }

      toast({
        title: "Pedido Creado",
        description: `Pedido agregado exitosamente a la ruta ${rutaParaNuevoPedido.ruta}`,
      })

      handleCloseNuevoPedidoModal()
      await loadData()
    } catch (error) {
      console.error("Error al crear pedido:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al crear pedido",
        variant: "destructive",
      })
    } finally {
      setSubmittingNuevoPedido(false)
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
          title: "Consignación Duplicada",
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

    const entregadoresSet = new Set(rutasSeleccionadas.map((r) => r.entregador))

    if (entregadoresSet.size > 1) {
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

    const nombresRutas = rutasSeleccionadas.map((r) => r.ruta)

    rutasSeleccionadas.forEach((route) => {
      if (!route) return

      totalCargue += route.totalAmount

      if (!Array.isArray(route.orders)) return

      route.orders.forEach((order) => {
        if (!order || !Array.isArray(order.items)) return

        let effectiveTotal = 0

        order.items.forEach((item) => {
          if (!item || item.devuelto) return

          const estadoProd = item.estadoProducto || "normal"
          if (estadoProd === "agotado") return

          if (item.subtotalAjustado !== null && item.subtotalAjustado !== undefined) {
            effectiveTotal += Number(item.subtotalAjustado)
          } else if (item.cantidadEntregada !== null && item.cantidadEntregada !== undefined) {
            effectiveTotal += Number(item.cantidadEntregada) * Number(item.valorUnidad)
          } else {
            effectiveTotal += Number(item.subtotal)
          }
        })

        if (order.estado === "entregado") {
          totalEntregado += effectiveTotal
        } else if (order.estado === "fiado") {
          totalFiado += effectiveTotal
        } else if (order.estado === "devolucion") {
          totalDevoluciones += effectiveTotal
        } else if (order.estado === "repaso") {
          totalRepasos += effectiveTotal
        }
      })
    })

    const agrupado = {
      entregador: rutasSeleccionadas[0].entregador,
      planillas: rutasSeleccionadas,
      planillaIds: selectedRoutes,
      totalRutas: rutasSeleccionadas.length,
      nombresRutas,
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
        title: "Cuadre Agrupado Registrado",
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
        title: "Recepción Registrada",
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

  const totalCargue = filteredRoutes.reduce((sum, r) => sum + (r?.totalAmount || 0), 0)

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
                            {rec.entregador} - {rec.tipo_ruta}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(rec.fecha_recepcion).toLocaleString("es-CO")}
                          </p>
                        </div>
                        <Badge variant={rec.estado === "cuadrado" ? "default" : "destructive"}>
                          {rec.estado === "cuadrado" ? "Cuadrado" : "Con Diferencia"}
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
                          <p className="text-sm font-medium mb-2">Consignación</p>
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
                              <p className="font-semibold">{formatCOP(Number(rec.monto_consignacion || 0))}</p>
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

              {selectedRoutes.length > 0 && (
                <Card className="p-4 bg-blue-50 border-blue-200">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">
                      {selectedRoutes.length} ruta{selectedRoutes.length > 1 ? "s" : ""} seleccionada
                      {selectedRoutes.length > 1 ? "s" : ""}
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedRoutes([])}>
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={handleAgruparRutas}>
                        Agrupar y Cuadrar
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              <div className="space-y-4">
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Cargando planillas...</p>
                ) : filteredRoutes.length === 0 ? (
                  <Card className="p-8">
                    <p className="text-center text-muted-foreground">
                      No hay rutas completadas pendientes de cuadre para esta fecha
                    </p>
                  </Card>
                ) : (
                  filteredRoutes.map((route) => {
                    const routeTotals = calculateRouteTotals(route)
                    const isExpanded = expandedRoutes.has(route.id)
                    const isSelected = selectedRoutes.includes(route.id)

                    return (
                      <Card key={route.id} className={`p-4 ${isSelected ? "ring-2 ring-blue-500" : ""}`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedRoutes([...selectedRoutes, route.id])
                                } else {
                                  setSelectedRoutes(selectedRoutes.filter((id) => id !== route.id))
                                }
                              }}
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-lg">
                                  Ruta {route.ruta} - {route.entregador}
                                </h3>
                                <Badge variant="outline">{route.totalOrders} pedidos</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {new Date(route.fecha).toLocaleDateString("es-CO")}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Select
                              value={route.entregador}
                              onValueChange={(nuevoEntregador) => handleReasignarRuta(route.id, nuevoEntregador)}
                              disabled={reasignandoRuta === route.id}
                            >
                              <SelectTrigger className="w-[180px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {entregadores.map((e) => (
                                  <SelectItem key={e} value={e}>
                                    {e}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Button variant="outline" size="sm" onClick={() => handleOpenNuevoPedidoModal(route)}>
                              <Plus className="h-4 w-4 mr-1" />
                              Pedido
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleRouteExpansion(route.id)}
                            >
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 gap-3 mb-3">
                          <div className="bg-gray-50 p-2 rounded">
                            <p className="text-xs text-muted-foreground">Cargue</p>
                            <p className="font-semibold">{formatCOP(route.totalAmount)}</p>
                          </div>
                          <div className="bg-green-50 p-2 rounded">
                            <p className="text-xs text-green-700">Entregado</p>
                            <p className="font-semibold text-green-600">{formatCOP(routeTotals.entregado)}</p>
                          </div>
                          <div className="bg-yellow-50 p-2 rounded">
                            <p className="text-xs text-yellow-700">Fiado</p>
                            <p className="font-semibold text-yellow-600">{formatCOP(routeTotals.fiado)}</p>
                          </div>
                          <div className="bg-red-50 p-2 rounded">
                            <p className="text-xs text-red-700">Devoluciones</p>
                            <p className="font-semibold text-red-600">{formatCOP(routeTotals.devoluciones)}</p>
                          </div>
                          <div className="bg-blue-50 p-2 rounded">
                            <p className="text-xs text-blue-700">Repasos</p>
                            <p className="font-semibold text-blue-600">{formatCOP(routeTotals.repasos)}</p>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="space-y-3 border-t pt-3">
                            {route.orders?.map((order) => {
                              const orderId = `${route.id}-${order.id}`
                              const isOrderExpanded = expandedOrders.has(orderId)

                              let orderEffectiveTotal = 0
                              order.items?.forEach((item) => {
                                if (item.devuelto) return
                                const estadoProd = item.estadoProducto || "normal"
                                if (estadoProd === "agotado") return

                                if (item.subtotalAjustado !== null && item.subtotalAjustado !== undefined) {
                                  orderEffectiveTotal += Number(item.subtotalAjustado)
                                } else if (
                                  item.cantidadEntregada !== null &&
                                  item.cantidadEntregada !== undefined
                                ) {
                                  orderEffectiveTotal += Number(item.cantidadEntregada) * Number(item.valorUnidad)
                                } else {
                                  orderEffectiveTotal += Number(item.subtotal)
                                }
                              })

                              return (
                                <div key={order.id} className="border rounded-lg p-3 bg-white">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <p className="font-medium">{order.cliente}</p>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => {
                                            const newExpanded = new Set(expandedOrders)
                                            if (newExpanded.has(orderId)) {
                                              newExpanded.delete(orderId)
                                            } else {
                                              newExpanded.add(orderId)
                                            }
                                            setExpandedOrders(newExpanded)
                                          }}
                                        >
                                          {isOrderExpanded ? (
                                            <ChevronUp className="h-4 w-4" />
                                          ) : (
                                            <ChevronDown className="h-4 w-4" />
                                          )}
                                        </Button>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        Total Original: {formatCOP(order.total)} | Total Efectivo:{" "}
                                        {formatCOP(orderEffectiveTotal)}
                                      </p>
                                    </div>
                                    <Select
                                      value={order.estado}
                                      onValueChange={(newStatus) =>
                                        handleOrderStatusChange(order.id, newStatus as Order["estado"])
                                      }
                                    >
                                      <SelectTrigger className="w-[140px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="entregado">Entregado</SelectItem>
                                        <SelectItem value="fiado">Fiado</SelectItem>
                                        <SelectItem value="devolucion">Devolución</SelectItem>
                                        <SelectItem value="repaso">Repaso</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {isOrderExpanded && (
                                    <div className="space-y-2 mt-3 border-t pt-2">
                                      {order.items?.map((item) => {
                                        const cantidadFinal =
                                          item.cantidadEntregada !== null && item.cantidadEntregada !== undefined
                                            ? item.cantidadEntregada
                                            : item.cantidad

                                        const subtotalFinal =
                                          item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
                                            ? item.subtotalAjustado
                                            : item.cantidadEntregada !== null && item.cantidadEntregada !== undefined
                                              ? item.cantidadEntregada * item.valorUnidad
                                              : item.subtotal

                                        const estadoProd = item.estadoProducto || "normal"

                                        return (
                                          <div
                                            key={item.codigo}
                                            className={`grid grid-cols-12 gap-2 text-sm p-2 rounded ${
                                              item.devuelto
                                                ? "bg-red-50 line-through opacity-60"
                                                : estadoProd === "agotado"
                                                  ? "bg-gray-100 opacity-60"
                                                  : estadoProd === "parcial"
                                                    ? "bg-yellow-50"
                                                    : ""
                                            }`}
                                          >
                                            <div className="col-span-1 flex items-center">
                                              <Checkbox
                                                checked={item.devuelto}
                                                onCheckedChange={() =>
                                                  handleItemReturn(order.id, item.codigo, item.devuelto)
                                                }
                                              />
                                            </div>
                                            <div className="col-span-4">
                                              <p className="font-medium">{item.descripcion}</p>
                                              <p className="text-xs text-muted-foreground">
                                                Código: {item.codigo}
                                              </p>
                                            </div>
                                            <div className="col-span-2">
                                              <Label className="text-xs">Cantidad</Label>
                                              <Input
                                                type="number"
                                                min={0}
                                                max={item.cantidad}
                                                value={cantidadFinal}
                                                onChange={(e) =>
                                                  handleCantidadChange(
                                                    order.id,
                                                    item.codigo,
                                                    Number(e.target.value),
                                                    item.cantidad,
                                                  )
                                                }
                                                disabled={item.devuelto}
                                                className="h-8"
                                              />
                                              <p className="text-xs text-muted-foreground mt-0.5">
                                                de {item.cantidad}
                                              </p>
                                            </div>
                                            <div className="col-span-2">
                                              <Label className="text-xs">Precio Unit.</Label>
                                              <p className="font-medium">{formatCOP(item.valorUnidad)}</p>
                                            </div>
                                            <div className="col-span-3">
                                              <Label className="text-xs">Subtotal</Label>
                                              <Input
                                                type="number"
                                                min={0}
                                                value={subtotalFinal}
                                                onChange={(e) =>
                                                  handleSubtotalChange(
                                                    order.id,
                                                    item.codigo,
                                                    Number(e.target.value),
                                                  )
                                                }
                                                disabled={item.devuelto}
                                                className="h-8 font-medium"
                                              />
                                              {(item.subtotalAjustado !== null ||
                                                item.cantidadEntregada !== null) && (
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                  Orig: {formatCOP(item.subtotal)}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <div className="flex justify-end mt-3">
                          <Button onClick={() => handleOpenModal(route)}>Recibir Efectivo</Button>
                        </div>
                      </Card>
                    )
                  })
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <Dialog open={showModal} onOpenChange={handleCloseModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Recibir Efectivo - Ruta {selectedPlanilla?.ruta}</DialogTitle>
            <DialogDescription>
              Entregador: {selectedPlanilla?.entregador} | Fecha:{" "}
              {selectedPlanilla ? new Date(selectedPlanilla.fecha).toLocaleDateString("es-CO") : ""}
            </DialogDescription>
          </DialogHeader>

          {selectedPlanilla && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-sm">
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-xs text-muted-foreground">Cargue</p>
                  <p className="font-semibold">{formatCOP(selectedPlanilla.totalAmount)}</p>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <p className="text-xs text-green-700">Entregado</p>
                  <p className="font-semibold text-green-600">
                    {formatCOP(calculateRouteTotals(selectedPlanilla).entregado)}
                  </p>
                </div>
                <div className="bg-yellow-50 p-2 rounded">
                  <p className="text-xs text-yellow-700">Fiado</p>
                  <p className="font-semibold text-yellow-600">
                    {formatCOP(calculateRouteTotals(selectedPlanilla).fiado)}
                  </p>
                </div>
                <div className="bg-red-50 p-2 rounded">
                  <p className="text-xs text-red-700">Devoluciones</p>
                  <p className="font-semibold text-red-600">
                    {formatCOP(calculateRouteTotals(selectedPlanilla).devoluciones)}
                  </p>
                </div>
              </div>

              <div>
                <Label htmlFor="efectivo">Efectivo Recibido *</Label>
                <Input
                  id="efectivo"
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.efectivoRecibido}
                  onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="consignacion"
                  checked={formData.tieneConsignacion}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, tieneConsignacion: checked as boolean })
                  }
                />
                <Label htmlFor="consignacion">Tiene consignación</Label>
              </div>

              {formData.tieneConsignacion && (
                <div className="space-y-3 border-l-4 border-blue-500 pl-4">
                  <div>
                    <Label htmlFor="numeroConsignacion">Número de Consignación *</Label>
                    <Input
                      id="numeroConsignacion"
                      value={formData.numeroConsignacion}
                      onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                      onBlur={handleConsignacionBlur}
                      placeholder="Ej: 123456789"
                      disabled={validatingConsignacion}
                    />
                  </div>
                  <div>
                    <Label htmlFor="banco">Banco *</Label>
                    <Select value={formData.banco} onValueChange={(value) => setFormData({ ...formData, banco: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un banco" />
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
                  <div>
                    <Label htmlFor="montoConsignacion">Monto Consignación *</Label>
                    <Input
                      id="montoConsignacion"
                      type="number"
                      min={0}
                      step={1000}
                      value={formData.montoConsignacion}
                      onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="observaciones">Observaciones</Label>
                <Textarea
                  id="observaciones"
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  placeholder="Notas adicionales (opcional)"
                  rows={2}
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Total Recibido:</span>
                  <span className="text-lg font-bold text-blue-600">{formatCOP(totalRecibido)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Diferencia:</span>
                  <span
                    className={`text-lg font-bold ${diferencia === 0 ? "text-green-600" : diferencia > 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {diferencia > 0 ? "+" : ""}
                    {formatCOP(diferencia)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseModal} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Registrando..." : "Registrar Recepción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAgrupadoModal} onOpenChange={() => setShowAgrupadoModal(false)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cuadre Agrupado - {agrupadoData?.entregador}</DialogTitle>
            <DialogDescription>
              Agrupando {agrupadoData?.totalRutas} rutas: {agrupadoData?.nombresRutas?.join(", ")}
            </DialogDescription>
          </DialogHeader>

          {agrupadoData && (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2 text-sm">
                <div className="bg-gray-50 p-2 rounded">
                  <p className="text-xs text-muted-foreground">Cargue Total</p>
                  <p className="font-semibold">{formatCOP(agrupadoData.totales.cargue)}</p>
                </div>
                <div className="bg-green-50 p-2 rounded">
                  <p className="text-xs text-green-700">Entregado</p>
                  <p className="font-semibold text-green-600">{formatCOP(agrupadoData.totales.entregado)}</p>
                </div>
                <div className="bg-yellow-50 p-2 rounded">
                  <p className="text-xs text-yellow-700">Fiado</p>
                  <p className="font-semibold text-yellow-600">{formatCOP(agrupadoData.totales.fiado)}</p>
                </div>
                <div className="bg-red-50 p-2 rounded">
                  <p className="text-xs text-red-700">Devoluciones</p>
                  <p className="font-semibold text-red-600">{formatCOP(agrupadoData.totales.devoluciones)}</p>
                </div>
                <div className="bg-blue-50 p-2 rounded">
                  <p className="text-xs text-blue-700">Repasos</p>
                  <p className="font-semibold text-blue-600">{formatCOP(agrupadoData.totales.repasos)}</p>
                </div>
              </div>

              <div>
                <Label htmlFor="efectivoAgrupado">Efectivo Recibido *</Label>
                <Input
                  id="efectivoAgrupado"
                  type="number"
                  min={0}
                  step={1000}
                  value={formData.efectivoRecibido}
                  onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="consignacionAgrupado"
                  checked={formData.tieneConsignacion}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, tieneConsignacion: checked as boolean })
                  }
                />
                <Label htmlFor="consignacionAgrupado">Tiene consignación</Label>
              </div>

              {formData.tieneConsignacion && (
                <div className="space-y-3 border-l-4 border-blue-500 pl-4">
                  <div>
                    <Label htmlFor="numeroConsignacionAgrupado">Número de Consignación *</Label>
                    <Input
                      id="numeroConsignacionAgrupado"
                      value={formData.numeroConsignacion}
                      onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                      onBlur={handleConsignacionBlur}
                      placeholder="Ej: 123456789"
                      disabled={validatingConsignacion}
                    />
                  </div>
                  <div>
                    <Label htmlFor="bancoAgrupado">Banco *</Label>
                    <Select value={formData.banco} onValueChange={(value) => setFormData({ ...formData, banco: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un banco" />
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
                  <div>
                    <Label htmlFor="montoConsignacionAgrupado">Monto Consignación *</Label>
                    <Input
                      id="montoConsignacionAgrupado"
                      type="number"
                      min={0}
                      step={1000}
                      value={formData.montoConsignacion}
                      onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="observacionesAgrupado">Observaciones</Label>
                <Textarea
                  id="observacionesAgrupado"
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  placeholder="Notas adicionales (opcional)"
                  rows={2}
                />
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">Total Recibido:</span>
                  <span className="text-lg font-bold text-blue-600">
                    {formatCOP(
                      Number(formData.efectivoRecibido || 0) +
                        (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0),
                    )}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Diferencia:</span>
                  <span
                    className={`text-lg font-bold ${
                      Math.round(
                        (Number(formData.efectivoRecibido || 0) +
                          (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0) -
                          agrupadoData.totales.entregado) *
                          100,
                      ) /
                        100 ===
                      0
                        ? "text-green-600"
                        : Math.round(
                              (Number(formData.efectivoRecibido || 0) +
                                (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0) -
                                agrupadoData.totales.entregado) *
                                100,
                            ) /
                              100 >
                            0
                          ? "text-green-600"
                          : "text-red-600"
                    }`}
                  >
                    {Math.round(
                      (Number(formData.efectivoRecibido || 0) +
                        (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0) -
                        agrupadoData.totales.entregado) *
                        100,
                    ) /
                      100 >
                    0
                      ? "+"
                      : ""}
                    {formatCOP(
                      Math.round(
                        (Number(formData.efectivoRecibido || 0) +
                          (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0) -
                          agrupadoData.totales.entregado) *
                          100,
                      ) / 100,
                    )}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAgrupadoModal(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitAgrupado} disabled={submitting}>
              {submitting ? "Registrando..." : "Registrar Cuadre Agrupado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNuevoPedidoModal} onOpenChange={handleCloseNuevoPedidoModal}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Pedido - Ruta {rutaParaNuevoPedido?.ruta}</DialogTitle>
            <DialogDescription>
              Agregar un nuevo pedido a la ruta de {rutaParaNuevoPedido?.entregador}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="clienteNuevo">Cliente *</Label>
              <Input
                id="clienteNuevo"
                value={nuevoPedidoData.cliente}
                onChange={(e) => setNuevoPedidoData({ ...nuevoPedidoData, cliente: e.target.value })}
                placeholder="Nombre del cliente"
              />
            </div>

            <div>
              <Label htmlFor="observacionesNuevo">Observaciones</Label>
              <Textarea
                id="observacionesNuevo"
                value={nuevoPedidoData.observaciones}
                onChange={(e) => setNuevoPedidoData({ ...nuevoPedidoData, observaciones: e.target.value })}
                placeholder="Observaciones del pedido (opcional)"
                rows={2}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Productos</Label>
                <Button type="button" variant="outline" size="sm" onClick={agregarProducto}>
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar Producto
                </Button>
              </div>

              <div className="space-y-3">
                {productosNuevoPedido.map((producto, index) => (
                  <div key={index} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Producto {index + 1}</span>
                      {productosNuevoPedido.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => eliminarProducto(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Código *</Label>
                        <Input
                          value={producto.codigo}
                          onChange={(e) => actualizarProducto(index, "codigo", e.target.value)}
                          placeholder="Código"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Descripción *</Label>
                        <Input
                          value={producto.descripcion}
                          onChange={(e) => actualizarProducto(index, "descripcion", e.target.value)}
                          placeholder="Nombre del producto"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">Cantidad *</Label>
                        <Input
                          type="number"
                          min={1}
                          value={producto.cantidad}
                          onChange={(e) => actualizarProducto(index, "cantidad", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Precio Unitario *</Label>
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          value={producto.precioUnitario}
                          onChange={(e) => actualizarProducto(index, "precioUnitario", e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Subtotal</Label>
                        <Input type="text" value={formatCOP(producto.subtotal)} disabled className="bg-gray-50" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total del Pedido:</span>
                <span className="text-lg font-bold text-blue-600">{formatCOP(calcularTotalNuevoPedido())}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseNuevoPedidoModal} disabled={submittingNuevoPedido}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitNuevoPedido} disabled={submittingNuevoPedido}>
              {submittingNuevoPedido ? "Creando..." : "Crear Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
