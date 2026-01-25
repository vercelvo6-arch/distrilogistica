"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DollarSign, LogOut, Filter, Wallet, History, Calendar, ChevronDown, ChevronUp, Plus, X, Trash2 } from "lucide-react"
import type { RouteSheet, User, RecepcionCaja, Order } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import {
  updatePedidoEstado,
  updateProductoDevuelto,
  updateCantidadEntregada,
  updateSubtotalAjustado,
  updateDescuentoPedido,
  updateMotivoDescuentoPedido,
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
  id: string  
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
  const [filterFechaDesde, setFilterFechaDesde] = useState<string>(new Date().toISOString().split("T")[0])
  const [filterFechaHasta, setFilterFechaHasta] = useState<string>(new Date().toISOString().split("T")[0])
  const [selectedView, setSelectedView] = useState<"caja" | "historial" | "comisiones">("caja")
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [recepciones, setRecepciones] = useState<RecepcionCaja[]>([])
  const [loading, setLoading] = useState(true)

  const [showModal, setShowModal] = useState(false)
  const [selectedPlanilla, setSelectedPlanilla] = useState<RouteSheet | null>(null)
  const [showFiadoModal, setShowFiadoModal] = useState(false)
  const [selectedOrderForFiado, setSelectedOrderForFiado] = useState<Order | null>(null)
  const [montoPagadoFiado, setMontoPagadoFiado] = useState("")
const [formData, setFormData] = useState({
    efectivoRecibido: "",
    tieneConsignacion: false,
    numeroConsignacion: "",
    banco: "",
    montoConsignacion: "",
    fechaConsignacion: new Date().toISOString().split("T")[0],
    observaciones: "",
    descuento: "",
    motivoDescuento: "",
    // Campos para cuadre de caja por novedades
    devolucionesParciales: "",
    devolucionesCompletas: "",
    repasos: "",
    fiados: "",
    agotados: "",
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
  { id: crypto.randomUUID(), codigo: "", descripcion: "", cantidad: 1, precioUnitario: 0, subtotal: 0 },
])
  const [submittingNuevoPedido, setSubmittingNuevoPedido] = useState(false)

  const [reasignandoRuta, setReasignandoRuta] = useState<number | null>(null)

  // Estado para eliminar pedidos
  const [showEliminarPedidoModal, setShowEliminarPedidoModal] = useState(false)
  const [pedidoAEliminar, setPedidoAEliminar] = useState<{ orderId: string; cliente: string; total: number; planillaId: number } | null>(null)
  const [eliminandoPedido, setEliminandoPedido] = useState(false)

  // Estado para eliminar rutas completas
  const [showEliminarRutaModal, setShowEliminarRutaModal] = useState(false)
  const [rutaAEliminar, setRutaAEliminar] = useState<{ id: number; nombre: string; entregador: string; fecha: string; totalPedidos: number; totalCargue: number } | null>(null)
  const [eliminandoRuta, setEliminandoRuta] = useState(false)

  // Estado para cambiar fecha de ruta
  const [showCambiarFechaModal, setShowCambiarFechaModal] = useState(false)
  const [rutaParaCambiarFecha, setRutaParaCambiarFecha] = useState<{ id: number; nombre: string; fechaActual: string } | null>(null)
  const [nuevaFechaRuta, setNuevaFechaRuta] = useState("")
  const [cambiandoFecha, setCambiandoFecha] = useState(false)

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

    const responseAgrupados = await fetch("/api/cuadres-caja")  // ✅ CAMBIO AQUÍ
    const dataAgrupados = await responseAgrupados.json()

    const recepcionesIndividuales = Array.isArray(dataIndividuales.recepciones)
      ? dataIndividuales.recepciones.map((r: any) => ({ ...r, tipo: "individual" }))
      : []

    const cuadresAgrupados = Array.isArray(dataAgrupados.cuadres)
      ? dataAgrupados.cuadres.map((c: any) => {
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
    (s) => (s.estado === 'alistado' || s.estado === 'completado') && !s.cuadradoEnCaja
  )

  const entregadores = Array.from(new Set(completedRoutes.map((r) => r.entregador).filter(Boolean))) as string[]
  const rutas = Array.from(new Set(completedRoutes.map((r) => r.ruta)))

  const filteredRoutes = completedRoutes.filter((route) => {
  if (filterEntregador !== "all" && route.entregador !== filterEntregador) return false
  if (filterRuta !== "all" && route.ruta !== filterRuta) return false
  if (filterFechaDesde || filterFechaHasta) {
    const routeDate = new Date(route.fecha).toISOString().split("T")[0]
    if (filterFechaDesde && routeDate < filterFechaDesde) return false
    if (filterFechaHasta && routeDate > filterFechaHasta) return false
  }
  return true
})

  const calculateRouteTotals = (route: RouteSheet | null) => {
  if (!route || !Array.isArray(route.orders)) {
    return {
      entregado: 0,
      fiado: 0,
      devoluciones: 0,
      repasos: 0,
      agotados: 0,
      erroresFacturacion: 0,  // ← NUEVO
    }
  }

  let entregado = 0
  let fiado = 0
  let devoluciones = 0
  let repasos = 0
  let agotados = 0
  let erroresFacturacion = 0  // ← NUEVO

  route.orders.forEach((order) => {
    if (!order || !Array.isArray(order.items)) return

    let effectiveTotal = 0
    let returnedTotal = 0
    let agotadosEnPedido = 0
    let erroresEnPedido = 0  // ← NUEVO

    order.items.forEach((item) => {
      if (!item) return

      const cantOriginal = Number(item.cantidad) || 0
      const precioUnit = Number(item.valorUnidad) || 0
      const subtotalOriginal = cantOriginal * precioUnit

      // ⚠️ ERROR DE FACTURACIÓN (NO afecta comisión)
      if (item.motivoAjuste === 'error_facturacion') {
        erroresEnPedido += subtotalOriginal
        return
      }

      // ❌ PRODUCTO DEVUELTO (afecta comisión)
      if (item.motivoAjuste === 'devuelto') {
        returnedTotal += subtotalOriginal
        return
      }

      // 🚫 AGOTADO
      const cantEntregada =
        item.cantidadEntregada !== null && item.cantidadEntregada !== undefined
          ? Number(item.cantidadEntregada)
          : cantOriginal

      if (cantEntregada === 0 || item.estadoProducto === "agotado") {
        agotadosEnPedido += subtotalOriginal
        return
      }

      // ✅ PRODUCTO ENTREGADO NORMALMENTE
      const subtotalReal =
        item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
          ? Number(item.subtotalAjustado)
          : cantEntregada * precioUnit

      effectiveTotal += subtotalReal
    })

    agotados += agotadosEnPedido
    devoluciones += returnedTotal
    erroresFacturacion += erroresEnPedido  // ← NUEVO

    // Sumar según el estado del pedido COMPLETO
    if (order.estado === "fiado") {
      fiado += effectiveTotal
      if (order.descuento) {
        fiado -= Number(order.descuento)
      }
    } else if (order.estado === "repaso") {
      repasos += effectiveTotal
    } else if (order.estado === "devolucion") {
      devoluciones += effectiveTotal
    } else {
      // TODO LO DEMÁS = ENTREGADO
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
    erroresFacturacion: Math.round(erroresFacturacion * 100) / 100,  // ← NUEVO
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

  const [reasignandoPedido, setReasignandoPedido] = useState<string | null>(null)

  const handleReasignarPedido = async (pedidoId: string, nuevaPlanillaId: string) => {
    try {
      setReasignandoPedido(pedidoId)

      const response = await fetch("/api/pedidos/reasignar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId,
          nuevaPlanillaId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al reasignar pedido")
      }

      toast({
        title: "Pedido Reasignado",
        description: `${data.pedido.cliente} movido a ruta ${data.pedido.rutaNueva}`,
      })

      await loadData()
    } catch (error) {
      console.error("Error al reasignar pedido:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al reasignar pedido",
        variant: "destructive",
      })
} finally {
      setReasignandoPedido(null)
    }
  }

  // Función para abrir modal de confirmación de eliminar pedido
  const handleOpenEliminarPedidoModal = (orderId: string, cliente: string, total: number, planillaId: number) => {
    setPedidoAEliminar({ orderId, cliente, total, planillaId })
    setShowEliminarPedidoModal(true)
  }

  // Función para eliminar pedido
  const handleEliminarPedido = async () => {
    if (!pedidoAEliminar) return

    try {
      setEliminandoPedido(true)

      const response = await fetch("/api/pedidos/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId: pedidoAEliminar.orderId,
          planillaId: pedidoAEliminar.planillaId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al eliminar pedido")
      }

      toast({
        title: "Pedido Eliminado",
        description: `El pedido de ${pedidoAEliminar.cliente} ha sido eliminado y el cargue actualizado`,
      })

      // Cerrar modal y limpiar estado
      setShowEliminarPedidoModal(false)
      setPedidoAEliminar(null)

      // Recargar datos para reflejar cambios
      await loadData()
    } catch (error) {
      console.error("Error al eliminar pedido:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al eliminar pedido",
        variant: "destructive",
      })
    } finally {
      setEliminandoPedido(false)
    }
  }

  // Función para abrir modal de eliminar ruta completa
  const handleOpenEliminarRutaModal = (route: RouteSheet) => {
    setRutaAEliminar({
      id: route.id,
      nombre: route.ruta,
      entregador: route.entregador || "Sin asignar",
      fecha: route.fecha,
      totalPedidos: route.totalOrders,
      totalCargue: route.montoCargue,
    })
    setShowEliminarRutaModal(true)
  }

  // Función para eliminar ruta completa
  const handleEliminarRuta = async () => {
    if (!rutaAEliminar) return

    try {
      setEliminandoRuta(true)

      const response = await fetch("/api/planillas/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaId: rutaAEliminar.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al eliminar ruta")
      }

      toast({
        title: "Ruta Eliminada",
        description: `La ruta ${rutaAEliminar.nombre} de ${rutaAEliminar.entregador} ha sido eliminada`,
      })

      setShowEliminarRutaModal(false)
      setRutaAEliminar(null)
      await loadData()
    } catch (error) {
      console.error("Error al eliminar ruta:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al eliminar ruta",
        variant: "destructive",
      })
    } finally {
      setEliminandoRuta(false)
    }
  }

  // Función para abrir modal de cambiar fecha
  const handleOpenCambiarFechaModal = (route: RouteSheet) => {
    setRutaParaCambiarFecha({
      id: route.id,
      nombre: route.ruta,
      fechaActual: route.fecha,
    })
    setNuevaFechaRuta(route.fecha)
    setShowCambiarFechaModal(true)
  }

  // Función para cambiar fecha de ruta
  const handleCambiarFechaRuta = async () => {
    if (!rutaParaCambiarFecha || !nuevaFechaRuta) return

    try {
      setCambiandoFecha(true)

      const response = await fetch("/api/planillas/cambiar-fecha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaId: rutaParaCambiarFecha.id,
          nuevaFecha: nuevaFechaRuta,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al cambiar fecha")
      }

      toast({
        title: "Fecha Actualizada",
        description: `La ruta ${rutaParaCambiarFecha.nombre} ahora tiene fecha ${nuevaFechaRuta}`,
      })

      setShowCambiarFechaModal(false)
      setRutaParaCambiarFecha(null)
      setNuevaFechaRuta("")
      await loadData()
    } catch (error) {
      console.error("Error al cambiar fecha:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al cambiar fecha",
        variant: "destructive",
      })
    } finally {
      setCambiandoFecha(false)
    }
  }

  const handleItemReturn = async (orderId: string, codigo: string, currentDevuelto: boolean) => {
  try {
    // Actualizar estado local primero (lo que ve el usuario)
    setRouteSheets(prevSheets => 
      prevSheets.map(sheet => ({
        ...sheet,
        orders: sheet.orders.map(order => {
          if (order.id !== orderId) return order
          
          return {
            ...order,
            items: order.items.map(item => 
              item.codigo === codigo 
                ? { ...item, devuelto: !currentDevuelto }
                : item
            )
          }
        })
      }))
    )

    // Guardar en el servidor
    await updateProductoDevuelto(orderId, codigo, !currentDevuelto)

    toast({
      title: currentDevuelto ? "Producto activado" : "Producto devuelto",
      description: `El producto ha sido marcado como ${!currentDevuelto ? "devuelto" : "activo"}`,
    })
  } catch (err) {
    console.error("[CAJA] Error updating product return:", err)
    await loadData()
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
    console.error("[CAJA] Error updating quantity:", err)
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
    console.error("[CAJA] Error updating subtotal:", err)
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
    // Actualizar estado local (optimista)
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

    // Guardar en el servidor
    await updateDescuentoPedido(orderId, descuento)

    toast({
      title: "Descuento aplicado",
      description: `Descuento de ${formatCOP(descuento)} registrado`,
    })
  } catch (err) {
    console.error("[CAJA] Error updating descuento:", err)
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
    // Actualizar estado local (optimista)
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

    // Guardar en el servidor
    await updateMotivoDescuentoPedido(orderId, motivo)
  } catch (err) {
    console.error("[CAJA] Error updating motivo descuento:", err)
    await loadData()
  }
}
  
  const handleOrderStatusChange = async (orderId: string, newStatus: Order["estado"]) => {
  // Obtener el pedido
  const order = routeSheets
    .flatMap(sheet => sheet.orders)
    .find(o => o.id === orderId)

  // SI ES UN COBRO y se marca como "entregado", actualizar el fiado original
  if (order?.esCobro && newStatus === "entregado") {
    try {
      const response = await fetch("/api/fiados/marcar-cobro-completado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cobroId: orderId }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al marcar cobro completado")
      }

      toast({
        title: "Cobro Registrado",
        description: `Fiado actualizado. Nuevo saldo: ${formatCOP(data.fiado.saldo_pendiente)}`,
      })

      // Actualizar estado local
      setRouteSheets(prevSheets => 
        prevSheets.map(sheet => ({
          ...sheet,
          orders: sheet.orders.map(o => 
            o.id === orderId 
              ? { ...o, estado: newStatus }
              : o
          )
        }))
      )

      return
    } catch (err) {
      console.error("[CAJA] Error al marcar cobro completado:", err)
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Error al marcar cobro",
        variant: "destructive",
      })
      return
    }
  }

  // Si es "fiado", abrir modal para registrar pago parcial
  if (newStatus === "fiado") {
    if (order) {
      setSelectedOrderForFiado(order)
      setMontoPagadoFiado("")
      setShowFiadoModal(true)
    }
    return
  }

  // Para otros estados (entregado, repaso, devolución), funciona normal
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
    console.error("[CAJA] Error updating order status:", err)
    await loadData()
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
    setProductosNuevoPedido([
    { id: crypto.randomUUID(), codigo: "", descripcion: "", cantidad: 1, precioUnitario: 0, subtotal: 0 }
  ])
  setShowNuevoPedidoModal(true)
}

  const handleCloseNuevoPedidoModal = () => {
    setShowNuevoPedidoModal(false)
    setRutaParaNuevoPedido(null)
    setNuevoPedidoData({ cliente: "", observaciones: "" })
    setProductosNuevoPedido([
    { id: crypto.randomUUID(), codigo: "", descripcion: "", cantidad: 1, precioUnitario: 0, subtotal: 0 }
  ])
}
  const agregarProducto = () => {
  setProductosNuevoPedido([
    ...productosNuevoPedido,
    { id: crypto.randomUUID(), codigo: "", descripcion: "", cantidad: 1, precioUnitario: 0, subtotal: 0 },
  ])
}

  const actualizarProducto = (productoId: string, field: keyof Omit<NuevoProducto, 'id'>, value: any) => {
  setProductosNuevoPedido(prevProductos => 
    prevProductos.map(producto => {
      // Solo actualizar el producto correcto
      if (producto.id !== productoId) return producto
      
      // Crear un NUEVO objeto completamente independiente
      let nuevoProducto = {
        ...producto,
        [field]: value
      }
      
      // Recalcular subtotal si cambió cantidad o precio
      if (field === "cantidad" || field === "precioUnitario") {
        const cantidad = field === "cantidad" ? Number(value) : nuevoProducto.cantidad
        const precio = field === "precioUnitario" ? Number(value) : nuevoProducto.precioUnitario
        nuevoProducto.subtotal = Math.round(cantidad * precio * 100) / 100
      }
      
      return nuevoProducto
    })
  )
}

const eliminarProducto = (productoId: string) => {
  if (productosNuevoPedido.length > 1) {
    setProductosNuevoPedido(productosNuevoPedido.filter(p => p.id !== productoId))
  }
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
      efectivoRecibido: "",
      tieneConsignacion: false,
      numeroConsignacion: "",
      banco: "",
      montoConsignacion: "",
      fechaConsignacion: new Date().toISOString().split("T")[0],
      observaciones: "",
      descuento: "",
      motivoDescuento: "",
      devolucionesParciales: totals.devoluciones.toString(),
      devolucionesCompletas: "0",
      repasos: totals.repasos.toString(),
      fiados: totals.fiado.toString(),
      agotados: totals.agotados.toString(),
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
      descuento: "",              
      motivoDescuento: "",
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

    let totalCargueAgrupado = 0
    let totalEntregadoAgrupado = 0
    let totalFiadoAgrupado = 0
    let totalDevolucionesAgrupado = 0
    let totalRepasosAgrupado = 0
    let totalAgotadosAgrupado = 0
    let totalDescuentosAgrupado = 0

    rutasSeleccionadas.forEach((route) => {
      if (!route) return

      totalCargueAgrupado += route.totalAmount

      // USAR LA MISMA FUNCIÓN (ya corregida)
      const totals = calculateRouteTotals(route)
      totalEntregadoAgrupado += totals.entregado
      totalFiadoAgrupado += totals.fiado
      totalDevolucionesAgrupado += totals.devoluciones
      totalRepasosAgrupado += totals.repasos
      totalAgotadosAgrupado += totals.agotados

      // Sumar descuentos de cada pedido (igual que la vista principal)
      if (Array.isArray(route.orders)) {
        route.orders.forEach((order) => {
          if (order.descuento) {
            totalDescuentosAgrupado += Number(order.descuento)
          }
        })
      }
    })
    const nombresRutas = rutasSeleccionadas.map((r) => r.ruta)

    const agrupado = {
      entregador: rutasSeleccionadas[0].entregador,
      planillas: rutasSeleccionadas,
      planillaIds: selectedRoutes,
      totalRutas: rutasSeleccionadas.length,
      nombresRutas,
      totales: {
        cargue: totalCargueAgrupado,
        entregado: totalEntregadoAgrupado,
        fiado: totalFiadoAgrupado,
        devoluciones: totalDevolucionesAgrupado,
        repasos: totalRepasosAgrupado,
        agotados: totalAgotadosAgrupado,
        descuentos: totalDescuentosAgrupado,
      },
    }

    setAgrupadoData(agrupado)
    setFormData({
      efectivoRecibido: totalEntregadoAgrupado.toString(),
      tieneConsignacion: false,
      numeroConsignacion: "",
      banco: "",
      montoConsignacion: "",
      fechaConsignacion: new Date().toISOString().split("T")[0],
      observaciones: "",
      descuento: "",
      motivoDescuento: "",
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

      const cargue = agrupadoData.totales.cargue || 0
      const novedades = (agrupadoData.totales.fiado || 0) + (agrupadoData.totales.devoluciones || 0) + (agrupadoData.totales.repasos || 0) + (agrupadoData.totales.agotados || 0) + (agrupadoData.totales.descuentos || 0)
      const totalEsperadoCalculado = cargue - novedades

      const payload = {
        planillaIds: agrupadoData.planillaIds,
        entregador: agrupadoData.entregador,
        totalEsperado: totalEsperadoCalculado,
        efectivoRecibido: Number(formData.efectivoRecibido),
        tieneConsignacion: formData.tieneConsignacion,
        numeroConsignacion: formData.tieneConsignacion ? formData.numeroConsignacion : null,
        banco: formData.tieneConsignacion ? formData.banco : null,
        montoConsignacion: formData.tieneConsignacion ? Number(formData.montoConsignacion) : null,
        observaciones: formData.observaciones || null,
        descuento: agrupadoData.totales.descuentos || 0,
        agotados: agrupadoData.totales.agotados || 0,
      }

      console.log('[CUADRE AGRUPADO] Enviando payload:', JSON.stringify(payload, null, 2))

      const response = await fetch("/api/cuadres-caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      console.log('[CUADRE AGRUPADO] Respuesta recibida:', data)

      if (!response.ok) {
        console.error('[CUADRE AGRUPADO] Error response:', data)
        throw new Error(data.error || data.details || "Error al registrar cuadre agrupado")
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
      console.error("[CUADRE AGRUPADO] Error completo:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al registrar cuadre",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }
const handleSubmitFiado = async () => {
  if (!selectedOrderForFiado) return

  const montoPagado = Number(montoPagadoFiado)
  const totalPedido = selectedOrderForFiado.total

  // Validar que el monto pagado sea válido
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

    // Actualizar estado local (optimista)
    setRouteSheets(prevSheets => 
      prevSheets.map(sheet => ({
        ...sheet,
        orders: sheet.orders.map(order => 
          order.id === selectedOrderForFiado.id 
            ? { 
                ...order, 
                estado: "fiado",
                montoPagado: montoPagado,
                saldoPendiente: saldoPendiente
              }
            : order
        )
      }))
    )

    // Guardar en el servidor
    await updatePedidoEstado(selectedOrderForFiado.id, "fiado", montoPagado, saldoPendiente)

    toast({
      title: "Fiado Registrado",
      description: `Pagó: ${formatCOP(montoPagado)} | Debe: ${formatCOP(saldoPendiente)}`,
    })

    // Cerrar modal
    setShowFiadoModal(false)
    setSelectedOrderForFiado(null)
    setMontoPagadoFiado("")
  } catch (err) {
    console.error("[CAJA] Error al registrar fiado:", err)
    await loadData()
    toast({
      title: "Error",
      description: "No se pudo registrar el fiado",
      variant: "destructive",
    })
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
      
      // Calcular totalEsperado = cargue - novedades (fiado + devoluciones + repasos + agotados + descuentos)
      const cargue = selectedPlanilla.montoCargue || 0
      const novedades = totals.fiado + totals.devoluciones + totals.repasos + totals.agotados + Number(formData.descuento || 0)
      const totalEsperadoCalculado = cargue - novedades

      const response = await fetch("/api/caja/recibir-efectivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaId: selectedPlanilla.id,
          efectivoEsperado: totalEsperadoCalculado,
          efectivoRecibido: Number(formData.efectivoRecibido),
          tieneConsignacion: formData.tieneConsignacion,
          numeroConsignacion: formData.tieneConsignacion ? formData.numeroConsignacion : null,
          banco: formData.tieneConsignacion ? formData.banco : null,
          montoConsignacion: formData.tieneConsignacion ? Number(formData.montoConsignacion) : null,
          fechaConsignacion: formData.tieneConsignacion ? formData.fechaConsignacion : null,
          observaciones: formData.observaciones || null,
          descuento: Number(formData.descuento || 0),             
          motivoDescuento: formData.motivoDescuento || null,
          agotados: totals.agotados || 0,
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
  let totalDescuentos = 0
  let totalAgotados = 0 

  filteredRoutes.forEach((route) => {
    const totals = calculateRouteTotals(route)
    totalEntregado += totals.entregado
    totalFiado += totals.fiado
    totalDevoluciones += totals.devoluciones
    totalRepasos += totals.repasos
    totalAgotados += totals.agotados
  })
  
 // Calcular descuentos de todos los pedidos de las rutas filtradas
filteredRoutes.forEach((route) => {
  if (Array.isArray(route.orders)) {
    route.orders.forEach((order) => {
      if (order.descuento) {
        totalDescuentos += Number(order.descuento)
      }
    })
  }
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
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold">
                              {rec.entregador} - {rec.tipo_ruta}
                            </p>
                            {rec.tipo === "agrupado" && (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-300">AGRUPADO</Badge>
                            )}
                          </div>
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
                              <p className="font-semibold">
                                {formatCOP(Number(rec.total_consignado || rec.monto_consignacion || 0))}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

            {rec.descuento && Number(rec.descuento) > 0 && (
              <div className="mt-3 pt-3 border-t bg-orange-50 -m-4 p-4 rounded-b-lg">
                <p className="text-sm font-medium mb-2">Descuento Aplicado</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Monto</p>
                    <p className="font-semibold text-orange-600">{formatCOP(Number(rec.descuento))}</p>
                  </div>
                  {rec.motivo_descuento && (
                    <div>
                      <p className="text-muted-foreground">Motivo</p>
                      <p className="text-sm">{rec.motivo_descuento}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

                      {rec.observaciones && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm text-muted-foreground">Observaciones:</p>
                          <p className="text-sm">{rec.observaciones}</p>
                        </div>
                      )}

                      {rec.tipo === "agrupado" && rec.planillas_ids && (
                        <div className="mt-3 pt-3 border-t bg-purple-50 -m-4 p-4 rounded-b-lg">
                          <p className="text-sm font-medium mb-2">Rutas Incluidas:</p>
                          <p className="text-xs text-muted-foreground">{rec.planillas_ids.join(", ")}</p>
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
                value={filterFechaDesde}
                onChange={(e) => setFilterFechaDesde(e.target.value)}
                className="w-[140px]"
                placeholder="Desde"
              />
              <span className="text-sm text-muted-foreground">-</span>
              <Input
                type="date"
                value={filterFechaHasta}
                onChange={(e) => setFilterFechaHasta(e.target.value)}
                className="w-[140px]"
                placeholder="Hasta"
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

              <div className="grid grid-cols-7 gap-4">
                <Card className="p-4 hover:shadow-md transition-shadow">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Total Cargue</p>
                  <p className="text-xl font-bold tracking-tight">{formatCOP(totalCargue)}</p>
                </Card>

                <Card className="p-4 bg-green-50 border-green-200 hover:shadow-md transition-shadow">
                  <p className="text-xs font-medium text-green-700 mb-2">Entregado</p>
                  <p className="text-xl font-bold text-green-700 tracking-tight">{formatCOP(totalEntregado)}</p>
                </Card>

                <Card className="p-4 bg-yellow-50 border-yellow-200 hover:shadow-md transition-shadow">
                  <p className="text-xs font-medium text-yellow-700 mb-2">{"Fiado (CxC)"}</p>
                  <p className="text-xl font-bold text-yellow-700 tracking-tight">{formatCOP(totalFiado)}</p>
                </Card>

                <Card className="p-4 bg-red-50 border-red-200 hover:shadow-md transition-shadow">
                  <p className="text-xs font-medium text-red-700 mb-2">Devoluciones</p>
                  <p className="text-xl font-bold text-red-700 tracking-tight">{formatCOP(totalDevoluciones)}</p>
                </Card>

                <Card className="p-4 bg-blue-50 border-blue-200 hover:shadow-md transition-shadow">
                  <p className="text-xs font-medium text-blue-700 mb-2">Repasos</p>
                  <p className="text-xl font-bold text-blue-700 tracking-tight">{formatCOP(totalRepasos)}</p>
                </Card>

                <Card className="p-4 bg-gray-50 border-gray-200 hover:shadow-md transition-shadow">
                  <p className="text-xs font-medium text-gray-700 mb-2">Agotados</p>
                  <p className="text-xl font-bold text-gray-700 tracking-tight">{formatCOP(totalAgotados)}</p>
                </Card>

                <Card className="p-4 bg-purple-50 border-purple-200 hover:shadow-md transition-shadow">
                  <p className="text-xs font-medium text-purple-700 mb-2">Descuentos</p>
                  <p className="text-xl font-bold text-purple-700 tracking-tight">{formatCOP(totalDescuentos)}</p>
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
                    No hay entregas pendientes de cuadrar para la fecha seleccionada
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

                              <div className="mb-3 p-3 bg-white rounded-lg border">
                                <Label className="text-xs text-muted-foreground mb-2 block">Reasignar a:</Label>
                                <Select
                                  disabled={reasignandoRuta === route.id}
                                  onValueChange={(value) => handleReasignarRuta(route.id, value)}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue
                                      placeholder={
                                        reasignandoRuta === route.id ? "Reasignando..." : "Seleccionar entregador"
                                      }
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {entregadores
                                      .filter((e) => e !== route.entregador)
                                      .map((entregador) => (
                                        <SelectItem key={entregador} value={entregador}>
                                          {entregador}
                                        </SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="flex gap-2">
                                <Button onClick={() => toggleRouteExpansion(route.id)} variant="outline" size="sm">
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
                                <Button
                                  onClick={() => handleOpenNuevoPedidoModal(route)}
                                  variant="outline"
                                  size="sm"
                                  className="border-green-300 text-green-700 hover:bg-green-50"
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Nuevo Pedido
                                </Button>
                                <Button onClick={() => handleOpenModal(route)} size="sm">
                                  <DollarSign className="h-4 w-4 mr-2" />
                                  Recibir Efectivo
                                </Button>
                                <Button
                                  onClick={() => handleOpenCambiarFechaModal(route)}
                                  variant="outline"
                                  size="sm"
                                  className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                >
                                  <Calendar className="h-4 w-4 mr-2" />
                                  Cambiar Fecha
                                </Button>
                                <Button
                                  onClick={() => handleOpenEliminarRutaModal(route)}
                                  variant="outline"
                                  size="sm"
                                  className="border-red-300 text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Eliminar Ruta
                                </Button>
                              </div>
                            </div>
                          </div>

                          {/* Totales con mejor espaciado y fondos de colores */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4 mt-4">
                            <div className="bg-gray-100 p-3 rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-600 mb-1">Cargue</p>
                              <p className="text-sm font-bold text-gray-800">{formatCOP(route.totalAmount)}</p>
                            </div>

                            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                              <p className="text-xs text-green-700 mb-1">Entregado</p>
                              <p className="text-sm font-bold text-green-700">{formatCOP(totals.entregado)}</p>
                            </div>

                            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                              <p className="text-xs text-yellow-700 mb-1">Fiado</p>
                              <p className="text-sm font-bold text-yellow-700">{formatCOP(totals.fiado)}</p>
                            </div>

                            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
                              <p className="text-xs text-red-700 mb-1">Devoluciones</p>
                              <p className="text-sm font-bold text-red-700">{formatCOP(totals.devoluciones)}</p>
                            </div>

                            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                              <p className="text-xs text-blue-700 mb-1">Repasos</p>
                              <p className="text-sm font-bold text-blue-700">{formatCOP(totals.repasos)}</p>
                            </div>

                            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                              <p className="text-xs text-gray-700 mb-1">Agotados</p>
                              <p className="text-sm font-bold text-gray-700">{formatCOP(totals.agotados)}</p>
                            </div>
                          </div>

                          {/* Efectivo Esperado */}
                          <div className="mt-4 pt-4 border-t bg-white -mx-4 -mb-4 px-4 py-3 rounded-b-lg">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Efectivo Esperado:</p>
                              <p className="text-xl font-bold text-green-600">{formatCOP(totals.entregado)}</p>
                            </div>
                          </div>

                          {expandedRoutes.has(route.id) && Array.isArray(route.orders) && (
                            <div className="mt-4 pt-4 border-t">
                              <h3 className="font-semibold mb-3">Clientes de la ruta:</h3>

                              <div className="space-y-3">
                                {route.orders.map((order) => {
                                  if (!order) return null

                                  const isExpanded = expandedOrders.has(order.id)

                                  let effectiveTotal = 0
                                  let returnedTotal = 0

                                  if (Array.isArray(order.items)) {
                                    order.items.forEach((item) => {
                                      if (!item) return

                                      if (item.devuelto) {
                                        returnedTotal += Number(item.subtotal) || 0
                                      } else {
                                        const estadoProd = item.estadoProducto || "normal"
                                        if (estadoProd === "agotado") return

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
                                    <Card key={order.id} className="overflow-hidden">
                                      <div className="p-3 md:p-4 bg-muted/50">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                              <h3 className="font-semibold text-sm md:text-base truncate">
                                                {order.cliente}
                                              </h3>
                                              {order.esCobro ? (
                                                <Badge className="shrink-0 font-bold text-xs border-2 bg-purple-100 text-purple-800 border-purple-400">
                                                  COBRO
                                                </Badge>
                                              ) : (
                                                <Badge
                                                  className={`shrink-0 font-bold text-xs border-2 ${
                                                    order.estado === "entregado"
                                                      ? "bg-green-100 text-green-800 border-green-400"
                                                      : order.estado === "fiado"
                                                        ? "bg-orange-100 text-orange-800 border-orange-400"
                                                        : order.estado === "repaso"
                                                          ? "bg-blue-100 text-blue-800 border-blue-400"
                                                          : order.estado === "devolucion"
                                                            ? "bg-red-100 text-red-800 border-red-400"
                                                            : "bg-yellow-100 text-yellow-800 border-yellow-400"
                                                  }`}
                                                >
                                                  {order.estado.toUpperCase()}
                                                </Badge>
                                              )}
                                            </div>

                                            {/* Dropdown para reasignar pedido */}
                                            {!route.cuadradoEnCaja && (
                                              <div className="mt-2">
                                                <Label className="text-xs text-muted-foreground mb-1 block">
                                                  Reasignar pedido a:
                                                </Label>
                                                <Select
                                                  disabled={reasignandoPedido === order.id}
                                                  onValueChange={(nuevaPlanillaId) => handleReasignarPedido(order.id, nuevaPlanillaId)}
                                                >
                                                  <SelectTrigger className="w-full text-xs">
                                                    <SelectValue 
                                                      placeholder={
                                                        reasignandoPedido === order.id 
                                                          ? "Reasignando..." 
                                                          : "Seleccionar ruta destino"
                                                      } 
                                                    />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                    {/* Rutas del mismo entregador */}
                                                    <SelectItem value="header-mismo-entregador" disabled className="font-semibold text-xs">
                                                      Rutas de {route.entregador}
                                                    </SelectItem>
                                                    {filteredRoutes
                                                      .filter(r => 
                                                        r.entregador === route.entregador && 
                                                        r.id !== route.id &&
                                                        !r.cuadradoEnCaja
                                                      )
                                                      .map(r => (
                                                        <SelectItem key={r.id} value={r.id.toString()}>
                                                          Ruta {r.ruta} - {new Date(r.fecha).toLocaleDateString('es-CO')}
                                                        </SelectItem>
                                                      ))
                                                    }
                                                    
                                                    {/* Separador */}
                                                    {routeSheets.some(r => 
                                                      r.entregador !== route.entregador && !r.cuadradoEnCaja
                                                    ) && (
                                                      <SelectItem value="header-otros-entregadores" disabled className="font-semibold text-xs border-t mt-2 pt-2">
                                                        Otros entregadores
                                                      </SelectItem>
                                                    )}
                                                    
                                                    {/* Rutas de otros entregadores */}
                                                    {routeSheets
                                                      .filter(r => 
                                                        r.entregador !== route.entregador && 
                                                        !r.cuadradoEnCaja
                                                      )
                                                      .map(r => (
                                                        <SelectItem key={r.id} value={r.id.toString()}>
                                                          {r.entregador} - Ruta {r.ruta} - {new Date(r.fecha).toLocaleDateString('es-CO')}
                                                        </SelectItem>
                                                      ))
                                                    }
                                                  </SelectContent>
                                                </Select>
                                              </div>
                                            )}

                                            <p className="text-xs md:text-sm text-muted-foreground">
                                              {Array.isArray(order.items) ? order.items.length : 0} productos ·{" "}
                                              {formatCOP(effectiveTotal)}
                                              {returnedTotal > 0 && (
                                                <span className="text-red-600 ml-2">
                                                  · Dev: {formatCOP(returnedTotal)}
                                                </span>
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
                                            {isExpanded ? (
                                              <ChevronUp className="h-4 w-4" />
                                            ) : (
                                              <ChevronDown className="h-4 w-4" />
                                            )}
                                          </Button>
                                        </div>
                                      </div>

                                      {isExpanded && Array.isArray(order.items) && (
                                        <div className="p-3 md:p-4 space-y-4">
                                          <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                                            <strong>Ajustes manuales:</strong> Edita "Cant. Entregada" para entregas
                                            parciales. Para promociones con precios especiales, ajusta el "Subtotal"
                                            directamente.
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
                                                    <tr
                                                      key={idx}
                                                      className={`border-b ${item.devuelto ? "bg-red-50 line-through opacity-60" : ""}`}
                                                    >
                                                      <td className="py-2">
                                                        <Checkbox
                                                          checked={item.devuelto || false}
                                                          onCheckedChange={() =>
                                                            handleItemReturn(
                                                              order.id,
                                                              item.codigo,
                                                              item.devuelto || false,
                                                            )
                                                          }
                                                          disabled={route.cuadradoEnCaja}
                                                        />
                                                      </td>
                                                      <td className="py-2 font-mono">{item.codigo}</td>
                                                      <td className="py-2">{item.descripcion}</td>
                                                      <td className="text-right py-2">{item.cantidad}</td>
                                                      <td className="text-right py-2">
                                                        {!route.cuadradoEnCaja && !item.devuelto ? (
                                                          <input
                                                            type="number"
                                                            min="0"
                                                            max={item.cantidad}
                                                            defaultValue={cantidadEntregada}
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
                                                          <span className="font-medium">{cantidadEntregada}</span>
                                                        )}
                                                      </td>
                                                      <td className="text-right py-2">
                                                        {!route.cuadradoEnCaja && !item.devuelto ? (
                                                          <div className="flex flex-col items-end gap-1">
                                                            <input
                                                              type="number"
                                                              min="0"
                                                              step="100"
                                                              defaultValue={subtotalFinal}
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
                                                            <div className="flex items-center gap-2">
                                                              <span className="text-xs text-muted-foreground">
                                                                {formatCOP(subtotalFinal)}
                                                              </span>
                                                              {tieneAjusteManual && (
                                                                <span className="text-xs text-orange-600">
                                                                  Ajustado
                                                                </span>
                                                              )}
                                                            </div>
                                                          </div>
                                                        ) : (
                                                          <div className="flex flex-col items-end">
                                                            <span className="font-medium">
                                                              {formatCOP(subtotalFinal)}
                                                            </span>
                                                            {tieneAjusteManual && (
                                                              <span className="text-xs text-orange-600">
                                                                Ajustado
                                                              </span>
                                                            )}
                                                          </div>
                                                        )}
                                                      </td>
                                                      <td className="text-center py-2">
                                                        {estadoProducto === "agotado" && (
                                                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                                            Agotado
                                                          </span>
                                                        )}
                                                        {estadoProducto === "parcial" && (
                                                          <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                                            Parcial
                                                          </span>
                                                        )}
                                                        {estadoProducto === "normal" && !item.devuelto && (
                                                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                                                            Normal
                                                          </span>
                                                        )}
                                                        {item.devuelto && (
                                                          <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                                            Devuelto
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

                                          {/* Campos de Descuento por Pedido */}
                                          <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                                            <h4 className="font-semibold text-sm mb-3 text-orange-800">
                                              Descuento (Opcional)
                                            </h4>
                                            
                                            <div className="grid grid-cols-2 gap-3">
                                              <div>
                                                <Label htmlFor={`descuento-${order.id}`} className="text-xs text-muted-foreground">
                                                  Monto del Descuento
                                                </Label>
                                                <Input
                                                  id={`descuento-${order.id}`}
                                                  type="number"
                                                  min="0"
                                                  max={effectiveTotal}
                                                  placeholder="0"
                                                  defaultValue={order.descuento || 0}
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
                                                  disabled={route.cuadradoEnCaja}
                                                  className="mt-1"
                                                />
                                              </div>
                                              
                                              <div>
                                                <Label htmlFor={`motivo-descuento-${order.id}`} className="text-xs text-muted-foreground">
                                                  Motivo del Descuento
                                                </Label>
                                                <Input
                                                  id={`motivo-descuento-${order.id}`}
                                                  type="text"
                                                  placeholder="Ej: Producto averiado"
                                                  defaultValue={order.motivoDescuento || ""}
                                                  onBlur={(e) => handleMotivoDescuentoChange(order.id, e.target.value)}
                                                  disabled={route.cuadradoEnCaja}
                                                  className="mt-1"
                                                />
                                              </div>
                                            </div>
                                            
                                            {order.descuento && Number(order.descuento) > 0 && (
                                              <div className="mt-3 pt-3 border-t border-orange-300 flex justify-between items-center">
                                                <span className="text-sm font-medium text-orange-700">
                                                  Total con Descuento:
                                                </span>
                                                <span className="text-lg font-bold text-orange-800">
                                                  {formatCOP(effectiveTotal - (Number(order.descuento) || 0))}
                                                </span>
                                              </div>
                                            )}
                                          </div>

                                          <div className="flex flex-wrap gap-2">
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleOrderStatusChange(order.id, "fiado")}
                                              className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50"
                                              disabled={route.cuadradoEnCaja}
                                            >
                                              Fiado
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleOrderStatusChange(order.id, "repaso")}
                                              className="flex-1 sm:flex-none border-blue-300 text-blue-700 hover:bg-blue-50"
                                              disabled={route.cuadradoEnCaja}
                                            >
                                              Repaso
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="destructive"
                                              onClick={() => handleOrderStatusChange(order.id, "devolucion")}
                                              className="flex-1 sm:flex-none"
                                              disabled={route.cuadradoEnCaja}
                                            >
                                              Devolución
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleOpenEliminarPedidoModal(order.id, order.cliente, effectiveTotal, route.id)}
                                              className="flex-1 sm:flex-none border-gray-400 text-gray-700 hover:bg-gray-100 hover:text-red-600 hover:border-red-400"
                                              disabled={route.cuadradoEnCaja}
                                            >
                                              <Trash2 className="h-4 w-4 mr-1" />
                                              Eliminar
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
                      )
                    })}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </main>

      {/* Modal para recibir efectivo */}
      <Dialog open={showModal} onOpenChange={(open) => (open ? setShowModal(true) : handleCloseModal())}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Recibir Efectivo</DialogTitle>
            <DialogDescription>
              {selectedPlanilla && `Ruta: ${selectedPlanilla.ruta} - ${selectedPlanilla.entregador}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor="efectivoRecibido" className="text-right">
                Efectivo Recibido
              </Label>
              <Input
                id="efectivoRecibido"
                value={formData.efectivoRecibido}
                onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
                type="number"
                className="col-span-1"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="tieneConsignacion"
                checked={formData.tieneConsignacion}
                onCheckedChange={(checked) => setFormData({ ...formData, tieneConsignacion: !!checked })}
              />
              <label
                htmlFor="tieneConsignacion"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                ¿Tiene consignación?
              </label>
            </div>

            {formData.tieneConsignacion && (
              <>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="numeroConsignacion" className="text-right">
                    Número Consignación
                  </Label>
                  <Input
                    id="numeroConsignacion"
                    value={formData.numeroConsignacion}
                    onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                    onBlur={handleConsignacionBlur}
                    className="col-span-1"
                    placeholder="Ej: 1234567890"
                  />
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="banco" className="text-right">
                    Banco
                  </Label>
                  <Input
                    id="banco"
                    value={formData.banco}
                    onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                    className="col-span-1"
                    placeholder="Ej: Bancolombia"
                  />
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="montoConsignacion" className="text-right">
                    Monto Consignación
                  </Label>
                  <Input
                    id="montoConsignacion"
                    value={formData.montoConsignacion}
                    onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                    type="number"
                    className="col-span-1"
                  />
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="fechaConsignacion" className="text-right">
                    Fecha Consignación
                  </Label>
                  <Input
                    id="fechaConsignacion"
                    type="date"
                    value={formData.fechaConsignacion}
                    onChange={(e) => setFormData({ ...formData, fechaConsignacion: e.target.value })}
                    className="col-span-1"
                  />
                </div>
              </>
            )}

            {/* DESCUENTOS */}
<div className="grid grid-cols-2 items-center gap-4">
  <Label htmlFor="descuento" className="text-right">
    Descuento Aplicado
  </Label>
  <Input
    id="descuento"
    value={formData.descuento}
    onChange={(e) => setFormData({ ...formData, descuento: e.target.value })}
    type="number"
    min="0"
    className="col-span-1"
    placeholder="0"
  />
</div>

{formData.descuento && Number(formData.descuento) > 0 && (
  <div className="grid grid-cols-2 items-center gap-4">
    <Label htmlFor="motivoDescuento" className="text-right">
      Motivo del Descuento
    </Label>
    <Textarea
      id="motivoDescuento"
      value={formData.motivoDescuento}
      onChange={(e) => setFormData({ ...formData, motivoDescuento: e.target.value })}
      className="col-span-1"
      rows={2}
      placeholder="Ej: Promoción, avería, etc."
    />
  </div>
)}
            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor="observaciones" className="text-right">
                Observaciones
              </Label>
              <Textarea
                id="observaciones"
                value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                className="col-span-1"
                rows={3}
              />
            </div>

            {selectedPlanilla && (
              <div className="mt-4 pt-4 border-t flex flex-col gap-3">
                <p className="text-sm font-medium">Resumen de la Ruta:</p>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Cargue</p>
                    <p className="font-semibold">{formatCOP(selectedPlanilla.montoCargue || 0)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Entregado</p>
                    <p className="font-semibold text-green-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).entregado)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Fiado</p>
                    <p className="font-semibold text-yellow-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).fiado)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Devoluciones</p>
                    <p className="font-semibold text-red-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).devoluciones)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Repasos</p>
                    <p className="font-semibold text-blue-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).repasos)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Diferencia Esperada</p>
                    {(() => {
                      const totals = calculateRouteTotals(selectedPlanilla)
                      const cargue = selectedPlanilla?.montoCargue || 0
                      const novedades = totals.fiado + totals.devoluciones + totals.repasos + totals.agotados + Number(formData.descuento || 0)
                      const totalEsperado = cargue - novedades
                      const totalRecibido = Number(formData.efectivoRecibido || 0) + (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0)
                      const diferencia = Math.round((totalRecibido - totalEsperado) * 100) / 100
                      return (
                        <p className={`font-semibold ${diferencia === 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatCOP(diferencia)}
                        </p>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Guardando..." : "Confirmar Recepción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para agrupar rutas y cuadrar */}
      <Dialog
        open={showAgrupadoModal}
        onOpenChange={(open) => (open ? setShowAgrupadoModal(true) : setShowAgrupadoModal(false))}
      >
        <DialogContent className="sm:max-w-[425px] lg:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cuadre Agrupado</DialogTitle>
            <DialogDescription>
              Estás cuadrando {agrupadoData?.totalRutas} rutas para el entregador: {agrupadoData?.entregador}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor="efectivoRecibidoAgrupado" className="text-right">
                Efectivo Recibido
              </Label>
              <Input
                id="efectivoRecibidoAgrupado"
                value={formData.efectivoRecibido}
                onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
                type="number"
                className="col-span-1"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="tieneConsignacionAgrupado"
                checked={formData.tieneConsignacion}
                onCheckedChange={(checked) => setFormData({ ...formData, tieneConsignacion: !!checked })}
              />
              <label
                htmlFor="tieneConsignacionAgrupado"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                ¿Tiene consignación?
              </label>
            </div>

            {formData.tieneConsignacion && (
              <>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="numeroConsignacionAgrupado" className="text-right">
                    Número Consignación
                  </Label>
                  <Input
                    id="numeroConsignacionAgrupado"
                    value={formData.numeroConsignacion}
                    onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                    onBlur={handleConsignacionBlur}
                    className="col-span-1"
                    placeholder="Ej: 1234567890"
                  />
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="bancoAgrupado" className="text-right">
                    Banco
                  </Label>
                  <Input
                    id="bancoAgrupado"
                    value={formData.banco}
                    onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                    className="col-span-1"
                    placeholder="Ej: Bancolombia"
                  />
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="montoConsignacionAgrupado" className="text-right">
                    Monto Consignación
                  </Label>
                  <Input
                    id="montoConsignacionAgrupado"
                    value={formData.montoConsignacion}
                    onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                    type="number"
                    className="col-span-1"
                  />
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <Label htmlFor="fechaConsignacionAgrupado" className="text-right">
                    Fecha Consignación
                  </Label>
                  <Input
                    id="fechaConsignacionAgrupado"
                    type="date"
                    value={formData.fechaConsignacion}
                    onChange={(e) => setFormData({ ...formData, fechaConsignacion: e.target.value })}
                    className="col-span-1"
                  />
                </div>
              </>
            )}

            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor="observacionesAgrupado" className="text-right">
                Observaciones
              </Label>
              <Textarea
                id="observacionesAgrupado"
                value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                className="col-span-1"
                rows={3}
              />
            </div>

            <div className="mt-4 pt-4 border-t flex flex-col gap-3">
              <p className="text-sm font-medium">Resumen del Cuadre Agrupado:</p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Cargue Total</p>
                  <p className="font-semibold">{formatCOP(agrupadoData?.totales.cargue || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Entregado Total</p>
                  <p className="font-semibold text-green-600">{formatCOP(agrupadoData?.totales.entregado || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fiado Total</p>
                  <p className="font-semibold text-yellow-600">{formatCOP(agrupadoData?.totales.fiado || 0)}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Devoluciones</p>
                  <p className="font-semibold text-red-600">{formatCOP(agrupadoData?.totales.devoluciones || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Repasos</p>
                  <p className="font-semibold text-blue-600">{formatCOP(agrupadoData?.totales.repasos || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Agotados</p>
                  <p className="font-semibold text-purple-600">{formatCOP(agrupadoData?.totales.agotados || 0)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Descuentos</p>
                  <p className="font-semibold text-pink-600">{formatCOP(agrupadoData?.totales.descuentos || 0)}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Diferencia Esperada</p>
                  {(() => {
                    const cargue = agrupadoData?.totales.cargue || 0
                    const novedades = (agrupadoData?.totales.fiado || 0) + (agrupadoData?.totales.devoluciones || 0) + (agrupadoData?.totales.repasos || 0) + (agrupadoData?.totales.agotados || 0) + (agrupadoData?.totales.descuentos || 0)
                    const totalEsperado = cargue - novedades
                    const totalRecibido = Number(formData.efectivoRecibido || 0) + (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0)
                    const diferencia = Math.round((totalRecibido - totalEsperado) * 100) / 100
                    return (
                      <p className={`font-semibold ${diferencia === 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCOP(diferencia)}
                      </p>
                    )
                  })()}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleSubmitAgrupado} disabled={submitting}>
              {submitting ? "Guardando..." : "Confirmar Cuadre Agrupado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para agregar nuevo pedido */}
      <Dialog
        open={showNuevoPedidoModal}
        onOpenChange={(open) => (open ? setShowNuevoPedidoModal(true) : handleCloseNuevoPedidoModal())}
      >
        <DialogContent className="sm:max-w-[425px] lg:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Nuevo Pedido</DialogTitle>
            <DialogDescription>Agregar un nuevo pedido a la ruta: {rutaParaNuevoPedido?.ruta}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor="clienteNuevoPedido" className="text-right">
                Cliente
              </Label>
              <Input
                id="clienteNuevoPedido"
                value={nuevoPedidoData.cliente}
                onChange={(e) => setNuevoPedidoData({ ...nuevoPedidoData, cliente: e.target.value })}
                className="col-span-1"
                placeholder="Nombre del cliente"
              />
            </div>
            <div className="grid grid-cols-2 items-center gap-4">
              <Label htmlFor="observacionesNuevoPedido" className="text-right">
                Observaciones
              </Label>
              <Textarea
                id="observacionesNuevoPedido"
                value={nuevoPedidoData.observaciones}
                onChange={(e) => setNuevoPedidoData({ ...nuevoPedidoData, observaciones: e.target.value })}
                className="col-span-1"
                rows={3}
                placeholder="Notas adicionales sobre el pedido"
              />
            </div>

            <h3 className="font-semibold mt-4">Productos del Pedido</h3>
            <div className="space-y-4">
              {productosNuevoPedido.map((producto) => (
                <div key={producto.id} className="grid grid-cols-6 gap-3 items-center border-b pb-3">
                  <Input
                    placeholder="Código"
                    value={producto.codigo}
                    onChange={(e) => actualizarProducto(producto.id, "codigo", e.target.value)}
                    className="col-span-1 text-xs"
                  />
                  <Input
                    placeholder="Descripción"
                    value={producto.descripcion}
                    onChange={(e) => actualizarProducto(producto.id, "descripcion", e.target.value)}
                    className="col-span-2 text-xs"
                  />
                  <Input
                    placeholder="Cantidad"
                    type="number"
                    min="1"
                    value={producto.cantidad}
                    onChange={(e) => actualizarProducto(producto.id, "cantidad", Number.parseInt(e.target.value) || 1)}
                    className="col-span-1 text-xs text-right"
                  />
                  <Input
                    placeholder="Precio Unit."
                    type="number"
                    min="0"
                    value={producto.precioUnitario}
                    onChange={(e) =>
                      actualizarProducto(producto.id, "precioUnitario", Number.parseFloat(e.target.value) || 0)
                    }
                    className="col-span-1 text-xs text-right"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-medium text-sm">{formatCOP(producto.subtotal)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => eliminarProducto(producto.id)}
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button variant="outline" onClick={agregarProducto} className="w-full mt-3 bg-transparent">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Otro Producto
            </Button>

            <div className="mt-4 pt-4 border-t flex justify-end">
              <p className="text-xl font-bold">Total Pedido: {formatCOP(calcularTotalNuevoPedido())}</p>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" onClick={handleSubmitNuevoPedido} disabled={submittingNuevoPedido}>
              {submittingNuevoPedido ? "Creando..." : "Crear Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Fiado Parcial */}
      <Dialog open={showFiadoModal} onOpenChange={setShowFiadoModal}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Registrar Pago Parcial (Fiado)</DialogTitle>
      <DialogDescription>
        {selectedOrderForFiado && `Cliente: ${selectedOrderForFiado.cliente}`}
      </DialogDescription>
    </DialogHeader>
    
    <div className="grid gap-4 py-4">
      {selectedOrderForFiado && (
        <>
          <div className="grid grid-cols-2 items-center gap-4">
            <Label className="text-right font-semibold">Total del Pedido:</Label>
            <p className="text-lg font-bold">{formatCOP(selectedOrderForFiado.total)}</p>
          </div>

          <div className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor="montoPagado" className="text-right">
              ¿Cuánto pagó?
            </Label>
            <Input
              id="montoPagado"
              type="number"
              min="0"
              max={selectedOrderForFiado.total}
              value={montoPagadoFiado}
              onChange={(e) => setMontoPagadoFiado(e.target.value)}
              placeholder="0"
              className="col-span-1"
              autoFocus
            />
          </div>

          {montoPagadoFiado && (
            <div className="grid grid-cols-2 items-center gap-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
              <Label className="text-right font-semibold text-orange-700">
                Saldo Pendiente:
              </Label>
              <p className="text-lg font-bold text-orange-600">
                {formatCOP(selectedOrderForFiado.total - Number(montoPagadoFiado))}
              </p>
            </div>
          )}

          <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded border border-blue-200">
            <strong>Nota:</strong> El pedido se marcará como "Fiado" y se registrará el monto pagado. 
            El saldo pendiente quedará como cuenta por cobrar.
          </div>
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

      {/* Modal para confirmar eliminación de pedido */}
      <Dialog open={showEliminarPedidoModal} onOpenChange={setShowEliminarPedidoModal}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Pedido</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El pedido será eliminado permanentemente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {pedidoAEliminar && (
              <>
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800 mb-2">
                    <strong>Cliente:</strong> {pedidoAEliminar.cliente}
                  </p>
                  <p className="text-sm text-red-800">
                    <strong>Total del pedido:</strong> {formatCOP(pedidoAEliminar.total)}
                  </p>
                </div>

                <div className="text-xs text-muted-foreground bg-yellow-50 p-3 rounded border border-yellow-200">
                  <strong>Importante:</strong> Al eliminar este pedido, el total del cargue de la ruta se reducirá 
                  automáticamente en {formatCOP(pedidoAEliminar.total)}.
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEliminarPedidoModal(false)
                setPedidoAEliminar(null)
              }}
              disabled={eliminandoPedido}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleEliminarPedido}
              disabled={eliminandoPedido}
            >
              {eliminandoPedido ? "Eliminando..." : "Eliminar Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para confirmar eliminación de ruta completa */}
      <Dialog open={showEliminarRutaModal} onOpenChange={setShowEliminarRutaModal}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="text-red-600">Eliminar Ruta Completa</DialogTitle>
            <DialogDescription>
              Esta accion eliminara la ruta y todos sus pedidos permanentemente.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {rutaAEliminar && (
              <>
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2">
                  <p className="text-sm text-red-800">
                    <strong>Ruta:</strong> {rutaAEliminar.nombre}
                  </p>
                  <p className="text-sm text-red-800">
                    <strong>Entregador:</strong> {rutaAEliminar.entregador}
                  </p>
                  <p className="text-sm text-red-800">
                    <strong>Fecha:</strong> {new Date(rutaAEliminar.fecha).toLocaleDateString("es-CO")}
                  </p>
                  <p className="text-sm text-red-800">
                    <strong>Pedidos:</strong> {rutaAEliminar.totalPedidos}
                  </p>
                  <p className="text-sm text-red-800">
                    <strong>Total Cargue:</strong> {formatCOP(rutaAEliminar.totalCargue)}
                  </p>
                </div>

                {rutaAEliminar.totalPedidos > 0 && (
                  <div className="text-xs text-muted-foreground bg-yellow-50 p-3 rounded border border-yellow-200">
                    <strong>Advertencia:</strong> Esta ruta tiene {rutaAEliminar.totalPedidos} pedido(s). 
                    Al eliminarla, todos los pedidos seran eliminados tambien.
                  </div>
                )}

                {rutaAEliminar.totalPedidos === 0 && (
                  <div className="text-xs text-muted-foreground bg-green-50 p-3 rounded border border-green-200">
                    Esta ruta esta vacia y puede ser eliminada sin afectar pedidos.
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEliminarRutaModal(false)
                setRutaAEliminar(null)
              }}
              disabled={eliminandoRuta}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleEliminarRuta}
              disabled={eliminandoRuta}
            >
              {eliminandoRuta ? "Eliminando..." : "Eliminar Ruta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para cambiar fecha de ruta */}
      <Dialog open={showCambiarFechaModal} onOpenChange={setShowCambiarFechaModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Cambiar Fecha de Ruta</DialogTitle>
            <DialogDescription>
              Selecciona la nueva fecha para esta ruta de entrega.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {rutaParaCambiarFecha && (
              <>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <p className="text-sm text-blue-800">
                    <strong>Ruta:</strong> {rutaParaCambiarFecha.nombre}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>Fecha actual:</strong> {new Date(rutaParaCambiarFecha.fechaActual).toLocaleDateString("es-CO")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nuevaFecha">Nueva Fecha</Label>
                  <Input
                    id="nuevaFecha"
                    type="date"
                    value={nuevaFechaRuta}
                    onChange={(e) => setNuevaFechaRuta(e.target.value)}
                  />
                </div>

                <div className="text-xs text-muted-foreground bg-gray-50 p-3 rounded border">
                  Usa esta opcion cuando una ruta se crea un dia pero se entrega en otro.
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCambiarFechaModal(false)
                setRutaParaCambiarFecha(null)
                setNuevaFechaRuta("")
              }}
              disabled={cambiandoFecha}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleCambiarFechaRuta}
              disabled={cambiandoFecha || !nuevaFechaRuta}
            >
              {cambiandoFecha ? "Guardando..." : "Guardar Fecha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
