"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DollarSign, LogOut, Filter, Wallet, History, Calendar, ChevronDown, ChevronUp, Plus, X, Trash2, Edit2 } from "lucide-react"
import type { RouteSheet, User, RecepcionCaja, Order } from "@/lib/types"
import { formatCOP, getFechaHoyBogota } from "@/lib/format-utils"
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
  const [todosEntregadores, setTodosEntregadores] = useState<string[]>([])

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
    billetes: "",
    monedas: "",
    observaciones: "",
    descuento: "",
    motivoDescuento: "",
    varios: "",
    motivoVarios: "",
    devolucionesParciales: "",
    devolucionesCompletas: "",
    repasos: "",
    fiados: "",
    agotados: "",
    erroresFacturacion: "",
  })
  const [consignaciones, setConsignaciones] = useState<Array<{id: string; banco: string; numero: string; monto: string; fecha: string; cliente: string; numero_factura: string; origenConsignacionId?: number}>>([])
  // Referencias (consignaciones + cobros CxC) que ya existen en la BD — un solo set,
  // porque el endpoint de validación ya las busca juntas en una sola consulta.
  const [duplicadosBD, setDuplicadosBD] = useState<Set<string>>(new Set())
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

  // Modal de novedad unificado en caja
  const [showNovedadCajaModal, setShowNovedadCajaModal] = useState(false)
  const [novedadCajaOrder, setNovedadCajaOrder] = useState<any>(null)
  const [novedadCajaTipo, setNovedadCajaTipo] = useState<"fiado" | "devolucion" | "agotado" | "descuento" | null>(null)
  const [novedadCajaMonto, setNovedadCajaMonto] = useState("")
  const [submittingNovedadCaja, setSubmittingNovedadCaja] = useState(false)

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
  const [selectedCobro, setSelectedCobro] = useState<any | null>(null)
  const [montoEfectivoCobro, setMontoEfectivoCobro] = useState("")
  const [montoNequiCobro, setMontoNequiCobro] = useState("")
  const [referenciaNequiCobro, setReferenciaNequiCobro] = useState("")
  const [submittingAbonoCobro, setSubmittingAbonoCobro] = useState(false)
  const [cobrosDisponibles, setCobrosDisponibles] = useState<any[]>([])
  const [cobrosVinculados, setCobrosVinculados] = useState<any[]>([])
  const [busquedaCobro, setBusquedaCobro] = useState("")
  const [loadingCobros, setLoadingCobros] = useState(false)
  const [autocompleteClienteConsAbierto, setAutocompleteClienteConsAbierto] = useState<string | null>(null)

  // Clientes de las planillas que se están cuadrando — fuente para el autocomplete de consignaciones
  const clientesAgrupadoData = useMemo(() => {
    const nombres = new Set<string>()
    ;(agrupadoData?.planillas || []).forEach((p: RouteSheet) => {
      ;(p.orders || []).forEach((o) => {
        if (o.cliente) nombres.add(o.cliente)
      })
    })
    return Array.from(nombres).sort()
  }, [agrupadoData])

  useEffect(() => {
    loadData()
  }, [])

  // ✅ Guardar borrador automáticamente cuando cambian consignaciones, cobros o montos
  // Solo mientras el modal agrupado está realmente abierto — de lo contrario, abrir/cerrar
  // el modal de cuadre individual (que reutiliza estas mismas variables) sobrescribe el
  // borrador guardado con un estado vacío, aunque el usuario ya haya cerrado el agrupado.
  useEffect(() => {
    if (!agrupadoData || !showAgrupadoModal) return
    const clave = `cuadre_borrador_${agrupadoData.entregador}`
    const borrador = {
      consignaciones,
      cobrosVinculados,
      billetes: formData.billetes,
      monedas: formData.monedas,
      observaciones: formData.observaciones,
      planillaIds: agrupadoData.planillaIds,
      guardadoEn: Date.now(),
    }
    localStorage.setItem(clave, JSON.stringify(borrador))
  }, [consignaciones, cobrosVinculados, formData.billetes, formData.monedas, formData.observaciones, agrupadoData, showAgrupadoModal])

  useEffect(() => {
    fetch("/api/entregadores")
      .then(r => r.json())
      .then(data => {
        const nombres = (data.entregadores || []).map((e: any) => e.nombre)
        setTodosEntregadores(nombres)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (selectedView === "historial") {
      loadHistorial()
    }
  }, [selectedView])

  // ─────────────────────────────────────────────────────────────────────────
  // FIX 1: reloadNovedades con delay — evita condición de carrera entre
  // la escritura en BD al validar una novedad y el fetch de novedades.
  // Se usa en onNovedadActualizada de CardNovedadesInteractivo en lugar
  // de loadData() completo, recargando solo la planilla afectada.
  // ─────────────────────────────────────────────────────────────────────────
  const reloadNovedades = async (planillaId?: number) => {
    // Delay para que BD confirme la escritura antes de leer
    await new Promise(resolve => setTimeout(resolve, 400))
    if (planillaId) {
      try {
        const response = await fetch(`/api/novedades?planillaId=${planillaId}`)
        if (response.ok) {
          const data = await response.json()
          setNovedadesPorPlanilla(prev => ({ ...prev, [planillaId]: data.novedades || [] }))
        }
      } catch (error) {
        console.error("[CAJA] Error recargando novedades planilla", planillaId, error)
      }
    } else {
      // Fallback: recargar todas
      setRouteSheets(prev => {
        Promise.all(prev.map(async (planilla) => {
          try {
            const r = await fetch(`/api/novedades?planillaId=${planilla.id}`)
            if (r.ok) return [planilla.id, (await r.json()).novedades || []] as [number, NovedadPedido[]]
          } catch {}
          return [planilla.id, []] as [number, NovedadPedido[]]
        })).then(results => {
          const map: Record<number, NovedadPedido[]> = {}
          results.forEach(([id, novs]) => { map[id] = novs })
          setNovedadesPorPlanilla(map)
        })
        return prev
      })
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
      setExpandedRoutes(new Set(planillas.map((p: any) => p.id)))

      // ✅ Una sola petición para todas las novedades
      const novedadesMap: Record<number, NovedadPedido[]> = {}
      if (planillas.length > 0) {
        try {
          const ids = planillas.map(p => p.id).join(",")
          const novedadesRes = await fetch(`/api/novedades?planillaIds=${ids}`)
          if (novedadesRes.ok) {
            const novedadesData = await novedadesRes.json()
            const todas = novedadesData.novedades || []
            todas.forEach((n: any) => {
              if (!novedadesMap[n.planilla_id]) novedadesMap[n.planilla_id] = []
              novedadesMap[n.planilla_id].push(n)
            })
          }
        } catch (error) {
          console.error("[CAJA] Error cargando novedades:", error)
        }
      }
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

  // Normaliza cualquier fecha/timestamp de Neon a ISO válido para Colombia
  // created_at llega como "2026-06-09 21:55:13.481" (sin T) — inválido en algunos engines
  // fecha_cuadre llega como "2026-06-09" (date puro) — JS lo interpreta UTC → día anterior en CO
  const parseFechaCuadre = (created_at?: string, fecha_cuadre?: string): string => {
    if (created_at) {
      const iso = created_at.includes("T") ? created_at : created_at.replace(" ", "T")
      const d = new Date(iso)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    if (fecha_cuadre) {
      // Forzar mediodía Colombia (UTC-5) para evitar drift por interpretación UTC
      const d = new Date(fecha_cuadre + "T12:00:00-05:00")
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    return new Date().toISOString()
  }

  async function loadHistorial() {
    try {
      const responseAgrupados = await fetch("/api/cuadres-caja")
      const dataAgrupados = await responseAgrupados.json()

      const cuadresAgrupados = Array.isArray(dataAgrupados.cuadres)
        ? dataAgrupados.cuadres.map((c: any) => {
            const numRutas = Array.isArray(c.planillas_ids) ? c.planillas_ids.length : 0
            const tipoRutaDisplay =
              c.rutas_nombres && Array.isArray(c.rutas_nombres) && c.rutas_nombres.length > 0
                ? c.rutas_nombres.join(", ")
                : numRutas > 1
                  ? `${numRutas} rutas agrupadas`
                  : "1 ruta"

            return {
              ...c,
              tipo: "agrupado",
              fecha_recepcion: parseFechaCuadre(c.created_at, c.fecha_cuadre),
              efectivo_esperado: c.total_esperado,
              efectivo_recibido: c.total_efectivo,
              diferencia_efectivo: c.diferencia,
              tipo_ruta: tipoRutaDisplay,
              monto_consignacion:
                c.total_consignado !== null && c.total_consignado !== undefined
                  ? c.total_consignado
                  : 0,
            }
          })
        : []

      const todosLosCuadres = cuadresAgrupados.sort(
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
    (s) => (s.estado === 'alistado' || s.estado === 'completado' || s.estado === 'en_ruta') && !s.cuadradoEnCaja
  )

  const entregadores = todosEntregadores.length > 0
  ? todosEntregadores
  : Array.from(new Set(completedRoutes.map((r) => r.entregador).filter(Boolean))) as string[]
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
  // Calcula saldo disponible del pedido descontando novedades ya registradas
  const calcularSaldoDisponibleCaja = (order: any): number => {
    const totalOriginal = calculateOrderEffectiveTotal(order)
    const todasNovedades = Object.values(novedadesPorPlanilla).flat() as any[]
    let totalNovedades = 0
    todasNovedades
      .filter((n: any) => n.pedido_id === order.id)
      .forEach((n: any) => {
        const monto = Number(n.monto_novedad) || 0
        switch (n.tipo_novedad) {
          case "devolucion":
          case "agotado":
          case "descuento":
            totalNovedades += monto
            break
          case "fiado_parcial":
          case "fiado":
            totalNovedades += monto + (Number(n.monto_pagado) || 0)
            break
        }
      })
    return Math.max(0, totalOriginal - totalNovedades)
  }

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

    // ✅ Si caja ajustó el total manualmente, usar el total de BD
    const totalBD = Number(order.total) || 0
    if (totalBD > 0 && Math.abs(totalBD - effectiveTotal) > 1) {
      effectiveTotal = totalBD
    }

    return Math.round(effectiveTotal * 100) / 100
  }

  // FIX: Una sola fuente de verdad por pedido.
  // Si tiene novedades validadas → usar novedades (entregador registro).
  // Si no → usar estado del pedido (caja opero manualmente).
  const calculateRouteTotals = (route: RouteSheet | null) => {
    if (!route || !Array.isArray(route.orders)) {
      return { entregado: 0, fiado: 0, devoluciones: 0, repasos: 0, agotados: 0, erroresFacturacion: 0 }
    }

    let entregado = 0
    let fiado = 0
    let devoluciones = 0
    let repasos = 0
    let agotados = 0
    let erroresFacturacion = 0

    const todasNovedades = novedadesPorPlanilla[route.id] || []
    const pedidoIds = new Set(route.orders.map((o) => o?.id))

    route.orders.forEach((order) => {
      if (!order || !Array.isArray(order.items)) return

      const novedadesDelPedido = todasNovedades.filter(
      (n) => n.pedido_id === order.id
      )

            if (novedadesDelPedido.length > 0) {
        // ── CANAL NOVEDADES: entregador registro y caja valido ──
        // PRIMERO: Calcular el total real del pedido
        let totalPedido = 0
        let devolucionesEnItems = 0
        let erroresEnItems = 0

        order.items.forEach((item) => {
          if (!item) return
          const cantOriginal = Number(item.cantidad) || 0
          const precioUnit = Number(item.valorUnidad) || 0
          const subtotalOriginal = cantOriginal * precioUnit

          if (item.motivoAjuste === 'error_facturacion') {
            erroresEnItems += subtotalOriginal
            return
          }
          if (item.motivoAjuste === 'devuelto' || item.devuelto) {
            devolucionesEnItems += subtotalOriginal
            return
          }
          const cantEntregada =
            item.cantidadEntregada !== null && item.cantidadEntregada !== undefined
              ? Number(item.cantidadEntregada)
              : cantOriginal
          if (cantEntregada === 0) return

          const subtotalReal =
            item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
              ? Number(item.subtotalAjustado)
              : cantEntregada * precioUnit
          totalPedido += subtotalReal
        })

        devoluciones += devolucionesEnItems
        erroresFacturacion += erroresEnItems

        // SEGUNDO: Procesar novedades y calcular cuánto se resta
        let totalNovedades = 0
        novedadesDelPedido.forEach((novedad) => {
          const monto = Number(novedad.monto_novedad) || 0
          switch (novedad.tipo_novedad) {
            case "agotado":
              agotados += monto
              totalNovedades += monto
              break
            case "devolucion":
              devoluciones += monto
              totalNovedades += monto
              break
            case "fiado_parcial":
              const montoPagadoNov = Number(novedad.monto_pagado) || 0
              fiado += monto
              entregado += montoPagadoNov
              totalNovedades += monto + montoPagadoNov
              break
            case "error_facturacion":
              erroresFacturacion += monto
              totalNovedades += monto
              break
          }
        })

        // TERCERO: Entregado es total del pedido menos novedades
        const entregadoDelPedido = totalPedido - totalNovedades

        // FIX: Si el pedido tiene estado especial (fiado/repaso/devolucion) en BD
        // pero NO hay novedad del tipo correspondiente (solo hay agotados/devoluciones),
        // contabilizarlo correctamente según su estado.
        const tieneNovedadFiado    = novedadesDelPedido.some(n => n.tipo_novedad === 'fiado_parcial')
        const tieneNovedadAgotado  = novedadesDelPedido.some(n => n.tipo_novedad === 'agotado')
        const tieneNovedadDevolucion = novedadesDelPedido.some(n => n.tipo_novedad === 'devolucion')

        if (!tieneNovedadFiado && order.estado === 'fiado') {
          const montoPagadoReal = Number(order.montoPagado) || 0
          const saldoFiado = Number(order.saldoPendiente) || (entregadoDelPedido - montoPagadoReal)
          if (saldoFiado > 0) {
            fiado += saldoFiado
            entregado += montoPagadoReal
          } else if (montoPagadoReal > 0) {
            entregado += montoPagadoReal
          }
        } else if (!tieneNovedadFiado && order.estado === 'repaso') {
          repasos += entregadoDelPedido
        } else if (!tieneNovedadAgotado && !tieneNovedadDevolucion && order.estado === 'devolucion') {
          devoluciones += entregadoDelPedido
        } else if (!tieneNovedadFiado && entregadoDelPedido > 0) {
          // Con agotado o devolución parcial: el resto sí se entregó
          entregado += entregadoDelPedido
          if (order.descuento) entregado -= Number(order.descuento)
        }
      } else {
        // ── CANAL PEDIDO: sin novedad validada, caja opera normal ──
        let effectiveTotal = 0
        let returnedTotal = 0
        let erroresEnPedido = 0
        let agotadosEnPedido = 0

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
          if (cantEntregada === 0 && item.estadoProducto === 'agotado') {
             agotadosEnPedido += subtotalOriginal
             return
          }
          if (cantEntregada === 0 && item.estadoProducto !== 'agotado') {
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
          const saldoFiado = Number(order.saldoPendiente) || (effectiveTotal - montoPagadoReal)
          fiado += saldoFiado
          entregado += montoPagadoReal
        } else if (order.estado === "repaso") {
          repasos += effectiveTotal
        } else if (order.estado === "devolucion") {
          devoluciones += effectiveTotal
        } else {
          entregado += effectiveTotal
          if (order.descuento) entregado -= Number(order.descuento)
        }
      }
    })

    // Novedades validadas cuyo pedido_id no existe en esta planilla (casos edge)
    todasNovedades
      .filter((n) => !pedidoIds.has(n.pedido_id))
      .forEach((novedad) => {
        const monto = Number(novedad.monto_novedad) || 0
        switch (novedad.tipo_novedad) {
          case "agotado": agotados += monto; break
          case "devolucion": devoluciones += monto; break
          case "error_facturacion": erroresFacturacion += monto; break
          case "fiado_parcial":
            fiado += monto - (Number(novedad.monto_pagado) || 0)
            entregado += Number(novedad.monto_pagado) || 0
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
                ? { ...o, estado: "pagado" }
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
    setCobrosVinculados([])
    setBusquedaCobro("")
    setConsignaciones([])
    setFormData({
      billetes: "",
      monedas: "",
      observaciones: "",
      descuento: "",
      motivoDescuento: "",
      varios: "",
      motivoVarios: "",
      devolucionesParciales: totals.devoluciones.toString(),
      devolucionesCompletas: "0",
      repasos: totals.repasos.toString(),
      fiados: totals.fiado.toString(),
      agotados: totals.agotados.toString(),
      erroresFacturacion: totals.erroresFacturacion?.toString() || "0",
    })
    loadCobrosDisponibles(planilla.entregador)
    setShowModal(true)
  }

  const agregarConsignacion = () => {
    setConsignaciones(prev => [...prev, {
      id: crypto.randomUUID(),
      banco: "",
      numero: "",
      monto: "",
      fecha: new Date().toISOString().split("T")[0],
      cliente: "",
      numero_factura: "",
    }])
  }

  const eliminarConsignacion = (id: string) => {
    setConsignaciones(prev => prev.filter(c => c.id !== id))
  }

  const actualizarConsignacion = (id: string, campo: string, valor: string) => {
    setConsignaciones(prev => prev.map(c => c.id === id ? { ...c, [campo]: valor } : c))
  }

  // ✅ Referencias repetidas DENTRO del cuadre que se está armando — cruza consignaciones
  // contra cobros CxC (antes cada lista solo se comparaba consigo misma, así que usar la
  // misma referencia en una consignación y en un cobro no se detectaba).
  const referenciasRepetidasEnForm = useMemo(() => {
    const contador = new Map<string, number>()
    consignaciones.forEach(c => {
      const n = c.numero.trim().toLowerCase()
      if (n) contador.set(n, (contador.get(n) || 0) + 1)
    })
    cobrosVinculados.forEach(c => {
      const n = (c.numeroReferencia || "").trim().toLowerCase()
      if (n) contador.set(n, (contador.get(n) || 0) + 1)
    })
    return new Set(Array.from(contador.entries()).filter(([, count]) => count > 1).map(([n]) => n))
  }, [consignaciones, cobrosVinculados])

  // ✅ Validar duplicados en BD con un solo debounce/consulta para consignaciones y
  // cobros CxC juntos — el endpoint ya las busca combinadas, así que separarlas en dos
  // efectos solo duplicaba la llamada de red sin aportar nada.
  useEffect(() => {
    const numeros = Array.from(new Set([
      ...consignaciones.map(c => c.numero.trim()),
      ...cobrosVinculados.map(c => (c.numeroReferencia || "").trim()),
    ].filter(n => n.length > 4)))
    if (numeros.length === 0) {
      setDuplicadosBD(new Set())
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/cuadres-caja/validar-consignaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numeros }),
        })
        if (res.ok) {
          const data = await res.json()
          setDuplicadosBD(new Set((data.duplicados || []).map((d: string) => d.toLowerCase())))
        }
      } catch (e) {
        // Si falla, no bloquear
      }
    }, 600) // 600ms de debounce — no consulta en cada tecla
    return () => clearTimeout(timer)
  }, [consignaciones, cobrosVinculados])

  const handleAbrirNovedadCaja = (order: any, tipo: "fiado" | "devolucion" | "agotado" | "descuento") => {
    setNovedadCajaOrder(order)
    setNovedadCajaTipo(tipo)
    setNovedadCajaMonto(String(calcularSaldoDisponibleCaja(order)))
    setShowNovedadCajaModal(true)
  }

  const handleSubmitNovedadCaja = async () => {
    if (!novedadCajaOrder || !novedadCajaTipo) return
    const totalPedido = calcularSaldoDisponibleCaja(novedadCajaOrder)
    const monto = novedadCajaTipo === "agotado" && !novedadCajaMonto
      ? totalPedido
      : Number(novedadCajaMonto) || 0

    console.log('[NOVEDAD CAJA]', { tipo: novedadCajaTipo, monto, totalPedido, order: novedadCajaOrder?.id })

    if (novedadCajaTipo !== "agotado" && (monto < 0 || monto > totalPedido)) {
      toast({ title: "Error", description: `El monto debe estar entre $0 y ${formatCOP(totalPedido)}`, variant: "destructive" })
      return
    }

    try {
      setSubmittingNovedadCaja(true)

      // fiado: montoNovedad = saldo que queda fiado, montoPagado = lo que abonó
      // Descuento: llama al endpoint de descuento directamente
      if (novedadCajaTipo === "descuento") {
        await fetch(`/api/pedidos/${novedadCajaOrder.id}/descuento`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descuento: monto, motivo: "Descuento registrado desde caja" }),
        })
        setRouteSheets(prevSheets => prevSheets.map(s => ({
          ...s,
          orders: s.orders.map(o => o.id === novedadCajaOrder.id ? { ...o, descuento: monto } : o)
        })))
        toast({ title: "Descuento registrado", description: formatCOP(monto) })
        setNovedadCajaOrder(null)
        setNovedadCajaTipo(null)
        setNovedadCajaMonto("")
        return
      }

      const tipoApi        = novedadCajaTipo === "fiado" ? "fiado_parcial" : novedadCajaTipo
      const montoNovedad   = novedadCajaTipo === "fiado" ? totalPedido - monto : monto
      const montoPagado    = novedadCajaTipo === "fiado" ? monto : 0

      const res = await fetch("/api/novedades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId:     novedadCajaOrder.id,
          tipoNovedad:  tipoApi,
          montoNovedad,
          montoPagado,
          descripcion:  `${novedadCajaTipo} registrado desde caja`,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast({ title: "Registrado", description: `${novedadCajaOrder.cliente} — ${formatCOP(monto)}` })
      setShowNovedadCajaModal(false)
      setNovedadCajaOrder(null)
      setNovedadCajaTipo(null)
      setNovedadCajaMonto("")
      await loadData()
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setSubmittingNovedadCaja(false)
    }
  }

  // Consignaciones que el entregador ya registró en ruta (botón "Transferencia") y
  // que ningún cuadre ha usado todavía — se agregan a la lista de consignaciones tal
  // como si caja las hubiera escrito a mano, evitando duplicados si se reabre el modal.
  // Sin filtro de fecha: deben permanecer visibles sin importar cuántos días hayan
  // pasado desde que el entregador las registró en ruta.
  const loadConsignacionesEntregador = async (entregador: string) => {
    try {
      const hoy = getFechaHoyBogota()
      const res = await fetch(`/api/planillas/consignaciones-entregador?entregador=${encodeURIComponent(entregador)}`)
      if (!res.ok) return
      const data = await res.json()
      const nuevas = (data.consignaciones || []).map((c: any) => ({
        id: crypto.randomUUID(),
        banco: c.banco,
        numero: c.numero,
        monto: String(c.monto),
        fecha: c.fecha ? String(c.fecha).split("T")[0] : hoy,
        cliente: c.cliente || "",
        numero_factura: "",
        origenConsignacionId: c.id,
      }))
      if (nuevas.length > 0) {
        setConsignaciones(prev => [
          ...prev,
          ...nuevas.filter((n: any) => !prev.some(p => p.origenConsignacionId === n.origenConsignacionId)),
        ])
      }
    } catch (error) {
      console.error("[CAJA] Error cargando consignaciones del entregador:", error)
    }
  }

  // incluirPagosAnticipados: solo el flujo de cuadre AGRUPADO sabe mostrar los
  // cobros de tipo "pago anticipado" (campos medioPago/monto/numeroFactura). El
  // modal de cuadre individual sigue usando el formato viejo (montoEfectivo/montoNequi)
  // y no debe recibirlos.
  const loadCobrosDisponibles = async (entregador: string, incluirPagosAnticipados = false) => {
    setLoadingCobros(true)
    try {
      // Cobros disponibles para vincular (asignados al entregador, sin cobrar aún)
      const res = await fetch(`/api/fiados/asignar-cobro?entregador=${encodeURIComponent(entregador)}`)
      const data = await res.json()
      const cobrosFiados = data.cobros || []

      // ✅ Pagos anticipados ya identificados para este entregador — se muestran como
      // un cobro CxC más, listos para que caja los confirme dentro de este cuadre.
      let cobrosPagosAnticipados: any[] = []
      if (incluirPagosAnticipados) {
        try {
          const resPA = await fetch(`/api/pagos-anticipados?estado=identificado&entregador=${encodeURIComponent(entregador)}`)
          if (resPA.ok) {
            const dataPA = await resPA.json()
            cobrosPagosAnticipados = (dataPA.pagos || []).map((p: any) => ({
              id:                    `pa-${p.id}`,
              cliente:               p.cliente || "(sin nombre)",
              ruta:                  null,
              saldo_pendiente:       Number(p.monto),
              esPagoAnticipado:      true,
              pagoAnticipadoId:      p.id,
              pagoAnticipadoTipo:    p.tipo,
              pagoAnticipadoFiadoId: p.tipo === "pedido_asesor" ? p.pedido_id : p.fiado_id,
              numeroFactura:         p.referencia,
              medioPago:             p.medio_pago,
              monto:                 String(p.monto),
            }))
          }
        } catch (ePA) {
          console.error("[CAJA] Error cargando pagos anticipados identificados:", ePA)
        }
      }

      setCobrosDisponibles([...cobrosFiados, ...cobrosPagosAnticipados])

      // ✅ Precargar automáticamente los cobros que el entregador ya registró en ruta,
      // sin importar cuántos días hayan pasado — el entregador puede estar varios días
      // en zona antes de que caja haga el cuadre.
      const resAbonos = await fetch(`/api/fiados/abonos-entregador?entregador=${encodeURIComponent(entregador)}`)
      if (resAbonos.ok) {
        const dataAbonos = await resAbonos.json()
        const cobrosYaRegistrados = (dataAbonos.abonos || []).map((a: any) => ({
          id:              a.fiado_id,
          abonoId:         a.id, // vínculo exacto al marcar el cuadre — evita adivinar por fecha
          cliente:         a.cliente,
          ruta:            a.ruta,
          saldo_pendiente: a.saldo_pendiente,
          resultado:       a.monto_nequi > 0 && a.monto_efectivo > 0 ? "mixto"
                           : a.monto_nequi > 0 ? "nequi" : "efectivo",
          montoEfectivo:   String(a.monto_efectivo || 0),
          montoNequi:      String(a.monto_nequi || 0),
          referencia:      a.referencia_pago || "",
          numeroFactura:   "",
          medioPago:       a.monto_nequi > 0 && a.monto_efectivo > 0 ? "Mixto" : a.monto_nequi > 0 ? "Nequi" : "Efectivo",
          monto:           String((Number(a.monto_efectivo) || 0) + (Number(a.monto_nequi) || 0)),
          yaRegistrado:    true, // flag para que caja sepa que viene del entregador
        }))
        // ✅ Fusionar con lo que ya había (borrador restaurado o cobros que caja
        // acaba de vincular a mano) en vez de reemplazar — antes esto borraba
        // cualquier cobro recién agregado cada vez que se reabría el modal.
        if (cobrosYaRegistrados.length > 0) {
          setCobrosVinculados(prev => [
            ...prev,
            ...cobrosYaRegistrados.filter((n: any) => !prev.some(p => p.abonoId ? p.abonoId === n.abonoId : p.id === n.id)),
          ])
        }
      }

      // Endpoint abonos-huerfanos no implementado aún — omitir
    } catch (e) {
      console.error("[CAJA] Error cargando cobros:", e)
      setCobrosDisponibles([])
    } finally {
      setLoadingCobros(false)
    }
  }

  const handleVincularCobro = (cobro: any) => {
    if (cobrosVinculados.find(c => c.id === cobro.id)) return
    // Los pagos anticipados llegan con medioPago/monto/numeroFactura ya definidos desde su registro — no se resetean.
    setCobrosVinculados(prev => [...prev, cobro.esPagoAnticipado
      ? { ...cobro }
      : { ...cobro, numeroFactura: "", medioPago: "Nequi", montoEfectivo: "", montoElectronico: "", fecha: new Date().toISOString().split("T")[0], numeroReferencia: "" }
    ])
  }

  const handleDesvincularCobro = (cobroId: number) => {
    setCobrosVinculados(prev => prev.filter(c => c.id !== cobroId))
  }

  // Monto total que aporta un cobro CxC al esperado, sin importar el medio de pago.
  // Los cobros ya registrados por el entregador y los agregados en caja (nuevos)
  // ya vienen divididos en efectivo/electrónico; los de pago anticipado usan "monto" único.
  const getCobroMontoTotal = (cobro: any) => {
    if (cobro.esPagoAnticipado) return Number(cobro.monto) || 0
    if (cobro.yaRegistrado) return (Number(cobro.montoEfectivo) || 0) + (Number(cobro.montoNequi) || 0)
    return (Number(cobro.montoEfectivo) || 0) + (Number(cobro.montoElectronico) || 0)
  }

  // Solo la parte del cobro pagada por un medio electrónico (Nequi, Bancolombia, etc.).
  // La parte en efectivo NO se suma aparte porque ya queda contada dentro de "Efectivo"
  // (billetes+monedas) — el entregador la trae físicamente mezclada con la plata de la ruta.
  const getCobroMontoElectronico = (cobro: any) => {
    if (cobro.esPagoAnticipado) return cobro.medioPago === "Efectivo" ? 0 : (Number(cobro.monto) || 0)
    if (cobro.yaRegistrado) return Number(cobro.montoNequi) || 0
    return Number(cobro.montoElectronico) || 0
  }

  const buildReferenciaCobro = (cobro: any) => {
    if (cobro.yaRegistrado) return cobro.referencia?.trim() || null
    const partes = [cobro.medioPago, cobro.numeroFactura?.trim() ? `Fact. ${cobro.numeroFactura.trim()}` : null].filter(Boolean)
    return partes.length ? partes.join(" · ") : null
  }

  const handleActualizarResultadoCobro = (cobroId: number, campo: string, valor: any) => {
    setCobrosVinculados(prev => prev.map(c => c.id === cobroId ? { ...c, [campo]: valor } : c))
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelectedPlanilla(null)
    setTotalCobrosAsignados(0)
    setCobrosVinculados([])
    setConsignaciones([])
    setFormData({
      billetes: "",
      monedas: "",
      observaciones: "",
      descuento: "",
      motivoDescuento: "",
      varios: "",
      motivoVarios: "",
      devolucionesParciales: "",
      devolucionesCompletas: "",
      repasos: "",
      fiados: "",
      agotados: "",
      erroresFacturacion: "",
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

  const handleAgruparRutas = async () => {
    if (selectedRoutes.length === 0) {
      toast({
        title: "Error",
        description: "Selecciona al menos una ruta para agrupar",
        variant: "destructive",
      })
      return
    }

    const rutasSeleccionadas = filteredRoutes.filter((r) => selectedRoutes.includes(r.id))

    // ✅ Recargar novedades frescas antes de calcular totales
    try {
      const novedadesMap: Record<number, any[]> = { ...novedadesPorPlanilla }
      await Promise.all(
        rutasSeleccionadas.map(async (planilla) => {
          try {
            const response = await fetch(`/api/novedades?planillaId=${planilla.id}`)
            if (response.ok) {
              const data = await response.json()
              novedadesMap[planilla.id] = data.novedades || []
            }
          } catch (error) {
            console.error("[CAJA] Error recargando novedades planilla", planilla.id, error)
          }
        })
      )
      setNovedadesPorPlanilla(novedadesMap)
    } catch (error) {
      console.error("[CAJA] Error recargando novedades:", error)
    }

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
      erroresFacturacion: totalErroresFacturacionAgrupado.toString(),
    })

    const claveborrador = `cuadre_borrador_${rutasSeleccionadas[0].entregador}`
    const borradorGuardado = localStorage.getItem(claveborrador)
    let borrador = borradorGuardado ? JSON.parse(borradorGuardado) : null

    // ✅ Descartar borradores que no correspondan a este cuadre: viejos (>24h) o de
    // otro conjunto de planillas — evita restaurar residuos de una sesión anterior
    // sin relación con lo que se está cuadrando ahora, aunque sea el mismo entregador.
    if (borrador) {
      const VEINTICUATRO_HORAS = 24 * 60 * 60 * 1000
      const esViejo = !borrador.guardadoEn || (Date.now() - borrador.guardadoEn) > VEINTICUATRO_HORAS
      const mismasPlanillas = Array.isArray(borrador.planillaIds) &&
        JSON.stringify([...borrador.planillaIds].sort()) === JSON.stringify([...selectedRoutes].sort())

      if (esViejo || !mismasPlanillas) {
        localStorage.removeItem(claveborrador)
        borrador = null
      }
    }

    const borradorConsignaciones = (borrador?.consignaciones || []).map((c: any) => ({
      ...c,
      cliente: c.cliente || "",
      numero_factura: c.numero_factura || "",
    }))

    setAgrupadoData(agrupado)
    setCobrosVinculados(borrador?.cobrosVinculados || [])
    setConsignaciones(borradorConsignaciones)
    setDuplicadosBD(new Set())
    setBusquedaCobro("")
    setFormData(prev => ({
      ...prev,
      billetes: borrador?.billetes || "",
      monedas: borrador?.monedas || "",
      fiados: totalFiadoAgrupado.toString(),
      repasos: totalRepasosAgrupado.toString(),
      devolucionesParciales: totalDevolucionesAgrupado.toString(),
      agotados: totalAgotadosAgrupado.toString(),
      erroresFacturacion: totalErroresFacturacionAgrupado.toString(),
      descuento: totalDescuentosAgrupado.toString(),
      observaciones: borrador?.observaciones || "",
    }))
    loadCobrosDisponibles(rutasSeleccionadas[0].entregador, true)
    loadConsignacionesEntregador(rutasSeleccionadas[0].entregador || "")
    setShowAgrupadoModal(true)
  }

  const handleSubmitAgrupado = async () => {
  if (!agrupadoData) return

  if (formData.efectivoRecibido === undefined || formData.efectivoRecibido === null || Number(formData.efectivoRecibido) < 0) {
    toast({ title: "Error", description: "El efectivo recibido debe ser un valor válido", variant: "destructive" })
    return
  }

  if (formData.tieneConsignacion) {
    if (!formData.numeroConsignacion || !formData.banco || !formData.montoConsignacion) {
      toast({ title: "Error", description: "Complete todos los datos de la consignación", variant: "destructive" })
      return
    }
    const existe = await validateConsignacion(formData.numeroConsignacion)
    if (existe) return
  }

  // ✅ Validar duplicados de consignaciones — si falla el endpoint, no bloquear el cierre
  const numerosConsignacion = consignaciones.map(c => c.numero.trim()).filter(n => n !== "")
  if (numerosConsignacion.length > 0) {
    try {
      const resValidacion = await fetch("/api/cuadres-caja/validar-consignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numeros: numerosConsignacion }),
      })
      if (resValidacion.ok) {
        const dataValidacion = await resValidacion.json()
        if (dataValidacion.duplicados && dataValidacion.duplicados.length > 0) {
          toast({
            title: "Consignación duplicada",
            description: `Los siguientes números ya fueron registrados: ${dataValidacion.duplicados.join(", ")}`,
            variant: "destructive",
          })
          setSubmitting(false)
          return
        }
      }
    } catch (errVal) {
      console.warn("[CUADRE] Validación duplicados falló, continuando:", errVal)
    }
  }

  try {
    setSubmitting(true)

    // 1. Guardar pedidos fiados y repasos
    const rutasSeleccionadas = filteredRoutes.filter((r) => selectedRoutes.includes(r.id))
    for (const route of rutasSeleccionadas) {
      if (!Array.isArray(route.orders)) continue
      for (const order of route.orders) {
        if (order.estado === "fiado") {
          const totalEfectivo  = calculateOrderEffectiveTotal(order)
          const montoPagado    = Number(order.montoPagado) || 0
          const saldoPendiente = totalEfectivo - montoPagado
          await updatePedidoEstado(order.id, "fiado", montoPagado, saldoPendiente)
        }
        if (order.estado === "repaso") {
          await updatePedidoEstado(order.id, "repaso")
        }
      }
    }

    // 2. Calcular totales
    const totalCobrosCxC         = cobrosVinculados.reduce((s, c) => s + getCobroMontoTotal(c), 0)
    const totalCobrosElectronico = cobrosVinculados.reduce((s, c) => s + getCobroMontoElectronico(c), 0)
    const totalBilletes          = Number(formData.billetes || 0)
    const totalMonedas           = Number(formData.monedas || 0)
    const totalConsignaciones    = consignaciones.reduce((s, c) => s + (Number(c.monto) || 0), 0)
    const efectivoRecibido       = totalBilletes + totalMonedas + totalConsignaciones + totalCobrosElectronico
    const fiadoFinal             = Number(formData.fiados) || 0
    const repasosFinal           = Number(formData.repasos) || 0
    const devolucionesFinal      = Number(formData.devolucionesParciales) || 0
    const agotadosFinal          = Number(formData.agotados) || 0
    const descuentoFinal         = Number(formData.descuento) || 0
    const variosFinal            = Number(formData.varios) || 0
    const erroresFacturacionFinal = Number(formData.erroresFacturacion) || 0
    const totalEsperado = (agrupadoData.totales.cargue || 0)
      - fiadoFinal
      - devolucionesFinal
      - agotadosFinal
      - descuentoFinal
      - variosFinal
      - repasosFinal
      - erroresFacturacionFinal
      + totalCobrosCxC

    const payload = {
      planillaIds:        agrupadoData.planillaIds,
      entregador:         agrupadoData.entregador,
      totalEsperado,
      efectivoRecibido,
      billetes:           totalBilletes,
      monedas:            totalMonedas,
      consignaciones:     consignaciones.map(c => ({ banco: c.banco, numero: c.numero, monto: Number(c.monto), fecha: c.fecha, cliente: c.cliente || "", numero_factura: c.numero_factura || "", origenConsignacionId: c.origenConsignacionId || null })),
      tieneConsignacion:  consignaciones.length > 0,
      observaciones:      formData.observaciones || null,
      descuento:          descuentoFinal,
      varios:             variosFinal,
      motivoVarios:       formData.motivoVarios || null,
      agotados:           agotadosFinal,
      fiado:              fiadoFinal,
      devoluciones:       devolucionesFinal,
      repasos:            repasosFinal,
      erroresFacturacion: erroresFacturacionFinal,
      cobrosVinculados:   cobrosVinculados.map(c => {
        if (c.esPagoAnticipado) {
          const esEfectivo = c.medioPago === "Efectivo"
          return {
            id:                    c.id,
            montoEfectivo:         esEfectivo ? Number(c.monto) || 0 : 0,
            montoNequi:            esEfectivo ? 0 : Number(c.monto) || 0,
            referencia:            buildReferenciaCobro(c),
            esPagoAnticipado:      true,
            pagoAnticipadoId:      c.pagoAnticipadoId,
            pagoAnticipadoTipo:    c.pagoAnticipadoTipo,
            pagoAnticipadoFiadoId: c.pagoAnticipadoFiadoId,
          }
        }
        if (c.yaRegistrado) {
          return {
            id:            c.id,
            abonoId:       c.abonoId || null,
            montoEfectivo: Number(c.montoEfectivo) || 0,
            montoNequi:    Number(c.montoNequi) || 0,
            referencia:    c.referencia?.trim() || null,
          }
        }
        return {
          id:               c.id,
          montoEfectivo:    Number(c.montoEfectivo) || 0,
          montoNequi:       Number(c.montoElectronico) || 0,
          referencia:       c.numeroReferencia?.trim() || null,
          medioPagoDetalle: (Number(c.montoElectronico) || 0) > 0 ? (c.medioPago || null) : null,
          numeroFactura:    c.numeroFactura?.trim() || null,
          fecha:            c.fecha || null,
        }
      }),
    }

    const response = await fetch("/api/cuadres-caja", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || data.details || "Error al registrar cuadre agrupado")

    // ✅ Limpiar borrador al confirmar cuadre exitosamente
    const clave = `cuadre_borrador_${agrupadoData.entregador}`
    localStorage.removeItem(clave)

    toast({ title: "Cuadre Registrado", description: `✅ ${data.mensaje}` })
    setShowAgrupadoModal(false)
    setSelectedRoutes([])
    setAgrupadoData(null)
    setCobrosVinculados([])
    setConsignaciones([])
    await loadData()
  } catch (error) {
    toast({ title: "Error", description: error instanceof Error ? error.message : "Error al registrar cuadre", variant: "destructive" })
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

  const efectivo = Number(montoEfectivoCobro) || 0
  const nequi    = Number(montoNequiCobro) || 0
  const total    = efectivo + nequi

  if (total <= 0) {
    toast({
      title: "Error",
      description: "Ingresa al menos un monto en efectivo o Nequi",
      variant: "destructive",
    })
    return
  }

  if (total > selectedCobro.saldo_pendiente) {
    toast({
      title: "Error",
      description: `El total no puede superar el saldo pendiente (${formatCOP(selectedCobro.saldo_pendiente)})`,
      variant: "destructive",
    })
    return
  }

  if (nequi > 0 && !referenciaNequiCobro.trim()) {
    toast({
      title: "Error",
      description: "Ingresa la referencia del pago por Nequi",
      variant: "destructive",
    })
    return
  }

  try {
    setSubmittingAbonoCobro(true)

    const response = await fetch("/api/fiados/registrar-abono", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fiadoId:         selectedCobro.id,
        montoEfectivo:   efectivo,
        montoNequi:      nequi,
        referenciaPago:  referenciaNequiCobro.trim() || null,
        entregadorCobro: selectedCobro.entregador_asignado || null,
        observaciones:   "Abono registrado desde cuadre de caja",
      }),
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Error al registrar abono")

    toast({
      title: data.pago_completo ? "Cobro Completado" : "Abono Registrado",
      description: data.mensaje,
    })

    setShowAbonoCobroModal(false)
    setSelectedCobro(null)
    setMontoEfectivoCobro("")
    setMontoNequiCobro("")
    setReferenciaNequiCobro("")

    await loadData()
  } catch (err) {
    toast({
      title: "Error",
      description: err instanceof Error ? err.message : "Error al registrar abono",
      variant: "destructive",
    })
  } finally {
    setSubmittingAbonoCobro(false)
  }
}

const handleNoPagoCobro = async (orderId: string, planillaId: number) => {
  try {
    // ✅ LÓGICA CORRECTA:
    // 1. El pedido de cobro queda en planilla con estado "devolucion" → resta del cargue
    // 2. El fiado original se libera → planilla_asignado_id = NULL → vuelve al admin

    // Paso 1: marcar pedido de cobro como devolucion
    const r1 = await fetch("/api/pedidos/actualizar-estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoId: orderId, estado: "devolucion" }),
    })
    if (!r1.ok) {
      const d1 = await r1.json()
      throw new Error(d1.error || "Error al actualizar pedido de cobro")
    }

    // Paso 2: liberar el fiado original → vuelve al admin
    const r2 = await fetch("/api/fiados/liberar-cobro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedidoCobroId: orderId }),
    })
    if (!r2.ok) {
      const d2 = await r2.json()
      throw new Error(d2.error || "Error al liberar fiado")
    }

    // Actualizar estado local
    setRouteSheets(prevSheets =>
      prevSheets.map(sheet => ({
        ...sheet,
        orders: sheet.orders.map(o =>
          o.id === orderId
            ? { ...o, estado: "devolucion" }
            : o
        )
      }))
    )

    toast({ 
      title: "Cobro No Recibido", 
      description: "El fiado volvió al admin pendiente de cobro. El pedido quedó registrado como devolución en el cargue." 
    })
    await loadData()
  } catch (err) {
    toast({ title: "Error", description: err instanceof Error ? err.message : "Error al procesar no pago", variant: "destructive" })
  }
}

  const handleSubmit = async () => {
    if (!selectedPlanilla) return

    if (!formData.efectivoRecibido || Number(formData.efectivoRecibido) < 0) {
      toast({ title: "Error", description: "El efectivo recibido debe ser un valor válido", variant: "destructive" })
      return
    }

    if (formData.tieneConsignacion) {
      if (!formData.numeroConsignacion || !formData.banco || !formData.montoConsignacion) {
        toast({ title: "Error", description: "Complete todos los datos de la consignación", variant: "destructive" })
        return
      }
      const existe = await validateConsignacion(formData.numeroConsignacion)
      if (existe) return
    }

    // Validar cobros vinculados
    for (const cobro of cobrosVinculados) {
      const nequi = Number(cobro.montoNequi) || 0
      if (nequi > 0 && !cobro.referencia?.trim()) {
        toast({ title: "Error", description: `Ingresa la referencia Nequi para el cobro de ${cobro.cliente}`, variant: "destructive" })
        return
      }
    }

    // Validar consignaciones
    for (const cons of consignaciones) {
      if (!cons.banco.trim() || !cons.numero.trim() || !cons.monto) {
        toast({ title: "Error", description: "Complete todos los campos de cada consignación", variant: "destructive" })
        return
      }
    }

    try {
      setSubmitting(true)

      // 1. Calcular totales
      const totals              = calculateRouteTotals(selectedPlanilla)
      const totalCobrosEfectivo = cobrosVinculados.reduce((s, c) => s + (Number(c.montoEfectivo) || 0), 0)
      const totalBilletes       = Number(formData.billetes || 0)
      const totalMonedas        = Number(formData.monedas || 0)
      const totalConsignaciones = consignaciones.reduce((s, c) => s + (Number(c.monto) || 0), 0)
      const efectivoRecibido    = totalBilletes + totalMonedas + totalConsignaciones
      const cargue              = selectedPlanilla.montoCargue || 0
      const novedades           = totals.fiado + totals.devoluciones + totals.repasos + totals.agotados + totals.erroresFacturacion + Number(formData.descuento || 0)
      const totalEsperado       = cargue - novedades + totalCobrosEfectivo

      // 2. Registrar el cuadre (cobros incluidos en el payload — transacción única)
      const response = await fetch("/api/caja/recibir-efectivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaId:        selectedPlanilla.id,
          efectivoEsperado:  totalEsperado,
          efectivoRecibido,
          billetes:          totalBilletes,
          monedas:           totalMonedas,
          consignaciones:    consignaciones.map(c => ({ banco: c.banco, numero: c.numero, monto: Number(c.monto), fecha: c.fecha, cliente: c.cliente || "", numero_factura: c.numero_factura || "" })),
          tieneConsignacion: consignaciones.length > 0,
          observaciones:     formData.observaciones || null,
          descuento:         Number(formData.descuento || 0),
          motivoDescuento:   formData.motivoDescuento || null,
          agotados:          totals.agotados || 0,
          cobrosVinculados:  cobrosVinculados.map(c => ({
            id:            c.id,
            abonoId:       c.abonoId || null,
            montoEfectivo: Number(c.montoEfectivo) || 0,
            montoNequi:    Number(c.montoNequi) || 0,
            referencia:    c.referencia?.trim() || null,
          })),
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Error al registrar cuadre")

      toast({ title: "Cuadre Registrado", description: data.mensaje })
      handleCloseModal()
      await loadData()
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Error al registrar cuadre", variant: "destructive" })
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

  // Total cobros de fiados recibidos (pedidos con esCobro=true y estado=pagado)
  let totalCobrosCxC = 0
  filteredRoutes.forEach((route) => {
    if (Array.isArray(route.orders)) {
      route.orders.forEach((order: any) => {
        if (order?.esCobro && order?.estado === 'pagado') {
          totalCobrosCxC += Number(order.total || 0)
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
            <Link href="/pagos-anticipados">
              <Button variant="outline" size="sm">
                <Wallet className="h-4 w-4 mr-2" />
                Cuadre Administrativo
              </Button>
            </Link>
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
                              {rec.entregador || "—"}
                              {" — "}
                              {rec.tipo_ruta
                                ? rec.tipo_ruta
                                : Array.isArray(rec.rutas_nombres) && rec.rutas_nombres.length > 0
                                  ? `Rutas: ${rec.rutas_nombres.join(", ")}`
                                  : Array.isArray(rec.planillas_ids) && rec.planillas_ids.length > 0
                                    ? `${rec.planillas_ids.length} ruta(s)`
                                    : ""}
                            </p>
                            {rec.tipo === "agrupado" && (
                              <Badge variant="secondary">AGRUPADO</Badge>
                            )}
                          </div>
                          <p className="text-sm text-gray-500">
                            {rec.fecha_recepcion
                              ? new Date(rec.fecha_recepcion).toLocaleString("es-CO", {
                                  timeZone: "America/Bogota",
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Sin fecha"}
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

                      {/* Detalle de Novedades — siempre visible, sin esconder en $0 */}
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium text-gray-600 mb-2">Detalle de Novedades:</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="bg-orange-50 p-2 rounded">
                            <span className="text-orange-600 font-medium">Fiado</span>
                            <p className="font-bold">{formatCOP(Number(rec.fiado) || 0)}</p>
                          </div>
                          <div className="bg-red-50 p-2 rounded">
                            <span className="text-red-600 font-medium">Devoluciones</span>
                            <p className="font-bold">{formatCOP(Number(rec.devoluciones) || 0)}</p>
                          </div>
                          <div className="bg-blue-50 p-2 rounded">
                            <span className="text-blue-600 font-medium">Repasos</span>
                            <p className="font-bold">{formatCOP(Number(rec.repasos) || 0)}</p>
                          </div>
                          <div className="bg-gray-100 p-2 rounded">
                            <span className="text-gray-600 font-medium">Agotados</span>
                            <p className="font-bold">{formatCOP(Number(rec.agotados) || 0)}</p>
                          </div>
                          <div className="bg-orange-100 p-2 rounded">
                            <span className="text-orange-700 font-medium">Errores Fact.</span>
                            <p className="font-bold">{formatCOP(Number(rec.errores_facturacion) || 0)}</p>
                          </div>
                          <div className="bg-purple-50 p-2 rounded">
                            <span className="text-purple-600 font-medium">Descuentos</span>
                            <p className="font-bold">{formatCOP(Number(rec.descuento) || 0)}</p>
                          </div>
                        </div>
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

                      {/* Desglose de efectivo recibido */}
                      {(rec.billetes > 0 || rec.monedas > 0 || rec.nequi_recibido > 0 || rec.total_cobros > 0) && (
                        <div className="mt-2 pt-2 border-t grid grid-cols-4 gap-2 text-xs">
                          {rec.billetes > 0 && (
                            <div><span className="text-gray-400">Billetes</span><p className="font-medium">{formatCOP(Number(rec.billetes))}</p></div>
                          )}
                          {rec.monedas > 0 && (
                            <div><span className="text-gray-400">Monedas</span><p className="font-medium">{formatCOP(Number(rec.monedas))}</p></div>
                          )}
                          {rec.nequi_recibido > 0 && (
                            <div><span className="text-gray-400">Nequi</span><p className="font-medium text-purple-600">{formatCOP(Number(rec.nequi_recibido))}</p></div>
                          )}
                          {rec.total_cobros > 0 && (
                            <div><span className="text-gray-400">Cobros CxC</span><p className="font-medium text-blue-600">{formatCOP(Number(rec.total_cobros))}</p></div>
                          )}
                        </div>
                      )}

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

                      {rec.tipo === "agrupado" && Array.isArray(rec.planillas_ids) && rec.planillas_ids.length > 0 && (
                        <div className="mt-2 text-xs text-gray-500 flex gap-4 flex-wrap">
                          <span>
                            <span className="font-medium">Planillas:</span>{" "}
                            {rec.planillas_ids.join(", ")}
                          </span>
                          {Array.isArray(rec.rutas_nombres) && rec.rutas_nombres.length > 0 && (
                            <span>
                              <span className="font-medium">Rutas:</span>{" "}
                              {rec.rutas_nombres.join(", ")}
                            </span>
                          )}
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

                  <Select value={filterEntregador} onValueChange={(val) => {
                    setFilterEntregador(val)
                    setSelectedRoutes([]) // ✅ Limpiar selección al cambiar entregador
                  }}>
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

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3 mt-4 pt-4 border-t">
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
                  <div className="text-center p-2 bg-green-100 rounded">
                    <span className="text-xs text-green-700 font-medium">Cobros CxC</span>
                    <p className="font-bold text-green-800">{formatCOP(totalCobrosCxC)}</p>
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
                            {/* FIX: reloadNovedades(route.id) recarga solo esta planilla
                                con un delay de 400ms para evitar condición de carrera */}
                            <CardNovedadesInteractivo
                              planillaId={String(route.id)}
                              tipo="agotado"
                              onNovedadActualizada={() => reloadNovedades(route.id)}
                            />
                            <CardNovedadesInteractivo
                              planillaId={String(route.id)}
                              tipo="devolucion"
                              onNovedadActualizada={() => reloadNovedades(route.id)}
                            />
                            <CardNovedadesInteractivo
                              planillaId={String(route.id)}
                              tipo="fiado"
                              onNovedadActualizada={() => reloadNovedades(route.id)}
                            />
                            <CardNovedadesInteractivo
                              planillaId={String(route.id)}
                              tipo="error_facturacion"
                              onNovedadActualizada={() => reloadNovedades(route.id)}
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
                              <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mt-3">
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
                                <div className="text-center p-2 bg-purple-50 rounded">
                                  <span className="text-xs text-purple-600 font-medium">Cobros CxC</span>
                                  <p className="font-bold text-purple-700">
                                    {formatCOP(
                                      route.orders
                                        ?.filter((o: any) => o?.esCobro && o?.estado === 'pagado')
                                        .reduce((sum: number, o: any) => sum + Number(o.total || 0), 0) || 0
                                    )}
                                  </p>
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

                                      // ✅ Si caja ajustó el total manualmente, usar el total de BD
                                      const totalBD = Number(order.total) || 0
                                      if (totalBD > 0 && Math.abs(totalBD - effectiveTotal) > 1) {
                                        effectiveTotal = totalBD
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
                                              {!route.cuadradoEnCaja && (
                                                <div className="flex items-center gap-2 mt-1">
                                                  <span className="text-xs text-gray-500">Ajustar valor factura:</span>
                                                  <Input
                                                    type="number"
                                                    className="h-6 text-xs w-32"
                                                    placeholder={String(Math.round(effectiveTotal))}
                                                    onBlur={async (e) => {
                                                      const val = Number(e.target.value)
                                                      if (!val || val === effectiveTotal) return
                                                      try {
                                                        const res = await fetch("/api/pedidos/ajustar-total", {
                                                          method: "PATCH",
                                                          headers: { "Content-Type": "application/json" },
                                                          body: JSON.stringify({ pedidoId: order.id, nuevoTotal: val }),
                                                        })
                                                        if (res.ok) {
                                                          toast({ title: "Ajuste aplicado", description: `Factura actualizada a ${formatCOP(val)}` })
                                                          await loadData()
                                                        } else {
                                                          const d = await res.json()
                                                          toast({ title: "Error", description: d.error, variant: "destructive" })
                                                        }
                                                      } catch {
                                                        toast({ title: "Error", description: "No se pudo ajustar el valor", variant: "destructive" })
                                                      }
                                                      e.target.value = ""
                                                    }}
                                                  />
                                                </div>
                                              )}
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

                                          {isExpanded && (
                                            <div className="mt-2 pt-2 border-t space-y-2">

                                              {/* Novedades del pedido */}
                                              <CardNovedadesInteractivo
                                                pedidoId={order.id}
                                                planillaId={route.id}
                                                cuadradoEnCaja={route.cuadradoEnCaja}
                                              />

                                              {/* Acciones de estado — solo si no está cuadrado */}
                                              {!route.cuadradoEnCaja && (
                                                <div className="flex flex-wrap gap-1 pt-1">
                                                  {/* Botón revertir — si el pedido ya tiene novedad o estado cambiado */}
                                                  {order.estado !== "pendiente" && order.estado !== "entregado" && (
                                                    <Button variant="outline" size="sm" className="h-7 text-xs border-gray-400 text-gray-700 bg-gray-50"
                                                      onClick={async () => {
                                                        try {
                                                          // Revertir estado del pedido a pendiente
                                                          await fetch("/api/pedidos/actualizar-estado", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ pedidoId: order.id, estado: "pendiente" }),
                                                          })
                                                          // Borrar última novedad del pedido
                                                          await fetch(`/api/novedades/revertir`, {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ pedidoId: order.id }),
                                                          })
                                                          toast({ title: "Revertido", description: `${order.cliente} vuelve a pendiente` })
                                                          await loadData()
                                                        } catch {
                                                          toast({ title: "Error", description: "No se pudo revertir", variant: "destructive" })
                                                        }
                                                      }}>
                                                      ↩ Revertir
                                                    </Button>
                                                  )}
                                                  <Button variant="outline" size="sm" className="h-7 text-xs border-orange-300 text-orange-700"
                                                    onClick={() => handleAbrirNovedadCaja(order, "fiado")}>
                                                    Fiado
                                                  </Button>
                                                  <Button variant="outline" size="sm" className="h-7 text-xs border-blue-300 text-blue-700"
                                                    onClick={() => handleOrderStatusChange(order.id, "repaso")}>
                                                    Repaso
                                                  </Button>
                                                  <Button variant="destructive" size="sm" className="h-7 text-xs"
                                                    onClick={() => handleAbrirNovedadCaja(order, "devolucion")}>
                                                    Devolución
                                                  </Button>
                                                  <Button variant="outline" size="sm" className="h-7 text-xs border-gray-300 text-gray-600"
                                                    onClick={() => handleAbrirNovedadCaja(order, "agotado")}>
                                                    Agotado
                                                  </Button>
                                                  <Button variant="outline" size="sm" className="h-7 text-xs border-purple-300 text-purple-700"
                                                    onClick={() => handleAbrirNovedadCaja(order, "descuento")}>
                                                    Descuento
                                                  </Button>
                                                  <Button variant="outline" size="sm" className="h-7 text-xs border-gray-300 text-gray-600"
                                                    onClick={() => handleOpenEliminarPedidoModal(order.id, order.cliente, effectiveTotal, route.id)}>
                                                    <Trash2 className="h-3 w-3 mr-1" />
                                                    Eliminar
                                                  </Button>
                                                </div>
                                              )}

                                              {/* Detalle de productos — solo para disputas */}
                                              {Array.isArray(order.items) && order.items.length > 0 && (
                                                <details className="text-xs">
                                                  <summary className="cursor-pointer text-gray-400 hover:text-gray-600 py-1">
                                                    Ver productos de alistamiento ({order.items.length})
                                                  </summary>
                                                  <div className="mt-2 overflow-x-auto">
                                                    <table className="w-full text-xs border-t">
                                                      <thead>
                                                        <tr className="border-b bg-gray-50">
                                                          <th className="text-left py-1 px-2">Código</th>
                                                          <th className="text-left py-1 px-2">Descripción</th>
                                                          <th className="text-center py-1 px-2">Cant.</th>
                                                          <th className="text-right py-1 px-2">Total</th>
                                                          <th className="text-center py-1 px-2">Estado</th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {order.items.map((item: any, idx: number) => {
                                                          if (!item) return null
                                                          const cantEntregada = Number(item.cantidadEntregada) ?? Number(item.cantidad)
                                                          const subtotalFinal = item.subtotalAjustado != null ? Number(item.subtotalAjustado) : cantEntregada * Number(item.valorUnidad || 0)
                                                          const estadoProd = item.estadoProducto || "normal"
                                                          return (
                                                            <tr key={idx} className={`border-b ${item.devuelto || item.motivoAjuste === 'devuelto' ? "bg-red-50" : estadoProd === "agotado" ? "bg-gray-50" : ""}`}>
                                                              <td className="py-1 px-2">{item.codigo}</td>
                                                              <td className="py-1 px-2">{item.descripcion}</td>
                                                              <td className="text-center py-1 px-2">{cantEntregada}</td>
                                                              <td className="text-right py-1 px-2">{formatCOP(subtotalFinal)}</td>
                                                              <td className="text-center py-1 px-2">
                                                                {item.devuelto && <Badge variant="outline" className="text-[10px] bg-red-100">Dev</Badge>}
                                                                {estadoProd === "agotado" && <Badge variant="outline" className="text-[10px] bg-gray-100">Agot</Badge>}
                                                                {!item.devuelto && estadoProd === "normal" && <span className="text-green-600">✓</span>}
                                                              </td>
                                                            </tr>
                                                          )
                                                        })}
                                                      </tbody>
                                                    </table>
                                                  </div>
                                                </details>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuadre de Caja</DialogTitle>
            <DialogDescription>
              {selectedPlanilla && `${selectedPlanilla.entregador} — Ruta ${selectedPlanilla.ruta}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">

            {/* ── SECCIÓN COBROS CxC ─────────────────────────────────── */}
            <div className="border rounded-lg p-4 bg-purple-50">
              <h3 className="font-semibold text-sm text-purple-800 mb-3">💳 Cobros CxC</h3>

              {/* Buscador */}
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Buscar por cliente o ruta..."
                  value={busquedaCobro}
                  onChange={(e) => setBusquedaCobro(e.target.value)}
                  className="flex-1"
                />
              </div>

              {/* Cobros disponibles filtrados */}
              {loadingCobros ? (
                <p className="text-xs text-gray-500">Cargando cobros...</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto mb-3">
                  {cobrosDisponibles
                    .filter(c =>
                      !cobrosVinculados.find(v => v.id === c.id) &&
                      (busquedaCobro === "" ||
                        c.cliente.toLowerCase().includes(busquedaCobro.toLowerCase()) ||
                        (c.ruta || "").toLowerCase().includes(busquedaCobro.toLowerCase()))
                    )
                    .map(cobro => (
                      <div key={cobro.id} className="flex items-center justify-between p-2 bg-white rounded border text-sm">
                        <div>
                          <span className="font-medium">{cobro.cliente}</span>
                          {cobro.esPagoAnticipado && (
                            <Badge variant="outline" className="ml-2 text-xs bg-emerald-100 text-emerald-700 border-emerald-300">
                              💰 Cuadre administrativo
                            </Badge>
                          )}
                          <span className="text-gray-500 ml-2 text-xs">{cobro.ruta ? `${cobro.ruta} — ` : ""}{formatCOP(cobro.saldo_pendiente)}</span>
                        </div>
                        <Button size="sm" variant="outline" className="h-6 text-xs border-purple-300 text-purple-700"
                          onClick={() => handleVincularCobro(cobro)}>
                          + Agregar
                        </Button>
                      </div>
                    ))}
                  {cobrosDisponibles.filter(c => !cobrosVinculados.find(v => v.id === c.id)).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">No hay cobros disponibles</p>
                  )}
                </div>
              )}

              {/* Cobros vinculados con resultado */}
              {cobrosVinculados.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-medium text-purple-700">Cobros incluidos en este cuadre:</p>
                  {cobrosVinculados.map(cobro => (
                    <div key={cobro.id} className="p-3 bg-white rounded border border-purple-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">{cobro.cliente}</span>
                          <span className="text-xs text-gray-500 ml-2">Saldo: {formatCOP(cobro.saldo_pendiente)}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 text-red-500 hover:text-red-700"
                          onClick={() => handleDesvincularCobro(cobro.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label className="text-xs">Efectivo</Label>
                          <Input type="number" min={0} placeholder="0" className="h-7 text-sm"
                            value={cobro.montoEfectivo}
                            onChange={(e) => handleActualizarResultadoCobro(cobro.id, "montoEfectivo", e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">Nequi</Label>
                          <Input type="number" min={0} placeholder="0" className="h-7 text-sm"
                            value={cobro.montoNequi}
                            onChange={(e) => handleActualizarResultadoCobro(cobro.id, "montoNequi", e.target.value)} />
                        </div>
                        <div>
                          <Label className="text-xs">Referencia {Number(cobro.montoNequi) > 0 && <span className="text-red-500">*</span>}</Label>
                          <Input placeholder="Ref. Nequi" className="h-7 text-sm"
                            value={cobro.referencia}
                            onChange={(e) => handleActualizarResultadoCobro(cobro.id, "referencia", e.target.value)} />
                        </div>
                      </div>
                      {(Number(cobro.montoEfectivo) > 0 || Number(cobro.montoNequi) > 0) && (
                        <div className="text-xs text-right text-purple-700 font-medium">
                          Total cobrado: {formatCOP((Number(cobro.montoEfectivo) || 0) + (Number(cobro.montoNequi) || 0))}
                          {(Number(cobro.montoEfectivo) || 0) + (Number(cobro.montoNequi) || 0) < cobro.saldo_pendiente && (
                            <span className="text-amber-600 ml-2">
                              · Saldo queda: {formatCOP(cobro.saldo_pendiente - (Number(cobro.montoEfectivo) || 0) - (Number(cobro.montoNequi) || 0))}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── EFECTIVO FÍSICO ────────────────────────────────────── */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Efectivo físico</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Billetes</Label>
                  <Input
                    value={formData.billetes}
                    onChange={(e) => setFormData({ ...formData, billetes: e.target.value })}
                    type="number"
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Monedas</Label>
                  <Input
                    value={formData.monedas}
                    onChange={(e) => setFormData({ ...formData, monedas: e.target.value })}
                    type="number"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* ── CONSIGNACIONES MÚLTIPLES ───────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Consignaciones</p>
                <Button variant="outline" size="sm" onClick={agregarConsignacion} className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Agregar
                </Button>
              </div>
              {consignaciones.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Sin consignaciones</p>
              )}
              {consignaciones.map((cons, idx) => (
                <div key={cons.id} className="border rounded-lg p-3 bg-gray-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600">Consignación {idx + 1}</span>
                    <Button variant="ghost" size="sm" className="h-6 text-red-500 hover:text-red-700 p-0"
                      onClick={() => eliminarConsignacion(cons.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Banco</Label>
                      <Input className="h-8 text-sm" placeholder="Bancolombia"
                        value={cons.banco} onChange={(e) => actualizarConsignacion(cons.id, "banco", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Número</Label>
                      <Input
                        className={`h-8 text-sm ${
                          (cons.numero.trim() !== "" && consignaciones.some(
                            c => c.id !== cons.id && c.numero.trim().toLowerCase() === cons.numero.trim().toLowerCase()
                          )) || duplicadosBD.has(cons.numero.trim().toLowerCase())
                            ? "border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500 ring-1 ring-red-500" : ""
                        }`}
                        placeholder="Referencia"
                        value={cons.numero}
                        onChange={(e) => actualizarConsignacion(cons.id, "numero", e.target.value)}
                      />
                      {cons.numero.trim() !== "" && consignaciones.some(
                        c => c.id !== cons.id && c.numero.trim().toLowerCase() === cons.numero.trim().toLowerCase()
                      ) && (
                        <p className="text-xs text-red-600 mt-1 font-medium">⚠ Duplicada en este cuadre</p>
                      )}
                      {duplicadosBD.has(cons.numero.trim().toLowerCase()) && (
                        <p className="text-xs text-red-600 mt-1 font-medium">⚠ Ya registrada en cuadre anterior — NO puede usarse</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs">Monto</Label>
                      <Input className="h-8 text-sm" type="number" placeholder="0"
                        value={cons.monto} onChange={(e) => actualizarConsignacion(cons.id, "monto", e.target.value)} />
                    </div>
                    <div>
                      <Label className="text-xs">Fecha</Label>
                      <Input className="h-8 text-sm" type="date"
                        value={cons.fecha} onChange={(e) => actualizarConsignacion(cons.id, "fecha", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Nombre del Cliente</Label>
                      <Input className="h-8 text-sm" placeholder="Nombre del cliente que consignó"
                        value={cons.cliente || ""} onChange={(e) => actualizarConsignacion(cons.id, "cliente", e.target.value)} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Número de Factura</Label>
                      <Input className="h-8 text-sm" placeholder="Factura a la que corresponde"
                        value={cons.numero_factura || ""} onChange={(e) => actualizarConsignacion(cons.id, "numero_factura", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <Label>Descuento Aplicado</Label>
              <Input
                value={formData.descuento}
                onChange={(e) => setFormData({ ...formData, descuento: e.target.value })}
                type="number"
                min="0"
                placeholder="0"
              />
            </div>

            {formData.descuento && Number(formData.descuento) > 0 && (
              <div>
                <Label>Motivo del Descuento</Label>
                <Textarea
                  value={formData.motivoDescuento}
                  onChange={(e) => setFormData({ ...formData, motivoDescuento: e.target.value })}
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
                rows={2}
              />
            </div>

            {/* ── RESUMEN FINAL ──────────────────────────────────────── */}
            {selectedPlanilla && (() => {
              const totals              = calculateRouteTotals(selectedPlanilla)
              const totalCobrosEfectivo = cobrosVinculados.reduce((s, c) => s + (Number(c.montoEfectivo) || 0), 0)
              const totalCobrosNequi    = cobrosVinculados.reduce((s, c) => s + (Number(c.montoNequi) || 0), 0)
              const totalBilletes       = Number(formData.billetes || 0)
              const totalMonedas        = Number(formData.monedas || 0)
              const totalConsignaciones = consignaciones.reduce((s, c) => s + (Number(c.monto) || 0), 0)
              const efectivoEsperado    = (selectedPlanilla.montoCargue || 0)
                - totals.fiado
                - totals.devoluciones
                - totals.agotados
                - totals.repasos
                - totals.erroresFacturacion
                - Number(formData.descuento || 0)
                + totalCobrosEfectivo
              const nequiEsperado       = totalCobrosNequi
              const totalRecibido       = totalBilletes + totalMonedas + totalConsignaciones
              const diferencia          = totalRecibido - efectivoEsperado

              return (
                <div className="border-t pt-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-700">Resumen:</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-gray-500">Cargue</span><p className="font-semibold">{formatCOP(selectedPlanilla.montoCargue || 0)}</p></div>
                    <div><span className="text-gray-500">Entregado</span><p className="font-semibold text-green-600">{formatCOP(totals.entregado)}</p></div>
                    <div><span className="text-gray-500">Fiados nuevos</span><p className="font-semibold text-orange-600">{formatCOP(totals.fiado)}</p></div>
                    <div><span className="text-gray-500">Devoluciones</span><p className="font-semibold text-red-600">{formatCOP(totals.devoluciones)}</p></div>
                    <div><span className="text-gray-500">Agotados</span><p className="font-semibold text-gray-600">{formatCOP(totals.agotados)}</p></div>
                    <div><span className="text-gray-500">Repasos</span><p className="font-semibold text-blue-600">{formatCOP(totals.repasos)}</p></div>
                    {totalCobrosEfectivo > 0 && <div><span className="text-gray-500">Cobros efectivo</span><p className="font-semibold text-purple-600">+ {formatCOP(totalCobrosEfectivo)}</p></div>}
                    {totalCobrosNequi > 0 && <div><span className="text-gray-500">Cobros Nequi</span><p className="font-semibold text-purple-600">+ {formatCOP(totalCobrosNequi)}</p></div>}
                    {totalBilletes > 0 && <div><span className="text-gray-500">Billetes</span><p className="font-semibold">{formatCOP(totalBilletes)}</p></div>}
                    {totalMonedas > 0 && <div><span className="text-gray-500">Monedas</span><p className="font-semibold">{formatCOP(totalMonedas)}</p></div>}
                    {totalConsignaciones > 0 && <div><span className="text-gray-500">Consignaciones ({consignaciones.length})</span><p className="font-semibold">{formatCOP(totalConsignaciones)}</p></div>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t pt-2">
                    <div className="p-2 bg-emerald-50 rounded text-center">
                      <span className="text-xs text-emerald-600 font-medium">Esperado</span>
                      <p className="font-bold text-emerald-700">{formatCOP(efectivoEsperado)}</p>
                    </div>
                    <div className="p-2 bg-blue-50 rounded text-center">
                      <span className="text-xs text-blue-600 font-medium">Recibido</span>
                      <p className="font-bold text-blue-700">{formatCOP(totalRecibido)}</p>
                    </div>
                  </div>
                  <div className={`p-2 rounded text-center ${Math.abs(diferencia) < 1 ? "bg-green-50" : "bg-red-50"}`}>
                    <span className="text-xs font-medium">Diferencia</span>
                    <p className={`font-bold ${Math.abs(diferencia) < 1 ? "text-green-700" : "text-red-700"}`}>
                      {diferencia > 0 ? "+" : ""}{formatCOP(Math.round(diferencia))}
                    </p>
                  </div>
                </div>
              )
            })()}

          </div>

          <DialogFooter>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Guardando..." : "Confirmar Cuadre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para agrupar rutas y cuadrar */}
      <Dialog
        open={showAgrupadoModal}
        onOpenChange={(open) => (open ? setShowAgrupadoModal(true) : setShowAgrupadoModal(false))}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuadre Agrupado - Manual</DialogTitle>
            <DialogDescription>
              Estás cuadrando {agrupadoData?.totalRutas} rutas para: {agrupadoData?.entregador}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* ── 1. NOVEDADES (solo lectura) ───────────────────────── */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="font-semibold text-sm mb-3">📊 Novedades</h3>
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-100 border border-orange-200">
                  <span className="text-xs text-orange-700 font-medium">Fiado</span>
                  <span className="text-xs font-bold text-orange-800">{formatCOP(Number(formData.fiados) || 0)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 border border-red-200">
                  <span className="text-xs text-red-700 font-medium">Devoluciones</span>
                  <span className="text-xs font-bold text-red-800">{formatCOP(Number(formData.devolucionesParciales) || 0)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-200 border border-gray-300">
                  <span className="text-xs text-gray-700 font-medium">Agotados</span>
                  <span className="text-xs font-bold text-gray-800">{formatCOP(Number(formData.agotados) || 0)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 border border-blue-200">
                  <span className="text-xs text-blue-700 font-medium">Repasos</span>
                  <span className="text-xs font-bold text-blue-800">{formatCOP(Number(formData.repasos) || 0)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-purple-100 border border-purple-200">
                  <span className="text-xs text-purple-700 font-medium">Descuentos</span>
                  <span className="text-xs font-bold text-purple-800">{formatCOP(Number(formData.descuento) || 0)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 border border-amber-200">
                  <span className="text-xs text-amber-700 font-medium">Errores Facturación</span>
                  <span className="text-xs font-bold text-amber-800">{formatCOP(Number(formData.erroresFacturacion) || 0)}</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Registradas automáticamente desde las novedades de las rutas — no editables aquí.
              </p>
            </div>

            {/* ── VARIOS (gastos del entregador, resta del esperado) ─── */}
            <div className="border rounded-lg p-4 bg-slate-50">
              <h3 className="font-semibold text-sm mb-3">💵 Varios</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Monto</Label>
                  <Input type="number" min={0} placeholder="0" className="bg-white"
                    value={formData.varios}
                    onChange={(e) => setFormData({ ...formData, varios: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Nota <span className="text-gray-400">(opcional)</span></Label>
                  <Input placeholder="Ej: Combustible, parqueadero..." className="bg-white"
                    value={formData.motivoVarios}
                    onChange={(e) => setFormData({ ...formData, motivoVarios: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Gastos del entregador (combustible, etc.) — se resta del esperado, igual que un descuento.
              </p>
            </div>

            {/* ── 2. COBROS CxC (suman al esperado) ─────────────────── */}
            <div className="border rounded-lg p-4 bg-purple-50">
              <h3 className="font-semibold text-sm text-purple-800 mb-3">💳 Cobros CxC</h3>
              <div className="flex gap-2 mb-3">
                <Input
                  placeholder="Buscar cliente en fiados..."
                  value={busquedaCobro}
                  onChange={(e) => setBusquedaCobro(e.target.value)}
                  className="flex-1"
                />
              </div>
              {loadingCobros ? (
                <p className="text-xs text-gray-500">Cargando cobros...</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto mb-3">
                  {cobrosDisponibles
                    .filter(c =>
                      !cobrosVinculados.find(v => v.id === c.id) &&
                      (busquedaCobro === "" ||
                        c.cliente.toLowerCase().includes(busquedaCobro.toLowerCase()) ||
                        (c.ruta || "").toLowerCase().includes(busquedaCobro.toLowerCase()))
                    )
                    .map(cobro => (
                      <div key={cobro.id} className="flex items-center justify-between p-2 bg-white rounded border text-sm">
                        <div>
                          <span className="font-medium">{cobro.cliente}</span>
                          {cobro.esPagoAnticipado && (
                            <Badge variant="outline" className="ml-2 text-xs bg-emerald-100 text-emerald-700 border-emerald-300">
                              💰 Cuadre administrativo
                            </Badge>
                          )}
                          <span className="text-gray-500 ml-2 text-xs">{cobro.ruta ? `${cobro.ruta} — ` : ""}{formatCOP(cobro.saldo_pendiente)}</span>
                        </div>
                        <Button size="sm" variant="outline" className="h-6 text-xs border-purple-300 text-purple-700"
                          onClick={() => handleVincularCobro(cobro)}>
                          + Agregar
                        </Button>
                      </div>
                    ))}
                  {cobrosDisponibles.filter(c => !cobrosVinculados.find(v => v.id === c.id)).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">No hay cobros disponibles</p>
                  )}
                </div>
              )}
              {cobrosVinculados.length > 0 && (
                <div className="space-y-3 border-t pt-3">
                  <p className="text-xs font-medium text-purple-700">Cobros incluidos:</p>
                  {cobrosVinculados.map(cobro => (
                    <div key={cobro.id} className="p-3 bg-white rounded border border-purple-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">{cobro.cliente}</span>
                          <span className="text-xs text-gray-500 ml-2">Saldo: {formatCOP(cobro.saldo_pendiente)}</span>
                          {cobro.yaRegistrado && (
                            <span className="text-xs text-green-600 ml-2">✓ Registrado en ruta</span>
                          )}
                          {cobro.esPagoAnticipado && (
                            <Badge variant="outline" className="ml-2 text-xs bg-emerald-100 text-emerald-700 border-emerald-300">
                              💰 Cuadre administrativo
                            </Badge>
                          )}
                        </div>
                        <Button size="sm" variant="ghost" className="h-6 text-red-500"
                          onClick={() => handleDesvincularCobro(cobro.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>

                      {cobro.yaRegistrado || cobro.esPagoAnticipado ? (
                        <div className="text-xs text-gray-600 flex items-center gap-4">
                          <span>Medio: <strong>{cobro.medioPago}</strong></span>
                          <span>Monto: <strong>{formatCOP(getCobroMontoTotal(cobro))}</strong></span>
                          {cobro.numeroFactura && <span>Ref: <strong>{cobro.numeroFactura}</strong></span>}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">N° Factura</Label>
                            <Input placeholder="Factura" className="h-8 text-sm"
                              value={cobro.numeroFactura || ""}
                              onChange={(e) => handleActualizarResultadoCobro(cobro.id, "numeroFactura", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs">Monto Efectivo</Label>
                            <Input type="number" min={0} placeholder="0" className="h-8 text-sm"
                              value={cobro.montoEfectivo || ""}
                              onChange={(e) => handleActualizarResultadoCobro(cobro.id, "montoEfectivo", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs">Fecha</Label>
                            <Input type="date" className="h-8 text-sm"
                              value={cobro.fecha || ""}
                              onChange={(e) => handleActualizarResultadoCobro(cobro.id, "fecha", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs">Medio electrónico</Label>
                            <Select
                              value={cobro.medioPago || "Nequi"}
                              onValueChange={(v) => handleActualizarResultadoCobro(cobro.id, "medioPago", v)}
                            >
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Nequi">Nequi</SelectItem>
                                <SelectItem value="Bancolombia">Bancolombia</SelectItem>
                                <SelectItem value="Daviplata">Daviplata</SelectItem>
                                <SelectItem value="Datafono">Datafono</SelectItem>
                                <SelectItem value="Aval">Aval</SelectItem>
                                <SelectItem value="Nu">Nu</SelectItem>
                                <SelectItem value="Transferencia">Transferencia</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Monto Electrónico</Label>
                            <Input type="number" min={0} placeholder="0" className="h-8 text-sm"
                              value={cobro.montoElectronico || ""}
                              onChange={(e) => handleActualizarResultadoCobro(cobro.id, "montoElectronico", e.target.value)} />
                          </div>
                          <div>
                            <Label className="text-xs">N° Referencia</Label>
                            <Input
                              className={`h-8 text-sm ${
                                referenciasRepetidasEnForm.has((cobro.numeroReferencia || "").trim().toLowerCase()) ||
                                duplicadosBD.has((cobro.numeroReferencia || "").trim().toLowerCase())
                                  ? "border-red-500 bg-red-50 focus:ring-red-500 focus:border-red-500 ring-1 ring-red-500" : ""
                              }`}
                              placeholder="Referencia"
                              value={cobro.numeroReferencia || ""}
                              onChange={(e) => handleActualizarResultadoCobro(cobro.id, "numeroReferencia", e.target.value)} />
                            {referenciasRepetidasEnForm.has((cobro.numeroReferencia || "").trim().toLowerCase()) && (
                              <p className="text-xs text-red-600 mt-0.5">⚠ Referencia duplicada en este cuadre (consignación o cobro)</p>
                            )}
                            {duplicadosBD.has((cobro.numeroReferencia || "").trim().toLowerCase()) && (
                              <p className="text-xs text-red-600 mt-0.5">⚠ Referencia ya registrada</p>
                            )}
                          </div>
                        </div>
                      )}

                      {!cobro.yaRegistrado && (() => {
                        const totalFila = (Number(cobro.montoEfectivo) || 0) + (Number(cobro.montoElectronico) || 0)
                        return totalFila > 0 && totalFila < Number(cobro.saldo_pendiente) ? (
                          <div className="text-xs text-right text-amber-600">
                            Saldo queda: {formatCOP(Number(cobro.saldo_pendiente) - totalFila)}
                          </div>
                        ) : null
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── 3. DINERO RECIBIDO ─────────────────────────────────── */}
            <div className="border rounded-lg p-4 bg-green-50">
              <h3 className="font-semibold text-sm text-green-800 mb-3">💰 Dinero Recibido</h3>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <Label>Billetes</Label>
                  <Input value={formData.billetes}
                    onChange={(e) => setFormData({ ...formData, billetes: e.target.value })}
                    type="number" placeholder="0" className="bg-white" />
                </div>
                <div>
                  <Label>Monedas</Label>
                  <Input value={formData.monedas}
                    onChange={(e) => setFormData({ ...formData, monedas: e.target.value })}
                    type="number" placeholder="0" className="bg-white" />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Consignaciones</p>
                  <Button variant="outline" size="sm" onClick={agregarConsignacion} className="h-7 text-xs bg-white">
                    <Plus className="h-3 w-3 mr-1" />
                    Agregar
                  </Button>
                </div>
                {consignaciones.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">Sin consignaciones</p>
                )}
                {consignaciones.map((cons, idx) => (
                  <div key={cons.id} className="border rounded-lg p-3 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-600">Consignación {idx + 1}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-red-500 p-0"
                        onClick={() => eliminarConsignacion(cons.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Banco</Label>
                        <Input className="h-8 text-sm" placeholder="Bancolombia"
                          value={cons.banco} onChange={(e) => actualizarConsignacion(cons.id, "banco", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Número de referencia</Label>
                        <Input className="h-8 text-sm" placeholder="Referencia"
                          value={cons.numero} onChange={(e) => actualizarConsignacion(cons.id, "numero", e.target.value)} />
                        {referenciasRepetidasEnForm.has(cons.numero.trim().toLowerCase()) && (
                          <p className="text-xs text-red-600 mt-0.5">Duplicada en este cuadre (consignación o cobro)</p>
                        )}
                        {duplicadosBD.has(cons.numero.trim().toLowerCase()) && (
                          <p className="text-xs text-red-600 mt-0.5">Ya registrada en la BD</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Monto</Label>
                        <Input className="h-8 text-sm" type="number" placeholder="0"
                          value={cons.monto} onChange={(e) => actualizarConsignacion(cons.id, "monto", e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs">Fecha</Label>
                        <Input className="h-8 text-sm" type="date"
                          value={cons.fecha} onChange={(e) => actualizarConsignacion(cons.id, "fecha", e.target.value)} />
                      </div>
                      <div className="relative">
                        <Label className="text-xs">Cliente (opcional)</Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="Nombre del cliente"
                          autoComplete="off"
                          value={cons.cliente || ""}
                          onChange={(e) => {
                            actualizarConsignacion(cons.id, "cliente", e.target.value)
                            setAutocompleteClienteConsAbierto(cons.id)
                          }}
                          onFocus={() => setAutocompleteClienteConsAbierto(cons.id)}
                          onBlur={() => setTimeout(() => {
                            setAutocompleteClienteConsAbierto(prev => prev === cons.id ? null : prev)
                          }, 150)}
                        />
                        {autocompleteClienteConsAbierto === cons.id && clientesAgrupadoData.length > 0 && (() => {
                          const texto = (cons.cliente || "").trim().toLowerCase()
                          const sugerencias = clientesAgrupadoData.filter(n => n.toLowerCase().includes(texto)).slice(0, 8)
                          if (sugerencias.length === 0) return null
                          return (
                            <div className="absolute z-10 mt-1 w-full max-h-36 overflow-y-auto bg-white border rounded shadow-md">
                              {sugerencias.map(nombre => (
                                <button
                                  key={nombre}
                                  type="button"
                                  className="block w-full text-left px-2 py-1.5 text-xs hover:bg-purple-50"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    actualizarConsignacion(cons.id, "cliente", nombre)
                                    setAutocompleteClienteConsAbierto(null)
                                  }}
                                >
                                  {nombre}
                                </button>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                      <div>
                        <Label className="text-xs">N° Factura (opcional)</Label>
                        <Input className="h-8 text-sm" placeholder="Factura"
                          value={cons.numero_factura || ""} onChange={(e) => actualizarConsignacion(cons.id, "numero_factura", e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label>Observaciones</Label>
              <Textarea value={formData.observaciones}
                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                rows={3} />
            </div>

            {/* ── 4. RESULTADO (tiempo real) ─────────────────────────── */}
            {(() => {
              const totalCobrosCxC     = cobrosVinculados.reduce((s, c) => s + getCobroMontoTotal(c), 0)
              const totalCobrosElectronico = cobrosVinculados.reduce((s, c) => s + getCobroMontoElectronico(c), 0)
              const totalBilletes      = Number(formData.billetes || 0)
              const totalMonedas       = Number(formData.monedas || 0)
              const totalEfectivo      = totalBilletes + totalMonedas
              const totalConsignaciones = consignaciones.reduce((s, c) => s + (Number(c.monto) || 0), 0)
              const totalNovedades     = (Number(formData.fiados)||0)
                                       + (Number(formData.repasos)||0)
                                       + (Number(formData.devolucionesParciales)||0)
                                       + (Number(formData.agotados)||0)
                                       + (Number(formData.descuento)||0)
                                       + (Number(formData.varios)||0)
                                       + (Number(formData.erroresFacturacion)||0)
              const cargue             = agrupadoData?.totales.cargue || 0
              const esperado           = cargue + totalCobrosCxC - totalNovedades
              const totalRecibido      = totalEfectivo + totalConsignaciones + totalCobrosElectronico
              const diferencia         = totalRecibido - esperado
              return (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-700">📋 Resultado</p>
                  <p className="text-xs text-gray-500">
                    Cargue {formatCOP(cargue)} + Cobros CxC {formatCOP(totalCobrosCxC)} − Novedades {formatCOP(totalNovedades)} = Esperado
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-emerald-50 rounded text-center">
                      <span className="text-xs text-emerald-600 font-medium">Esperado</span>
                      <p className="font-bold text-emerald-700 text-lg">{formatCOP(esperado)}</p>
                    </div>
                    <div className="p-3 bg-blue-50 rounded text-center">
                      <span className="text-xs text-blue-600 font-medium">Total Recibido</span>
                      <p className="font-bold text-blue-700 text-lg">{formatCOP(totalRecibido)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <span className="text-xs text-gray-500">Efectivo (Billetes+Monedas)</span>
                      <p className="font-semibold">{formatCOP(totalEfectivo)}</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <span className="text-xs text-gray-500">Consignaciones</span>
                      <p className="font-semibold">{formatCOP(totalConsignaciones)}</p>
                    </div>
                    <div className="p-2 bg-gray-50 rounded text-center">
                      <span className="text-xs text-gray-500">Cobros CxC</span>
                      <p className="font-semibold">{formatCOP(totalCobrosCxC)}</p>
                      <p className="text-[10px] text-gray-400">
                        {formatCOP(totalCobrosCxC - totalCobrosElectronico)} efectivo (ya en Efectivo) + {formatCOP(totalCobrosElectronico)} electrónico
                      </p>
                    </div>
                  </div>

                  <div className={`p-3 rounded text-center ${Math.abs(diferencia) < 1 ? "bg-green-50" : "bg-red-50"}`}>
                    <span className="text-xs font-medium">Diferencia</span>
                    <p className={`font-bold text-lg ${Math.abs(diferencia) < 1 ? "text-green-700" : "text-red-700"}`}>
                      {diferencia > 0 ? "+" : ""}{formatCOP(Math.round(diferencia))}
                    </p>
                  </div>
                </div>
              )
            })()}
          </div>

          <DialogFooter>
            {(duplicadosBD.size > 0 || referenciasRepetidasEnForm.size > 0) && (
              <div className="w-full bg-red-100 border border-red-400 rounded-lg p-3 mb-2">
                <p className="text-red-700 font-bold text-sm text-center">
                  🚫 HAY REFERENCIAS DUPLICADAS — Corrija antes de confirmar el cuadre
                </p>
                {Array.from(referenciasRepetidasEnForm).map(num => (
                  <p key={num} className="text-red-600 text-xs text-center mt-1">
                    Referencia <strong>{num}</strong> está repetida entre consignaciones y/o cobros de este cuadre
                  </p>
                ))}
                {Array.from(duplicadosBD).map(num => (
                  <p key={num} className="text-red-600 text-xs text-center mt-1">
                    Referencia <strong>{num}</strong> ya fue registrada en un cuadre anterior
                  </p>
                ))}
              </div>
            )}
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
            <Button onClick={handleSubmitAgrupado} disabled={submitting ||
              duplicadosBD.size > 0 ||
              referenciasRepetidasEnForm.size > 0}>
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
      {/* Modal de novedad unificado en caja */}
      <Dialog open={showNovedadCajaModal} onOpenChange={setShowNovedadCajaModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {novedadCajaTipo === "fiado" ? "Registrar Fiado"
                : novedadCajaTipo === "devolucion" ? "Registrar Devolución"
                : novedadCajaTipo === "descuento" ? "Registrar Descuento"
                : "Registrar Agotado"}
            </DialogTitle>
            <DialogDescription>
              {novedadCajaOrder && `${novedadCajaOrder.cliente} — ${formatCOP(calcularSaldoDisponibleCaja(novedadCajaOrder))}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {novedadCajaOrder && (
              <>
                <div className="p-3 bg-gray-50 rounded flex justify-between">
                  <span className="text-sm text-gray-600">Saldo disponible:</span>
                  <span className="font-bold">{formatCOP(calcularSaldoDisponibleCaja(novedadCajaOrder))}</span>
                </div>
                <div>
                  <Label>
                    {novedadCajaTipo === "fiado" ? "¿Cuánto abonó el cliente?"
                      : novedadCajaTipo === "devolucion" ? "¿Cuánto devuelve?"
                      : novedadCajaTipo === "descuento" ? "Monto del descuento"
                      : "Monto agotado (dejar vacío para todo el pedido)"}
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={calculateOrderEffectiveTotal(novedadCajaOrder)}
                    value={novedadCajaMonto}
                    onChange={(e) => setNovedadCajaMonto(e.target.value)}
                    placeholder={novedadCajaTipo === "agotado" ? "Todo el pedido" : "0"}
                    autoFocus
                  />
                </div>
                {novedadCajaMonto && Number(novedadCajaMonto) > 0 && novedadCajaTipo === "fiado" && (
                  <div className="p-3 bg-orange-50 rounded flex justify-between">
                    <span className="text-xs text-orange-600">Saldo que queda fiado:</span>
                    <span className="font-bold text-orange-700">
                      {formatCOP(calcularSaldoDisponibleCaja(novedadCajaOrder) - Number(novedadCajaMonto))}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovedadCajaModal(false)} disabled={submittingNovedadCaja}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitNovedadCaja} disabled={submittingNovedadCaja}>
              {submittingNovedadCaja ? "Registrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para abono de cobro */}
      <Dialog open={showAbonoCobroModal} onOpenChange={setShowAbonoCobroModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Cobro CxC</DialogTitle>
            <DialogDescription>
              {selectedCobro && `Cliente: ${selectedCobro.cliente}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedCobro && (
              <>
                <div className="flex justify-between items-center p-3 bg-purple-50 rounded border border-purple-200">
                  <span className="text-sm text-purple-700">Saldo pendiente:</span>
                  <span className="font-bold text-lg text-purple-700">{formatCOP(selectedCobro.saldo_pendiente)}</span>
                </div>
                <div>
                  <Label htmlFor="montoEfectivoCobro">Efectivo recibido</Label>
                  <Input
                    id="montoEfectivoCobro"
                    type="number"
                    min={0}
                    value={montoEfectivoCobro}
                    onChange={(e) => setMontoEfectivoCobro(e.target.value)}
                    placeholder="0"
                    autoFocus
                  />
                </div>
                <div>
                  <Label htmlFor="montoNequiCobro">Nequi / Transferencia</Label>
                  <Input
                    id="montoNequiCobro"
                    type="number"
                    min={0}
                    value={montoNequiCobro}
                    onChange={(e) => setMontoNequiCobro(e.target.value)}
                    placeholder="0"
                  />
                </div>
                {Number(montoNequiCobro) > 0 && (
                  <div>
                    <Label htmlFor="referenciaNequiCobro">
                      Referencia Nequi <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="referenciaNequiCobro"
                      type="text"
                      value={referenciaNequiCobro}
                      onChange={(e) => setReferenciaNequiCobro(e.target.value)}
                      placeholder="Número de referencia"
                    />
                  </div>
                )}
                {(Number(montoEfectivoCobro) > 0 || Number(montoNequiCobro) > 0) && (
                  <>
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded border border-blue-200">
                      <span className="text-sm text-blue-700">Total abono:</span>
                      <span className="font-bold text-blue-700">
                        {formatCOP((Number(montoEfectivoCobro) || 0) + (Number(montoNequiCobro) || 0))}
                      </span>
                    </div>
                    {(Number(montoEfectivoCobro) || 0) + (Number(montoNequiCobro) || 0) < selectedCobro.saldo_pendiente && (
                      <div className="flex justify-between items-center p-3 bg-amber-50 rounded border border-amber-200">
                        <span className="text-sm text-amber-700">Saldo que queda:</span>
                        <span className="font-bold text-amber-700">
                          {formatCOP(selectedCobro.saldo_pendiente - (Number(montoEfectivoCobro) || 0) - (Number(montoNequiCobro) || 0))}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAbonoCobroModal(false)
                setSelectedCobro(null)
                setMontoEfectivoCobro("")
                setMontoNequiCobro("")
                setReferenciaNequiCobro("")
              }}
              disabled={submittingAbonoCobro}
            >
              Cancelar
            </Button>
            <Button onClick={handleAbonarCobro} disabled={submittingAbonoCobro}>
              {submittingAbonoCobro ? "Registrando..." : "Confirmar"}
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
