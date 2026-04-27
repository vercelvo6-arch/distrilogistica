"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DollarSign, LogOut, Filter, Wallet, History, Calendar, ChevronDown, ChevronUp, Plus, X, Trash2, Edit2 } from "lucide-react"
import type { RouteSheet, User, RecepcionCaja, Order } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import {
  updatePedidoEstado,
  updateProductoDevuelto,
  updateCantidadEntregada,
  updateSubtotalAjustado,
  updateDescuentoPedido,
  updateMotivoDescuentoPedido,
  updateMotivoAjuste,
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
import { CardNovedadesInteractivo } from "@/components/novedades/card-novedades-interactivo-caja"
import { BadgeNovedades } from "@/components/novedades/badge-novedades-lista"
import { ComisionesView } from "@/components/comisiones-view"
import { CuadreEditModal } from "@/components/cuadre-edit-modal"
import { FiadosAsignadosSection } from "@/components/fiados-asignados-section"

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

// ✅ NUEVO: Interface para novedades de pedido
interface NovedadPedido {
  id: string
  pedido_id: string
  tipo_novedad: string
  monto_novedad: number
  monto_pagado: number
  validado: boolean
}

export function CajaView({ onLogout, user }: CajaViewProps) {
  const { toast } = useToast()
  const [filterEntregador, setFilterEntregador] = useState("all")
  const [filterRuta, setFilterRuta] = useState("all")
  
  const getDateDaysAgo = (days: number) => {
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString().split("T")[0]
  }
  
  const [filterFechaDesde, setFilterFechaDesde] = useState(getDateDaysAgo(7))
  const [filterFechaHasta, setFilterFechaHasta] = useState(new Date().toISOString().split("T")[0])
  const [selectedView, setSelectedView] = useState<"caja" | "historial" | "comisiones">("caja")
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [recepciones, setRecepciones] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // ✅ NUEVO: Estado para novedades por planilla
  const [novedadesPorPlanilla, setNovedadesPorPlanilla] = useState<Record<number, NovedadPedido[]>>({})

  const [showModal, setShowModal] = useState(false)
  const [selectedPlanilla, setSelectedPlanilla] = useState<RouteSheet | null>(null)
  const [showFiadoModal, setShowFiadoModal] = useState(false)
  const [selectedOrderForFiado, setSelectedOrderForFiado] = useState<Order | null>(null)
  const [montoPagadoFiado, setMontoPagadoFiado] = useState("")
  // Estado para guardar el total efectivo calculado del pedido seleccionado para fiado
  const [totalEfectivoFiado, setTotalEfectivoFiado] = useState(0)

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
  const [editandoCuadreId, setEditandoCuadreId] = useState<number | null>(null)
  // Estados para export
  const [exportFechaDesde, setExportFechaDesde] = useState(new Date().toISOString().split("T")[0])
  const [exportFechaHasta, setExportFechaHasta] = useState(new Date().toISOString().split("T")[0])
  const [exportando, setExportando] = useState(false)
  
  // Estado para tracking de cobros de fiados asignados
  const [totalCobrosAsignados, setTotalCobrosAsignados] = useState(0)
  const [showAbonoCobroModal, setShowAbonoCobroModal] = useState(false)
  const [selectedCobro, setSelectedCobro] = useState<Order | null>(null)
  const [montoAbonoCobro, setMontoAbonoCobro] = useState("")
  const [submittingAbonoCobro, setSubmittingAbonoCobro] = useState(false)
  

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedView === "historial") {
      loadHistorial()
    }
  }, [selectedView])

  // ✅ NUEVO: Función para cargar novedades de una planilla
  async function loadNovedadesPlanilla(planillaId: number): Promise<NovedadPedido[]> {
    try {
      const response = await fetch(`/api/novedades?planillaId=${planillaId}`)
      if (!response.ok) return []
      
      const data = await response.json()
      return data.novedades || []
    } catch (error) {
      console.error("[CAJA] Error cargando novedades:", error)
      return []
    }
  }

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
        cuadradoEnCaja: p.cuadrado_en_caja === true || p.cuadrado_en_caja === 't',
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

      // ✅ NUEVO: Cargar novedades de cada planilla en paralelo para mejor rendimiento
      const novedadesMap: Record<number, NovedadPedido[]> = {}
      const promesas = planillas.map(async (planilla) => {
        const novedades = await loadNovedadesPlanilla(planilla.id)
        novedadesMap[planilla.id] = novedades
      })
      await Promise.all(promesas)
      setNovedadesPorPlanilla(novedadesMap)

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

      const responseAgrupados = await fetch("/api/cuadres-caja")
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

  // Función auxiliar para calcular el total efectivo de un pedido
  const calculateOrderEffectiveTotal = (order: Order): number => {
    if (!order || !Array.isArray(order.items)) return 0

    let effectiveTotal = 0

    order.items.forEach((item) => {
      if (!item) return

      const cantOriginal = Number(item.cantidad) || 0
      const precioUnit = Number(item.valorUnidad) || 0
      const subtotalOriginal = cantOriginal * precioUnit

      // ERROR DE FACTURACIÓN - no cuenta
      if (item.motivoAjuste === 'error_facturacion') {
        return
      }

      // PRODUCTO DEVUELTO - no cuenta
      if (item.motivoAjuste === 'devuelto' || item.devuelto) {
        return
      }

      // AGOTADO - no cuenta
      const cantEntregada =
        item.cantidadEntregada !== null && item.cantidadEntregada !== undefined
          ? Number(item.cantidadEntregada)
          : cantOriginal

      if (cantEntregada === 0 || item.estadoProducto === "agotado") {
        return
      }

      // PRODUCTO ENTREGADO NORMALMENTE
      const subtotalReal =
        item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
          ? Number(item.subtotalAjustado)
          : cantEntregada * precioUnit

      effectiveTotal += subtotalReal
    })

    // Restar descuento del pedido si existe
    if (order.descuento) {
      effectiveTotal -= Number(order.descuento)
    }

    return Math.round(effectiveTotal * 100) / 100
  }

  // ✅ MODIFICADO: calculateRouteTotals ahora incluye novedades de la tabla novedades_pedido
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

        // ERROR DE FACTURACIÓN (NO afecta comisión)
        if (item.motivoAjuste === 'error_facturacion') {
          erroresEnPedido += subtotalOriginal
          return
        }

        // PRODUCTO DEVUELTO (afecta comisión)
        if (item.motivoAjuste === 'devuelto' || item.devuelto) {
          returnedTotal += subtotalOriginal
          return
        }

        // AGOTADO
        const cantEntregada =
          item.cantidadEntregada !== null && item.cantidadEntregada !== undefined
            ? Number(item.cantidadEntregada)
            : cantOriginal

        if (cantEntregada === 0 || item.estadoProducto === "agotado") {
          agotadosEnPedido += subtotalOriginal
          return
        }

        // PRODUCTO ENTREGADO NORMALMENTE
        const subtotalReal =
          item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
            ? Number(item.subtotalAjustado)
            : cantEntregada * precioUnit

        effectiveTotal += subtotalReal
      })

      agotados += agotadosEnPedido
      devoluciones += returnedTotal
      erroresFacturacion += erroresEnPedido

      // Sumar según el estado del pedido
      if (order.estado === "fiado") {
        // CORRECCIÓN: El monto fiado es el total efectivo MENOS lo que ya pagó
        const montoPagadoReal = Number(order.montoPagado) || 0
        const saldoPendienteReal = effectiveTotal - montoPagadoReal

        // El fiado es solo lo que DEBE (saldo pendiente)
        fiado += saldoPendienteReal

        // Lo que YA PAGÓ se cuenta como efectivo entregado
        entregado += montoPagadoReal

        // Aplicar descuento si existe
        if (order.descuento) {
          // El descuento ya se aplicó al calcular effectiveTotal
        }
      } else if (order.estado === "repaso") {
        repasos += effectiveTotal
      } else if (order.estado === "devolucion") {
        devoluciones += effectiveTotal
      } else {
        // Estado "entregado" u otro
        entregado += effectiveTotal
        if (order.descuento) {
          entregado -= Number(order.descuento)
        }
      }
    })

    // ✅ NUEVO: Sumar novedades de la tabla novedades_pedido
    const novedades = novedadesPorPlanilla[route.id] || []
    
    novedades.forEach((novedad) => {
      if (!novedad.validado) return // Solo contar novedades validadas

      const monto = Number(novedad.monto_novedad) || 0

      switch (novedad.tipo_novedad) {
        case "agotado":
          agotados += monto
          break
        case "devolucion":
          devoluciones += monto
          break
        case "fiado_parcial":
          const montoPagadoNov = Number(novedad.monto_pagado) || 0
          const saldoNov = monto - montoPagadoNov
          fiado += saldoNov
          entregado += montoPagadoNov
          break
        case "error_facturacion":
          erroresFacturacion += monto
          break
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

  const handleMotivoAjusteChange = async (orderId: string, codigo: string, motivoAjuste: string) => {
    try {
      // Actualizar estado local primero (optimista)
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

      // Guardar en el servidor
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
      console.error("[CAJA] Error updating motivo ajuste:", err)
      await loadData()
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del producto",
        variant: "destructive",
      })
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
        // CORRECCIÓN: Calcular el total efectivo real del pedido
        const totalEfectivo = calculateOrderEffectiveTotal(order)
        setSelectedOrderForFiado(order)
        setTotalEfectivoFiado(totalEfectivo)
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

  const actualizarProducto = (productoId: string, field: keyof Omit<NuevoProducto, "id">, value: any) => {
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
    setTotalCobrosAsignados(0)
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
    setTotalCobrosAsignados(0)
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
      devolucionesParciales: "",
      devolucionesCompletas: "",
      repasos: "",
      fiados: "",
      agotados: "",
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
    let totalErroresFacturacionAgrupado = 0

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
      totalErroresFacturacionAgrupado += totals.erroresFacturacion

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
        erroresFacturacion: totalErroresFacturacionAgrupado,
        descuentos: totalDescuentosAgrupado,
      },
    }

    setFormData({
      efectivoRecibido: totalEntregadoAgrupado.toString(),
      tieneConsignacion: false,
      numeroConsignacion: "",
      banco: "",
      montoConsignacion: "",
      fechaConsignacion: new Date().toISOString().split("T")[0],
      observaciones: "",
      descuento: totalDescuentosAgrupado.toString(),
      motivoDescuento: "",
      devolucionesParciales: totalDevolucionesAgrupado.toString(),
      devolucionesCompletas: "0",
      repasos: totalRepasosAgrupado.toString(),
      fiados: totalFiadoAgrupado.toString(),
      agotados: totalAgotadosAgrupado.toString(),
    })

    setAgrupadoData(agrupado)
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

    // ✅ PASO 1: GUARDAR TODOS LOS PEDIDOS FIADOS ANTES DEL CUADRE
   console.log('[CUADRE AGRUPADO] 🔄 Guardando pedidos con estado especial...')
    
    const rutasSeleccionadas = filteredRoutes.filter((r) => selectedRoutes.includes(r.id))
    let pedidosGuardados = 0
    
    for (const route of rutasSeleccionadas) {
      if (!Array.isArray(route.orders)) continue
      
      for (const order of route.orders) {
        // Guardar FIADOS
        if (order.estado === "fiado") {
          const totalEfectivo = calculateOrderEffectiveTotal(order)
          const montoPagado = Number(order.montoPagado) || 0
          const saldoPendiente = totalEfectivo - montoPagado
          
          console.log('[CUADRE AGRUPADO] 💾 Guardando FIADO:', {
            cliente: order.cliente,
            total: totalEfectivo,
            pagado: montoPagado,
            saldo: saldoPendiente
          })
          
          await updatePedidoEstado(order.id, "fiado", montoPagado, saldoPendiente)
          pedidosGuardados++
        }
        
        // Guardar REPASOS
        if (order.estado === "repaso") {
          console.log('[CUADRE AGRUPADO] 💾 Guardando REPASO:', {
            cliente: order.cliente
          })
          
          await updatePedidoEstado(order.id, "repaso")
          pedidosGuardados++
        }
      }
    }
    
    console.log('[CUADRE AGRUPADO] ✅ Pedidos guardados:', pedidosGuardados)   

    // ✅ PASO 2: CREAR EL CUADRE AGRUPADO (código original)
    const fiadoFinal = Number(formData.fiados) || 0
    const repasosFinal = Number(formData.repasos) || 0
    const devolucionesFinal = Number(formData.devolucionesParciales) || 0
    const agotadosFinal = Number(formData.agotados) || 0
    const descuentoFinal = Number(formData.descuento) || 0

    const erroresFactInput = document.getElementById('erroresFactAgrupado') as HTMLInputElement
    const erroresFacturacionFinal = Number(erroresFactInput?.value) || 0

    // El efectivo esperado es el entregado calculado (igual que en la vista principal)
    const totalEsperadoCalculado = agrupadoData.totales.entregado || 0

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
      descuento: descuentoFinal,
      agotados: agotadosFinal,
      fiado: fiadoFinal,
      devoluciones: devolucionesFinal,
      repasos: repasosFinal,
      erroresFacturacion: erroresFacturacionFinal,
    }

    console.log('[CUADRE AGRUPADO] 📤 Enviando payload:', JSON.stringify(payload, null, 2))

    const response = await fetch("/api/cuadres-caja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    console.log('[CUADRE AGRUPADO] 📥 Respuesta recibida:', data)

    if (!response.ok) {
      console.error('[CUADRE AGRUPADO] ❌ Error response:', data)
      throw new Error(data.error || data.details || "Error al registrar cuadre agrupado")
    }

    toast({
      title: "Cuadre Agrupado Registrado",
      description: `✅ ${data.mensaje}`,
    })

    setShowAgrupadoModal(false)
    setSelectedRoutes([])
    setAgrupadoData(null)
    await loadData()
  } catch (error) {
    console.error("[CUADRE AGRUPADO] ❌ Error completo:", error)
    toast({
      title: "Error",
      description: error instanceof Error ? error.message : "Error al registrar cuadre",
      variant: "destructive",
    })
  } finally {
    setSubmitting(false)
  }
}

  // CORRECCIÓN PRINCIPAL: handleSubmitFiado ahora usa el total efectivo calculado
  const handleSubmitFiado = async () => {
    if (!selectedOrderForFiado) return

    const montoPagado = Number(montoPagadoFiado) || 0
    // USAR EL TOTAL EFECTIVO CALCULADO, NO EL TOTAL ORIGINAL DE LA FACTURA
    const totalPedido = totalEfectivoFiado

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
                  estado: "fiado" as const,
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
      setTotalEfectivoFiado(0)
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

  const handleAbonarCobro = async () => {
  if (!selectedCobro) return
  const monto = Number(montoAbonoCobro)
  if (!monto || monto <= 0 || monto > selectedCobro.total) {
    toast({ 
      title: "Error", 
      description: `El monto debe estar entre $1 y ${formatCOP(selectedCobro.total)}`, 
      variant: "destructive" 
    })
    return
  }
  
  try {
    setSubmittingAbonoCobro(true)
    
    const response = await fetch("/api/fiados/registrar-abono", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pedidoId: selectedCobro.id,
        montoAbono: monto,
        metodoPago: "efectivo",
        observaciones: "Abono registrado desde cobro en planilla",
      }),
    })
    
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Error al registrar abono")
    
    toast({ 
      title: "Abono Registrado", 
      description: `Abono de ${formatCOP(monto)} registrado. Saldo pendiente: ${formatCOP(data.saldo_pendiente)}` 
    })
    
    await fetch("/api/fiados/marcar-cobro-completado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cobroId: selectedCobro.id }),
    })
    
    // ✅ ACTUALIZAR EL EFECTIVO RECIBIDO AUTOMÁTICAMENTE
    const efectivoActual = Number(formData.efectivoRecibido) || 0
    const ajuste = monto - selectedCobro.total
    const nuevoEfectivo = efectivoActual + ajuste
    
    setFormData(prev => ({
      ...prev,
      efectivoRecibido: nuevoEfectivo.toString()
    }))
    
    setShowAbonoCobroModal(false)
    setSelectedCobro(null)
    setMontoAbonoCobro("")
    
    await loadData()
  } catch (err) {
    toast({ 
      title: "Error", 
      description: err instanceof Error ? err.message : "Error al registrar abono", 
      variant: "destructive" 
    })
  } finally {
    setSubmittingAbonoCobro(false)
  }
}

const handleNoPagoCobro = async (orderId: string, planillaId: number) => {
  try {
    const response = await fetch("/api/pedidos/eliminar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoId: orderId, planillaId }),
    })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Error al eliminar cobro")
    toast({ title: "Cobro Removido", description: "El cobro fue eliminado. El fiado original sigue pendiente." })
    await loadData()
  } catch (err) {
    toast({ title: "Error", description: err instanceof Error ? err.message : "Error al remover cobro", variant: "destructive" })
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

      // Calcular totalEsperado = cargue - novedades (fiado + devoluciones + repasos + agotados + descuentos) + cobros de fiados asignados
      const cargue = selectedPlanilla.montoCargue || 0
      const novedades = totals.fiado + totals.devoluciones + totals.repasos + totals.agotados + totals.erroresFacturacion + Number(formData.descuento || 0)
      const totalEsperadoCalculado = cargue - novedades + totalCobrosAsignados

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
  const handleExportarHistorial = async () => {
    try {
      setExportando(true)

      const response = await fetch(`/api/caja/exportar-historial?desde=${exportFechaDesde}&hasta=${exportFechaHasta}`)
      
      if (!response.ok) {
        throw new Error('Error al exportar')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `seguimiento_entregas_${exportFechaDesde}_${exportFechaHasta}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      toast({
        title: "Exportado",
        description: "El archivo se descargó correctamente",
      })
    } catch (error) {
      console.error('Error exportando:', error)
      toast({
        title: "Error",
        description: "No se pudo exportar el historial",
        variant: "destructive",
      })
    } finally {
      setExportando(false)
    }
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Caja - Cuadre de Cuentas</h1>
                  <p className="text-sm text-gray-500">Recepción y control de efectivo</p>
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
              variant={selectedView === "caja" ? "default" : "outline"}
              onClick={() => setSelectedView("caja")}
              size="sm"
            >
              <Wallet className="h-4 w-4 mr-2" />
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
              <DollarSign className="h-4 w-4 mr-2" />
              Comisiones
            </Button>
          </div>

          {selectedView === "comisiones" ? (
            <ComisionesView />
          ) : selectedView === "historial" ? (
            <Card className="p-6">
  <div className="flex justify-between items-center mb-4">
    <h2 className="text-lg font-semibold">Historial de Recepciones</h2>
    
    <div className="flex items-center gap-3">
      <Input
        type="date"
        value={exportFechaDesde}
        onChange={(e) => setExportFechaDesde(e.target.value)}
        className="w-[140px]"
      />
      <span className="text-sm text-gray-500">-</span>
      <Input
        type="date"
        value={exportFechaHasta}
        onChange={(e) => setExportFechaHasta(e.target.value)}
        className="w-[140px]"
      />
      <Button 
        onClick={handleExportarHistorial}
        disabled={exportando}
        size="sm"
        className="bg-green-600 hover:bg-green-700"
      >
        {exportando ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Exportando...
          </>
        ) : (
          <>
            <Calendar className="h-4 w-4 mr-2" />
            Exportar Excel
          </>
        )}
      </Button>
    </div>
  </div>
              {recepciones.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay recepciones registradas</p>
              ) : (
                <div className="space-y-4">
                  {recepciones.map((rec) => (
                    <Card key={rec.id} className="p-4 bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">
                              {rec.entregador} - {rec.tipo_ruta}
                            </p>
                            {rec.tipo === "agrupado" && (
                              <Badge variant="secondary">AGRUPADO</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">
                            {new Date(rec.fecha_recepcion).toLocaleString("es-CO")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
  <Badge variant={rec.estado === "cuadrado" ? "default" : "destructive"}>
    {rec.estado === "cuadrado" ? "Cuadrado" : "Con Diferencia"}
  </Badge>
  
    {rec.tipo === "agrupado" && (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        console.log('[CAJA] 🔍 rec.id:', rec.id, 'tipo:', typeof rec.id)
        
        // ✅ VALIDAR Y CONVERTIR A NÚMERO
        const cuadreId = Number(rec.id)
        
        if (!cuadreId || isNaN(cuadreId) || cuadreId <= 0) {
          console.error('[CAJA] ❌ ID inválido:', rec.id)
          toast({
            title: "Error",
            description: "ID de cuadre inválido",
            variant: "destructive"
          })
          return
        }
        
        console.log('[CAJA] ✅ Abriendo edición para cuadre ID:', cuadreId)
        setEditandoCuadreId(cuadreId)
      }}
      className="border-blue-300 text-blue-700 hover:bg-blue-50"
    >
      <Edit2 className="h-4 w-4 mr-1" />
      Editar
    </Button>
  )}
</div>
                      </div>

                      {/* Detalle de Novedades */}
                      {(rec.fiado || rec.devoluciones || rec.repasos || rec.agotados || rec.errores_facturacion || rec.descuento) && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs font-medium text-gray-600 mb-2">Detalle de Novedades:</p>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            {rec.fiado && Number(rec.fiado) > 0 && (
                              <div className="bg-orange-50 p-2 rounded">
                                <span className="text-orange-600 font-medium">Fiado</span>
                                <p className="font-bold">{formatCOP(Number(rec.fiado))}</p>
                              </div>
                            )}
                            {rec.devoluciones && Number(rec.devoluciones) > 0 && (
                              <div className="bg-red-50 p-2 rounded">
                                <span className="text-red-600 font-medium">Devoluciones</span>
                                <p className="font-bold">{formatCOP(Number(rec.devoluciones))}</p>
                              </div>
                            )}
                            {rec.repasos && Number(rec.repasos) > 0 && (
                              <div className="bg-blue-50 p-2 rounded">
                                <span className="text-blue-600 font-medium">Repasos</span>
                                <p className="font-bold">{formatCOP(Number(rec.repasos))}</p>
                              </div>
                            )}
                            {rec.agotados && Number(rec.agotados) > 0 && (
                              <div className="bg-gray-100 p-2 rounded">
                                <span className="text-gray-600 font-medium">Agotados</span>
                                <p className="font-bold">{formatCOP(Number(rec.agotados))}</p>
                              </div>
                            )}
                            {rec.errores_facturacion && Number(rec.errores_facturacion) > 0 && (
                              <div className="bg-orange-100 p-2 rounded">
                                <span className="text-orange-700 font-medium">Errores Fact.</span>
                                <p className="font-bold">{formatCOP(Number(rec.errores_facturacion))}</p>
                              </div>
                            )}
                            {rec.descuento && Number(rec.descuento) > 0 && (
                              <div className="bg-purple-50 p-2 rounded">
                                <span className="text-purple-600 font-medium">Descuentos</span>
                                <p className="font-bold">{formatCOP(Number(rec.descuento))}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

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

                      {rec.tiene_consignacion && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium text-gray-700 mb-1">Consignación</p>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">Número</span>
                              <p>{rec.numero_consignacion}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Banco</span>
                              <p>{rec.banco}</p>
                            </div>
                            <div>
                              <span className="text-gray-500">Monto</span>
                              <p className="font-semibold">
                                {formatCOP(Number(rec.total_consignado || rec.monto_consignacion || 0))}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {rec.descuento && Number(rec.descuento) > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm font-medium text-gray-700 mb-1">Descuento Aplicado</p>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-gray-500">Monto</span>
                              <p className="font-semibold text-purple-600">{formatCOP(Number(rec.descuento))}</p>
                            </div>
                            {rec.motivo_descuento && (
                              <div>
                                <span className="text-gray-500">Motivo</span>
                                <p>{rec.motivo_descuento}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {rec.observaciones && (
                        <div className="mt-3 pt-3 border-t">
                          <span className="text-gray-500 text-sm">Observaciones:</span>
                          <p className="text-sm">{rec.observaciones}</p>
                        </div>
                      )}

                      {rec.tipo === "agrupado" && rec.planillas_ids && (
                        <div className="mt-2 text-xs text-gray-500">
                          <span className="font-medium">Rutas Incluidas:</span>{" "}
                          {rec.planillas_ids.join(", ")}
                        </div>
                      )}
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

                  <Select value={filterEntregador} onValueChange={setFilterEntregador}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Entregador" />
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
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Ruta" />
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
                    <span className="text-xs text-orange-600 font-medium">{"Fiado (CxC)"}</span>
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

                {/* Cards interactivos de novedades por planilla */}
                {filteredRoutes.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-3 text-gray-700">Novedades por Tipo (Clicables)</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {filteredRoutes.map((route) => (
                        <div key={route.id} className="space-y-2">
                          <p className="text-xs text-gray-500 font-medium">Ruta {route.ruta}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <CardNovedadesInteractivo
                              planillaId={route.id}
                              tipo="agotado"
                              onNovedadActualizada={() => loadData()}
                            />
                            <CardNovedadesInteractivo
                              planillaId={route.id}
                              tipo="devolucion"
                              onNovedadActualizada={() => loadData()}
                            />
                            <CardNovedadesInteractivo
                              planillaId={route.id}
                              tipo="fiado_parcial"
                              onNovedadActualizada={() => loadData()}
                            />
                            <CardNovedadesInteractivo
                              planillaId={route.id}
                              tipo="error_facturacion"
                              onNovedadActualizada={() => loadData()}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Entregas Pendientes de Cuadrar</h2>
                {filteredRoutes.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
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
                      <span className="text-sm">Seleccionar todas ({filteredRoutes.length})</span>
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
                  <p className="text-gray-500 text-center py-8">
                    No hay entregas pendientes de cuadrar para la fecha seleccionada
                  </p>
                ) : (
                  <div className="space-y-4">
                    {filteredRoutes.map((route) => {
                      const totals = calculateRouteTotals(route)
                      const isSelected = selectedRoutes.includes(route.id)

                      return (
                        <Card key={route.id} className={`p-4 ${isSelected ? "ring-2 ring-blue-500" : ""}`}>
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
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-semibold">
                                    {route.entregador} - Ruta {route.ruta}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {route.totalOrders} pedidos · Fecha:{" "}
                                    {new Date(route.fecha).toLocaleDateString("es-CO")}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  <span className="text-xs text-gray-500">Reasignar a:</span>
                                  <Select
                                    disabled={reasignandoRuta === route.id}
                                    onValueChange={(value) => handleReasignarRuta(route.id, value)}
                                  >
                                    <SelectTrigger className="w-[140px] h-8">
                                      <SelectValue placeholder="Entregador" />
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
                                  <Button
                                    onClick={() => handleOpenNuevoPedidoModal(route)}
                                    variant="outline"
                                    size="sm"
                                    className="border-green-300 text-green-700 hover:bg-green-50"
                                  >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Nuevo Pedido
                                  </Button>
                                  <Button onClick={() => handleOpenModal(route)} size="sm">
                                    <DollarSign className="h-4 w-4 mr-1" />
                                    Recibir Efectivo
                                  </Button>
                                  <Button
                                    onClick={() => handleOpenCambiarFechaModal(route)}
                                    variant="outline"
                                    size="sm"
                                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                  >
                                    <Calendar className="h-4 w-4 mr-1" />
                                    Cambiar Fecha
                                  </Button>
                                  <Button
                                    onClick={() => handleOpenEliminarRutaModal(route)}
                                    variant="outline"
                                    size="sm"
                                    className="border-red-300 text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4 mr-1" />
                                    Eliminar Ruta
                                  </Button>
                                </div>
                              </div>

                              {/* Totales con mejor espaciado y fondos de colores */}
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

                              {/* Efectivo Esperado */}
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
                                               <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-medium text-sm">
                                                  {order.cliente}
                                                </p>
                                                 <BadgeNovedades pedidoId={order.id} />
                                                {order.esCobro ? (
                                                  <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-300">
                                                    COBRO
                                                  </Badge>
                                                ) : (
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
                                                )}
                                              </div>
                                              {/* Dropdown para reasignar pedido */}
                                              {!route.cuadradoEnCaja && (
                                                <div className="flex items-center gap-2 mt-1">
                                                  <span className="text-xs text-gray-500">
                                                    Reasignar pedido a:
                                                  </span>
                                                  <Select
                                                    disabled={reasignandoPedido === order.id}
                                                    onValueChange={(nuevaPlanillaId) => handleReasignarPedido(order.id, nuevaPlanillaId)}
                                                  >
                                                    <SelectTrigger className="w-[200px] h-7 text-xs">
                                                      <SelectValue placeholder="Seleccionar ruta" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {/* Rutas del mismo entregador */}
                                                      <SelectItem value="header-mismo-entregador" disabled className="font-semibold">
                                                        Rutas de {route.entregador}
                                                      </SelectItem>
                                                      {routeSheets
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
                                                        <SelectItem value="header-otros-entregadores" disabled className="font-semibold border-t mt-2 pt-2">
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
                                            <div className="mt-3 pt-3 border-t">
                                              <p className="text-xs text-gray-500 mb-2">
                                                Ajustes manuales: Edita &quot;Cant. Entregada&quot; para entregas
                                                parciales. Para promociones con precios especiales, ajusta el &quot;Subtotal&quot;
                                                directamente.
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
                                                              disabled={route.cuadradoEnCaja}
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
                                                            {!route.cuadradoEnCaja && !item.devuelto ? (
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
                                                            {!route.cuadradoEnCaja && !item.devuelto ? (
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

                                              {/* Campos de Descuento por Pedido */}
                                              <div className="mt-3 pt-3 border-t">
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
                                                      disabled={route.cuadradoEnCaja}
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
                                                      disabled={route.cuadradoEnCaja}
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

                                              {order.esCobro ? (
                                                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                                                  <div className="w-full mb-1 p-2 bg-purple-50 rounded text-xs text-purple-700 font-medium">
                                                    💰 Cobro de fiado — ¿qué pasó?
                                                  </div>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleOrderStatusChange(order.id, "entregado")}
                                                    className="flex-1 sm:flex-none border-green-400 text-green-700 hover:bg-green-50"
                                                    disabled={route.cuadradoEnCaja}
                                                  >
                                                    ✅ Cobrado (pagó todo)
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => { setSelectedCobro(order); setMontoAbonoCobro(""); setShowAbonoCobroModal(true) }}
                                                    className="flex-1 sm:flex-none border-amber-400 text-amber-700 hover:bg-amber-50"
                                                    disabled={route.cuadradoEnCaja}
                                                  >
                                                    💵 Abono parcial
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleNoPagoCobro(order.id, route.id)}
                                                    className="flex-1 sm:flex-none border-gray-400 text-gray-600 hover:bg-gray-50"
                                                    disabled={route.cuadradoEnCaja}
                                                  >
                                                    ↩️ No pagó
                                                  </Button>
                                                </div>
                                              ) : (
                                                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleOrderStatusChange(order.id, "fiado")}
                                                    className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50"
                                                    disabled={route.cuadradoEnCaja}
                                                  >
                                                    Fiado
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleOrderStatusChange(order.id, "repaso")}
                                                    className="flex-1 sm:flex-none border-blue-300 text-blue-700 hover:bg-blue-50"
                                                    disabled={route.cuadradoEnCaja}
                                                  >
                                                    Repaso
                                                  </Button>
                                                  <Button
                                                    variant="destructive"
                                                    size="sm"
                                                    onClick={() => handleOrderStatusChange(order.id, "devolucion")}
                                                    className="flex-1 sm:flex-none"
                                                    disabled={route.cuadradoEnCaja}
                                                  >
                                                    Devolución
                                                  </Button>
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleOpenEliminarPedidoModal(order.id, order.cliente, effectiveTotal, route.id)}
                                                    className="flex-1 sm:flex-none border-gray-400 text-gray-700 hover:bg-gray-100 hover:text-red-600 hover:border-red-400"
                                                    disabled={route.cuadradoEnCaja}
                                                  >
                                                    <Trash2 className="h-4 w-4 mr-1" />
                                                    Eliminar
                                                  </Button>
                                                </div>
                                              )}
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

      {/* Modal para recibir efectivo */}
      <Dialog open={showModal} onOpenChange={(open) => (open ? setShowModal(true) : handleCloseModal())}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recibir Efectivo</DialogTitle>
            <DialogDescription>
              {selectedPlanilla && `Ruta: ${selectedPlanilla.ruta} - ${selectedPlanilla.entregador}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Efectivo Recibido</Label>
              <Input
                value={formData.efectivoRecibido}
                onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
                type="number"
                className="col-span-1"
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                checked={formData.tieneConsignacion}
                onCheckedChange={(checked) => setFormData({ ...formData, tieneConsignacion: !!checked })}
              />
              <Label className="text-sm">¿Tiene consignación?</Label>
            </div>

            {formData.tieneConsignacion && (
              <>
                <div>
                  <Label>Número Consignación</Label>
                  <Input
                    value={formData.numeroConsignacion}
                    onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                    onBlur={handleConsignacionBlur}
                    className="col-span-1"
                    placeholder="Ej: 1234567890"
                  />
                </div>

                <div>
                  <Label>Banco</Label>
                  <Input
                    value={formData.banco}
                    onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                    className="col-span-1"
                    placeholder="Ej: Bancolombia"
                  />
                </div>

                <div>
                  <Label>Monto Consignación</Label>
                  <Input
                    value={formData.montoConsignacion}
                    onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                    type="number"
                    className="col-span-1"
                  />
                </div>

                <div>
                  <Label>Fecha Consignación</Label>
                  <Input
                    type="date"
                    value={formData.fechaConsignacion}
                    onChange={(e) => setFormData({ ...formData, fechaConsignacion: e.target.value })}
                    className="col-span-1"
                  />
                </div>
              </>
            )}

            {/* DESCUENTOS */}
            <div>
              <Label>Descuento Aplicado</Label>
              <Input
                value={formData.descuento}
                onChange={(e) => setFormData({ ...formData, descuento: e.target.value })}
                type="number"
                min="0"
                className="col-span-1"
                placeholder="0"
              />
            </div>

            {formData.descuento && Number(formData.descuento) > 0 && (
              <div>
                <Label>Motivo del Descuento</Label>
                <Textarea
                  value={formData.motivoDescuento}
                  onChange={(e) => setFormData({ ...formData, motivoDescuento: e.target.value })}
                  className="col-span-1"
                  rows={2}
                  placeholder="Ej: Promoción, avería, etc."
                />
              </div>
            )}

            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                className="col-span-1"
                rows={3}
              />
            </div>

            {selectedPlanilla && (
              <FiadosAsignadosSection
                planillaId={selectedPlanilla.id}
                entregador={selectedPlanilla.entregador}
                onTotalCobrosChange={setTotalCobrosAsignados}
              />
            )}

            {selectedPlanilla && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Resumen de la Ruta:</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Cargue</span>
                    <p className="font-semibold">{formatCOP(selectedPlanilla.montoCargue || 0)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Entregado</span>
                    <p className="font-semibold text-green-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).entregado)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Fiado</span>
                    <p className="font-semibold text-orange-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).fiado)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Devoluciones</span>
                    <p className="font-semibold text-red-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).devoluciones)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Repasos (del día)</span>
                    <p className="font-semibold text-blue-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).repasos)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Agotados</span>
                    <p className="font-semibold text-gray-600">
                      {formatCOP(calculateRouteTotals(selectedPlanilla).agotados)}
                    </p>
                  </div>
                  {totalCobrosAsignados > 0 && (
                    <div>
                      <span className="text-gray-500">Cobros Fiados</span>
                      <p className="font-semibold text-amber-600">+ {formatCOP(totalCobrosAsignados)}</p>
                    </div>
                  )}

                  <div className="col-span-2 border-t pt-2 mt-2">
                    <span className="text-gray-500">Efectivo Esperado</span>
                    {(() => {
                      const totals = calculateRouteTotals(selectedPlanilla)
                      const efectivoEsperado = totals.entregado + totalCobrosAsignados
                      
                      return (
                        <p className="font-bold text-lg text-green-600">
                          {formatCOP(efectivoEsperado)}
                        </p>
                      )
                    })()}
                  </div>

                  <div className="col-span-2">
                    <span className="text-gray-500">Diferencia</span>
                    {(() => {
                      const totals = calculateRouteTotals(selectedPlanilla)
                      const efectivoEsperado = totals.entregado + totalCobrosAsignados
                      const totalRecibido = Number(formData.efectivoRecibido || 0) + (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0)
                      const diferencia = Math.round((totalRecibido - efectivoEsperado) * 100) / 100
                      return (
                        <p className={`font-semibold ${diferencia !== 0 ? "text-red-600" : "text-green-600"}`}>
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
            <Button onClick={handleSubmit} disabled={submitting}>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuadre Agrupado - Manual</DialogTitle>
            <DialogDescription>
              Estás cuadrando {agrupadoData?.totalRutas} rutas para: {agrupadoData?.entregador}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Sección de Novedades - TODOS EDITABLES */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold text-sm mb-3">📊 Novedades (Editable)</h3>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-orange-600 font-medium">Fiados</Label>
                  <Input
                    type="number"
                    value={formData.fiados}
                    onChange={(e) => setFormData({ ...formData, fiados: e.target.value })}
                    className="mt-1 font-semibold"
                  />
                </div>

                <div>
                  <Label className="text-xs text-blue-600 font-medium">Repasos</Label>
                  <Input
                    type="number"
                    value={formData.repasos}
                    onChange={(e) => setFormData({ ...formData, repasos: e.target.value })}
                    className="mt-1 font-semibold"
                  />
                </div>

                <div>
                  <Label className="text-xs text-red-600 font-medium">Devoluciones</Label>
                  <Input
                    type="number"
                    value={formData.devolucionesParciales}
                    onChange={(e) => setFormData({ ...formData, devolucionesParciales: e.target.value })}
                    className="mt-1 font-semibold border-red-300"
                  />
                </div>

                <div>
                  <Label className="text-xs text-gray-600 font-medium">Agotados</Label>
                  <Input
                    type="number"
                    value={formData.agotados}
                    onChange={(e) => setFormData({ ...formData, agotados: e.target.value })}
                    className="mt-1 font-semibold border-gray-300"
                  />
                </div>

                <div>
                  <Label className="text-xs text-orange-700 font-medium">Errores Facturación</Label>
                  <Input
                    id="erroresFactAgrupado"
                    type="number"
                    defaultValue={agrupadoData?.totales?.erroresFacturacion || 0}
                    onChange={(e) => {
                      // Guardar en formData si lo necesitas
                    }}
                    className="mt-1 font-semibold border-orange-300"
                  />
                </div>

                <div>
                  <Label className="text-xs text-purple-600 font-medium">Descuentos</Label>
                  <Input
                    type="number"
                    value={formData.descuento}
                    onChange={(e) => setFormData({ ...formData, descuento: e.target.value })}
                    className="mt-1 font-semibold border-purple-300"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-3">
                💡 Tip: Los valores están pre-cargados con las novedades registradas. Puedes editarlos si necesitas ajustar manualmente.
              </p>
            </div>

            {/* Efectivo y Consignación */}
            <div className="space-y-4">
              <div>
                <Label>Efectivo Recibido</Label>
                <Input
                  value={formData.efectivoRecibido}
                  onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
                  type="number"
                  className="col-span-1 font-bold text-lg"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  checked={formData.tieneConsignacion}
                  onCheckedChange={(checked) => setFormData({ ...formData, tieneConsignacion: !!checked })}
                />
                <Label className="text-sm">¿Tiene consignación?</Label>
              </div>

              {formData.tieneConsignacion && (
                <>
                  <div>
                    <Label>Número Consignación</Label>
                    <Input
                      value={formData.numeroConsignacion}
                      onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                      onBlur={handleConsignacionBlur}
                      className="col-span-1"
                      placeholder="Ej: 1234567890"
                    />
                  </div>

                  <div>
                    <Label>Banco</Label>
                    <Input
                      value={formData.banco}
                      onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                      className="col-span-1"
                      placeholder="Ej: Bancolombia"
                    />
                  </div>

                  <div>
                    <Label>Monto Consignación</Label>
                    <Input
                      value={formData.montoConsignacion}
                      onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                      type="number"
                      className="col-span-1"
                    />
                  </div>
                </>
              )}

              <div>
                <Label>Observaciones</Label>
                <Textarea
                  value={formData.observaciones}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  className="col-span-1"
                  rows={3}
                />
              </div>
            </div>

            {/* Resumen Final */}
            <div className="border-t pt-4 grid grid-cols-3 gap-4 text-sm">
              <div className="text-center p-2 bg-blue-50 rounded">
                <span className="text-xs text-blue-600 font-medium">Cargue Total</span>
                <p className="font-bold text-blue-700">{formatCOP(agrupadoData?.totales.cargue || 0)}</p>
              </div>
              <div className="text-center p-2 bg-red-50 rounded">
                <span className="text-xs text-red-600 font-medium">Total Novedades</span>
                <p className="font-bold text-red-700">
                  {formatCOP(
                    (Number(formData.fiados) || 0) +
                    (Number(formData.repasos) || 0) +
                    (Number(formData.devolucionesParciales) || 0) +
                    (Number(formData.agotados) || 0) +
                    (Number(formData.descuento) || 0) +
                    (Number((document.getElementById('erroresFactAgrupado') as HTMLInputElement)?.value) || 0)
                  )}
                </p>
              </div>
              <div className="text-center p-2 bg-green-50 rounded">
                <span className="text-xs text-green-600 font-medium">Efectivo Esperado</span>
                <p className="font-bold text-green-700">
                  {formatCOP(agrupadoData?.totales.entregado || 0)}
                </p>
              </div>
            </div>

            <div className="border-t pt-4 flex justify-between items-center">
              <span className="font-semibold">Diferencia:</span>
              {(() => {
                const esperado = agrupadoData?.totales.entregado || 0
                const recibido = Number(formData.efectivoRecibido || 0) + (formData.tieneConsignacion ? Number(formData.montoConsignacion || 0) : 0)
                const diferencia = recibido - esperado
                return (
                  <span className={`font-bold text-lg ${diferencia !== 0 ? "text-red-600" : "text-green-600"}`}>
                    {diferencia > 0 ? '+' : ''}{formatCOP(diferencia)}
                  </span>
                )
              })()}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAgrupadoModal(false)
                setAgrupadoData(null)
              }}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmitAgrupado} disabled={submitting}>
              {submitting ? "Guardando..." : "Confirmar Cuadre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para agregar nuevo pedido */}
      <Dialog
        open={showNuevoPedidoModal}
        onOpenChange={(open) => (open ? setShowNuevoPedidoModal(true) : handleCloseNuevoPedidoModal())}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Pedido</DialogTitle>
            <DialogDescription>Agregar un nuevo pedido a la ruta: {rutaParaNuevoPedido?.ruta}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Cliente</Label>
              <Input
                value={nuevoPedidoData.cliente}
                onChange={(e) => setNuevoPedidoData({ ...nuevoPedidoData, cliente: e.target.value })}
                className="col-span-1"
                placeholder="Nombre del cliente"
              />
            </div>

            <div>
              <Label>Observaciones</Label>
              <Textarea
                value={nuevoPedidoData.observaciones}
                onChange={(e) => setNuevoPedidoData({ ...nuevoPedidoData, observaciones: e.target.value })}
                className="col-span-1"
                rows={3}
                placeholder="Notas adicionales sobre el pedido"
              />
            </div>

            <Label>Productos del Pedido</Label>
            <div className="space-y-2">
              {productosNuevoPedido.map((producto) => (
                <div key={producto.id} className="grid grid-cols-12 gap-2 items-center">
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
                    type="number"
                    placeholder="Cant."
                    value={producto.cantidad}
                    onChange={(e) => actualizarProducto(producto.id, "cantidad", Number.parseInt(e.target.value) || 1)}
                    className="col-span-1 text-xs text-right"
                  />
                  <Input
                    type="number"
                    placeholder="Precio Unit."
                    value={producto.precioUnitario}
                    onChange={(e) =>
                      actualizarProducto(producto.id, "precioUnitario", Number.parseFloat(e.target.value) || 0)
                    }
                    className="col-span-1 text-xs text-right"
                  />
                  <span className="col-span-2 text-xs font-semibold text-right">
                    {formatCOP(producto.subtotal)}
                  </span>
                  <Button variant="ghost" size="sm" className="col-span-1" onClick={() => eliminarProducto(producto.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={agregarProducto}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar Otro Producto
            </Button>

            <div className="text-right font-bold text-lg">
              Total Pedido: {formatCOP(calcularTotalNuevoPedido())}
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSubmitNuevoPedido} disabled={submittingNuevoPedido}>
              {submittingNuevoPedido ? "Creando..." : "Crear Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Fiado Parcial - CORREGIDO */}
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

                {/* Mostrar si hay diferencia con el total original */}
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
                  Nota: El pedido se marcará como &quot;Fiado&quot; y se registrará el monto pagado.
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

      {/* Modal para confirmar eliminación de pedido */}
      <Dialog open={showEliminarPedidoModal} onOpenChange={setShowEliminarPedidoModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar Pedido</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. El pedido será eliminado permanentemente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {pedidoAEliminar && (
              <>
                <div className="p-4 bg-red-50 border border-red-200 rounded">
                  <p className="font-medium text-red-800">
                    Cliente: {pedidoAEliminar.cliente}
                  </p>
                  <p className="text-sm text-red-600">
                    Total del pedido: {formatCOP(pedidoAEliminar.total)}
                  </p>
                </div>

                <p className="text-sm text-gray-600">
                  Importante: Al eliminar este pedido, el total del cargue de la ruta se reducirá
                  automáticamente en {formatCOP(pedidoAEliminar.total)}.
                </p>
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
            <Button variant="destructive" onClick={handleEliminarPedido} disabled={eliminandoPedido}>
              {eliminandoPedido ? "Eliminando..." : "Eliminar Pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para confirmar eliminación de ruta completa */}
      <Dialog open={showEliminarRutaModal} onOpenChange={setShowEliminarRutaModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar Ruta Completa</DialogTitle>
            <DialogDescription>
              Esta accion eliminara la ruta y todos sus pedidos permanentemente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {rutaAEliminar && (
              <>
                <div className="p-4 bg-red-50 border border-red-200 rounded space-y-1">
                  <p className="font-medium text-red-800">
                    Ruta: {rutaAEliminar.nombre}
                  </p>
                  <p className="text-sm text-red-700">
                    Entregador: {rutaAEliminar.entregador}
                  </p>
                  <p className="text-sm text-red-700">
                    Fecha: {new Date(rutaAEliminar.fecha).toLocaleDateString("es-CO")}
                  </p>
                  <p className="text-sm text-red-700">
                    Pedidos: {rutaAEliminar.totalPedidos}
                  </p>
                  <p className="text-sm text-red-700">
                    Total Cargue: {formatCOP(rutaAEliminar.totalCargue)}
                  </p>
                </div>

                {rutaAEliminar.totalPedidos > 0 && (
                  <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded border border-amber-200">
                    Advertencia: Esta ruta tiene {rutaAEliminar.totalPedidos} pedido(s).
                    Al eliminarla, todos los pedidos seran eliminados tambien.
                  </p>
                )}

                {rutaAEliminar.totalPedidos === 0 && (
                  <p className="text-sm text-green-600 bg-green-50 p-3 rounded border border-green-200">
                    Esta ruta esta vacia y puede ser eliminada sin afectar pedidos.
                  </p>
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
            <Button variant="destructive" onClick={handleEliminarRuta} disabled={eliminandoRuta}>
              {eliminandoRuta ? "Eliminando..." : "Eliminar Ruta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para cambiar fecha de ruta */}
      <Dialog open={showCambiarFechaModal} onOpenChange={setShowCambiarFechaModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cambiar Fecha de Ruta</DialogTitle>
            <DialogDescription>
              Selecciona la nueva fecha para esta ruta de entrega.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {rutaParaCambiarFecha && (
              <>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded space-y-1">
                  <p className="font-medium text-blue-800">
                    Ruta: {rutaParaCambiarFecha.nombre}
                  </p>
                  <p className="text-sm text-blue-700">
                    Fecha actual: {new Date(rutaParaCambiarFecha.fechaActual).toLocaleDateString("es-CO")}
                  </p>
                </div>

                <div>
                  <Label>Nueva Fecha</Label>
                  <Input
                    type="date"
                    value={nuevaFechaRuta}
                    onChange={(e) => setNuevaFechaRuta(e.target.value)}
                  />
                </div>

                <p className="text-xs text-gray-500">
                  Usa esta opcion cuando una ruta se crea un dia pero se entrega en otro.
                </p>
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
            <Button onClick={handleCambiarFechaRuta} disabled={cambiandoFecha}>
              {cambiandoFecha ? "Guardando..." : "Guardar Fecha"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Modal para abono de cobro */}
      <Dialog open={showAbonoCobroModal} onOpenChange={setShowAbonoCobroModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Abono de Cobro</DialogTitle>
            <DialogDescription>
              {selectedCobro && `Cliente: ${selectedCobro.cliente}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedCobro && (
              <>
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded border border-purple-200">
                  <span className="text-sm text-purple-700">Monto total del cobro:</span>
                  <span className="font-bold text-lg text-purple-700">{formatCOP(selectedCobro.total)}</span>
                </div>
                <div>
                  <Label htmlFor="montoAbonoCobro">¿Cuánto abonó?</Label>
                  <Input
                    id="montoAbonoCobro"
                    type="number"
                    min={1}
                    max={selectedCobro.total}
                    value={montoAbonoCobro}
                    onChange={(e) => setMontoAbonoCobro(e.target.value)}
                    placeholder="0"
                    autoFocus
                  />
                </div>
                {montoAbonoCobro && Number(montoAbonoCobro) > 0 && (
                  <div className="flex justify-between items-center p-3 bg-amber-50 rounded border border-amber-200">
                    <span className="text-sm text-amber-700 font-medium">Saldo que queda:</span>
                    <span className="font-bold text-lg text-amber-700">
                      {formatCOP(selectedCobro.total - Number(montoAbonoCobro))}
                    </span>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  El abono se registrará en el fiado original y el cobro quedará procesado.
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAbonoCobroModal(false)} disabled={submittingAbonoCobro}>
              Cancelar
            </Button>
            <Button onClick={handleAbonarCobro} disabled={submittingAbonoCobro}>
              {submittingAbonoCobro ? "Registrando..." : "Confirmar Abono"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Modal de edición de cuadres */}
      {editandoCuadreId && (
        <CuadreEditModal
          cuadreId={editandoCuadreId}
          onClose={() => setEditandoCuadreId(null)}
          onSuccess={() => {
            setEditandoCuadreId(null)
            loadHistorial()
          }}
        />
      )}
    </>
  )
}
