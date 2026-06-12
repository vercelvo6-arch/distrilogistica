"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Truck, LogOut, Filter, History, Calendar, ChevronDown, ChevronUp } from "lucide-react"
import type { RouteSheet, User, Order } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import {
  updatePedidoEstado,
} from "@/lib/actions/planillas"
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

interface EntregadorViewProps {
  onLogout: () => void
  user: User
}

export function EntregadorView({ onLogout, user }: EntregadorViewProps) {
  const { toast } = useToast()
  
  const getDateDaysAgo = (days: number) => {
    const date = new Date()
    date.setDate(date.getDate() - days)
    return date.toISOString().split("T")[0]
  }
  
  const [filterFechaDesde, setFilterFechaDesde] = useState(getDateDaysAgo(7))
  const [filterFechaHasta, setFilterFechaHasta] = useState(new Date().toISOString().split("T")[0])
  const [selectedView, setSelectedView] = useState<"rutas" | "historial">("rutas")
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRoutes, setExpandedRoutes] = useState<Set<number>>(new Set())
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())
  const [searchCliente, setSearchCliente] = useState("")
  const [vistaPlana, setVistaPlana] = useState(true) // true = todos los clientes, false = por rutas

  // Modal de novedad unificado
  const [showNovedadModal, setShowNovedadModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [tipoNovedad, setTipoNovedad] = useState<"fiado" | "devolucion" | "agotado" | "descuento" | null>(null)
  const [montoNovedad, setMontoNovedad] = useState("")
  const [submittingNovedad, setSubmittingNovedad] = useState(false)

  // Cobros CxC asignados al entregador
  const [cobrosAsignados, setCobrosAsignados] = useState<any[]>([])
  const [showCobroModal, setShowCobroModal] = useState(false)
  const [selectedCobro, setSelectedCobro] = useState<any | null>(null)
  const [resultadoCobro, setResultadoCobro] = useState<"total" | "abono" | "nopago" | null>(null)
  const [montoEfectivoCobro, setMontoEfectivoCobro] = useState("")
  const [montoNequiCobro, setMontoNequiCobro] = useState("")
  const [referenciaCobro, setReferenciaCobro] = useState("")
  const [fechaCobro, setFechaCobro] = useState("")
  const [submittingCobro, setSubmittingCobro] = useState(false)

  // Estado para novedades
  const [novedadesPorPlanilla, setNovedadesPorPlanilla] = useState<Record<number, any[]>>({})



  const entregador = user.nombre

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (selectedView === "historial") {
      loadHistorial()
    }
  }, [selectedView])



  // ✅ OPTIMIZADO: Una única petición para todas las novedades del entregador
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
      // Expandir todas las rutas por defecto
      setExpandedRoutes(new Set(planillas.map((p: any) => p.id)))

      // Cargar cobros CxC asignados al entregador
      try {
        const cobrosRes = await fetch(`/api/fiados/asignar-cobro?entregador=${encodeURIComponent(entregador)}&rol=entregador`)
        if (cobrosRes.ok) {
          const cobrosData = await cobrosRes.json()
          setCobrosAsignados(cobrosData.cobros || [])
        }
      } catch (e) {
        console.error("[ENTREGADOR] Error cargando cobros:", e)
      }

      // Solo cargar novedades de las planillas del entregador actual
      // Una sola petición en vez de 150+
      const misPlanilas = planillas.filter(
        (p) => p.entregador === entregador &&
               (p.estado === 'alistado' || p.estado === 'completado') &&
               !p.cuadradoEnCaja
      )

      if (misPlanilas.length > 0) {
        const ids = misPlanilas.map((p) => p.id).join(",")
        const novedadesResponse = await fetch(`/api/novedades?planillaIds=${ids}`)
        
        if (novedadesResponse.ok) {
          const novedadesData = await novedadesResponse.json()
          const todasLasNovedades = novedadesData.novedades || []

          // Agrupar por planilla_id para acceso rápido
          const novedadesMap: Record<number, any[]> = {}
          todasLasNovedades.forEach((n: any) => {
            const pid = n.planilla_id
            if (!novedadesMap[pid]) novedadesMap[pid] = []
            novedadesMap[pid].push(n)
          })

          setNovedadesPorPlanilla(novedadesMap)
          console.log('[ENTREGADOR] Novedades cargadas en 1 petición:', todasLasNovedades.length)
        }
      } else {
        setNovedadesPorPlanilla({})
      }

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

  // Lista plana de todos los clientes para el buscador
  const todosLosClientes = filteredRoutes.flatMap((route) =>
    (route.orders || []).map((order) => ({
      ...order,
      planillaId: route.id,
      rutaNombre: route.ruta,
      fechaPlanilla: route.fecha,
    }))
  )

  // Clientes filtrados por busqueda (si hay busqueda filtra, si no muestra todos)
  const clientesFiltrados = searchCliente.trim()
    ? todosLosClientes.filter((c) =>
        c.cliente?.toLowerCase().includes(searchCliente.toLowerCase())
      )
    : todosLosClientes

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

      if (item.estadoProducto === "agotado") return
      if (cantEntregada === 0) return

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
        (n) => n.pedido_id === order.id && n.validado
      )

      if (novedadesDelPedido.length > 0) {
        // ── CANAL NOVEDADES: entregador registro y caja valido ──
        // PRIMERO: Calcular el total del pedido (items entregados)
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
              fiado += monto - montoPagadoNov
              entregado += montoPagadoNov
              totalNovedades += monto - montoPagadoNov
              break
            case "error_facturacion":
              erroresFacturacion += monto
              totalNovedades += monto
              break
          }
        })

        // TERCERO: Entregado es total del pedido menos novedades
        const entregadoDelPedido = totalPedido - totalNovedades
        if (entregadoDelPedido > 0) {
          entregado += entregadoDelPedido
        }

        if (order.descuento) {
          entregado -= Number(order.descuento)
        }
      } else {
        // ── CANAL PEDIDO: sin novedad validada, caja opera normal ──
        let effectiveTotal = 0
        let returnedTotal = 0
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
          if (cantEntregada === 0) return

          const subtotalReal =
            item.subtotalAjustado !== null && item.subtotalAjustado !== undefined
              ? Number(item.subtotalAjustado)
              : cantEntregada * precioUnit
          effectiveTotal += subtotalReal
        })

        devoluciones += returnedTotal
        erroresFacturacion += erroresEnPedido

        if (order.estado === "fiado") {
          const montoPagadoReal = Number(order.montoPagado) || 0
          fiado += effectiveTotal - montoPagadoReal
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
      .filter((n) => n.validado && !pedidoIds.has(n.pedido_id))
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

  // ── HANDLERS NUEVOS ────────────────────────────────────────────────────────

  const handleAbrirNovedad = (order: any, tipo: "fiado" | "devolucion" | "agotado" | "descuento") => {
    setSelectedOrder(order)
    setTipoNovedad(tipo)
    setMontoNovedad(tipo === "agotado" ? String(calculateOrderEffectiveTotal(order)) : "")
    setShowNovedadModal(true)
  }

  const handleConfirmarEntregado = async (order: any) => {
    try {
      await updatePedidoEstado(order.id, "entregado")
      setRouteSheets(prev => prev.map(s => ({
        ...s,
        orders: s.orders.map(o => o.id === order.id ? { ...o, estado: "entregado" as const } : o)
      })))
      toast({ title: "Entregado", description: `${order.cliente} marcado como entregado` })
    } catch {
      toast({ title: "Error", description: "No se pudo actualizar", variant: "destructive" })
    }
  }

  const handleSubmitNovedad = async () => {
    if (!selectedOrder || !tipoNovedad) return

    const totalPedido = calculateOrderEffectiveTotal(selectedOrder)
    const monto = tipoNovedad === "agotado" ? totalPedido : Number(montoNovedad) || 0

    if (tipoNovedad !== "agotado" && (monto <= 0 || monto > totalPedido)) {
      toast({ title: "Error", description: `El monto debe estar entre $1 y ${formatCOP(totalPedido)}`, variant: "destructive" })
      return
    }

    try {
      setSubmittingNovedad(true)

      if (tipoNovedad === "fiado") {
        const saldo = totalPedido - monto
        await updatePedidoEstado(selectedOrder.id, "fiado", monto, saldo)
        setRouteSheets(prev => prev.map(s => ({
          ...s,
          orders: s.orders.map(o => o.id === selectedOrder.id
            ? { ...o, estado: "fiado" as const, montoPagado: monto, saldoPendiente: saldo }
            : o)
        })))
        toast({ title: "Fiado registrado", description: `Abonó ${formatCOP(monto)} — Debe ${formatCOP(saldo)}` })

      } else if (tipoNovedad === "devolucion") {
        await updatePedidoEstado(selectedOrder.id, "devolucion")
        await fetch("/api/novedades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pedidoId: selectedOrder.id,
            planillaId: selectedOrder.planillaId,
            tipoNovedad: "devolucion",
            montoNovedad: monto,
            descripcion: `Devolución registrada por entregador`,
            registradoPor: entregador,
            tipoRegistro: "entregador",
          }),
        })
        setRouteSheets(prev => prev.map(s => ({
          ...s,
          orders: s.orders.map(o => o.id === selectedOrder.id ? { ...o, estado: "devolucion" as const } : o)
        })))
        toast({ title: "Devolución registrada", description: formatCOP(monto) })

      } else if (tipoNovedad === "agotado") {
        await updatePedidoEstado(selectedOrder.id, "devolucion")
        await fetch("/api/novedades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pedidoId: selectedOrder.id,
            planillaId: selectedOrder.planillaId,
            tipoNovedad: "agotado",
            montoNovedad: monto,
            descripcion: "Producto agotado",
            registradoPor: entregador,
            tipoRegistro: "entregador",
          }),
        })
        setRouteSheets(prev => prev.map(s => ({
          ...s,
          orders: s.orders.map(o => o.id === selectedOrder.id ? { ...o, estado: "devolucion" as const } : o)
        })))
        toast({ title: "Agotado registrado", description: formatCOP(monto) })

      } else if (tipoNovedad === "descuento") {
        await fetch(`/api/pedidos/${selectedOrder.id}/descuento`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ descuento: monto, motivo: "Descuento registrado por entregador" }),
        })
        setRouteSheets(prev => prev.map(s => ({
          ...s,
          orders: s.orders.map(o => o.id === selectedOrder.id ? { ...o, descuento: monto } : o)
        })))
        toast({ title: "Descuento registrado", description: formatCOP(monto) })
      }

      setShowNovedadModal(false)
      setSelectedOrder(null)
      setTipoNovedad(null)
      setMontoNovedad("")
    } catch {
      toast({ title: "Error", description: "No se pudo registrar la novedad", variant: "destructive" })
    } finally {
      setSubmittingNovedad(false)
    }
  }

  const handleAbrirCobro = (cobro: any) => {
    setSelectedCobro(cobro)
    setResultadoCobro(null)
    setMontoEfectivoCobro("")
    setMontoNequiCobro("")
    setReferenciaCobro("")
    setFechaCobro(new Date().toISOString().split("T")[0])
    setShowCobroModal(true)
  }

  const handleSubmitCobro = async () => {
    if (!selectedCobro || !resultadoCobro) return

    if (resultadoCobro === "nopago") {
      try {
        setSubmittingCobro(true)
        await fetch("/api/fiados/liberar-cobro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fiadoId: selectedCobro.id }),
        })
        setCobrosAsignados(prev => prev.filter(c => c.id !== selectedCobro.id))
        toast({ title: "Cobro no recibido", description: "Devuelto al admin" })
        setShowCobroModal(false)
      } catch {
        toast({ title: "Error", description: "No se pudo procesar", variant: "destructive" })
      } finally {
        setSubmittingCobro(false)
      }
      return
    }

    const efectivo = Number(montoEfectivoCobro) || 0
    const nequi    = Number(montoNequiCobro) || 0
    const total    = efectivo + nequi

    if (total <= 0) {
      toast({ title: "Error", description: "Ingresa al menos un monto", variant: "destructive" })
      return
    }
    if (nequi > 0 && !referenciaCobro.trim()) {
      toast({ title: "Error", description: "Ingresa la referencia del Nequi", variant: "destructive" })
      return
    }

    try {
      setSubmittingCobro(true)
      const res = await fetch("/api/fiados/registrar-abono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiadoId:          selectedCobro.id,
          montoEfectivo:    efectivo,
          montoNequi:       nequi,
          referenciaPago:   referenciaCobro.trim() || null,
          fechaComprobante: fechaCobro || null,
          entregadorCobro:  entregador,
          observaciones:    "Registrado por entregador en ruta",
        }),
      })
      const data = await res.json()
      if (res.status === 409) {
        toast({
          title: "Referencia duplicada",
          description: "Esa referencia ya fue registrada. Verifica el comprobante.",
          variant: "destructive",
        })
        setSubmittingCobro(false)
        return
      }
      if (!res.ok) throw new Error(data.error)
      setCobrosAsignados(prev => prev.filter(c => c.id !== selectedCobro.id))
      toast({ title: data.pago_completo ? "Cobro completado" : "Abono registrado", description: data.mensaje })
      setShowCobroModal(false)
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setSubmittingCobro(false)
    }
  }

  // Placeholder para evitar error de compilación — ya no se usa
  const handleSubmitFiado = async () => { /* reemplazado por handleSubmitNovedad */ }
  const handleOrderStatusChange = async (orderId: string, newStatus: any) => { /* reemplazado */ }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _unused = { handleSubmitFiado, handleOrderStatusChange }

  const handleDescuentoChange = async () => { /* no aplica al entregador */ }
  const handleMotivoDescuentoChange = async () => { /* no aplica */ }
  const handleMotivoAjusteChange = async () => { /* no aplica */ }

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
        <header className="bg-white border-b sticky top-0 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 rounded-lg">
                  <Truck className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-gray-900 leading-tight">{entregador}</h1>
                  <p className="text-xs text-gray-500 leading-tight">Mis Rutas de Entrega</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-3 py-4">
          <div className="flex gap-2 mb-4">
            <Button
              variant={selectedView === "rutas" ? "default" : "outline"}
              onClick={() => setSelectedView("rutas")}
              className="flex-1 h-10"
            >
              <Truck className="h-4 w-4 mr-2" />
              Mis Rutas
            </Button>
            <Button
              variant={selectedView === "historial" ? "default" : "outline"}
              onClick={() => setSelectedView("historial")}
              className="flex-1 h-10"
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

              {/* BUSCADOR Y TOGGLE DE VISTA */}
              <Card className="p-4 mb-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between mb-3">
                  <Input
                    placeholder="Buscar cliente por nombre..."
                    value={searchCliente}
                    onChange={(e) => setSearchCliente(e.target.value)}
                    className="w-full sm:w-64"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant={vistaPlana ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVistaPlana(true)}
                    >
                      Todos los Clientes
                    </Button>
                    <Button
                      variant={!vistaPlana ? "default" : "outline"}
                      size="sm"
                      onClick={() => setVistaPlana(false)}
                    >
                      Por Rutas
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {clientesFiltrados.length} cliente(s) en {filteredRoutes.length} ruta(s)
                </p>
              </Card>

              {/* COBROS CxC */}
              {cobrosAsignados.length > 0 && (
                <Card className="p-4 border-purple-200 bg-purple-50 mb-4">
                  <h2 className="text-sm font-semibold text-purple-700 mb-3">
                    💳 Cobros CxC asignados ({cobrosAsignados.length})
                  </h2>
                  <div className="space-y-2">
                    {cobrosAsignados.map((cobro) => (
                      <div key={cobro.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-200">
                        <div>
                          <p className="font-medium text-sm text-purple-900">{cobro.cliente}</p>
                          <p className="text-xs text-purple-600">{cobro.ruta} — Saldo: {formatCOP(cobro.saldo_pendiente)}</p>
                        </div>
                        <Button size="sm" onClick={() => handleAbrirCobro(cobro)}
                          className="bg-purple-600 hover:bg-purple-700 text-white h-8 text-xs">
                          Registrar
                        </Button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* VISTA POR RUTAS — principal */}
              <div className="space-y-4">
                {filteredRoutes.length === 0 ? (
                  <Card className="p-8 text-center text-gray-500">No hay rutas activas</Card>
                ) : (
                  filteredRoutes.map((route) => {
                    const totals = calculateRouteTotals(route)
                    const isExpanded = expandedRoutes.has(route.id)
                    const clientesDeLaRuta = searchCliente.trim()
                      ? (route.orders || []).filter(o => o.cliente?.toLowerCase().includes(searchCliente.toLowerCase()))
                      : (route.orders || [])
                    return (
                      <Card key={route.id} className="overflow-hidden">

                        {/* Cabecera de ruta */}
                        <div
                          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                          onClick={() => toggleRouteExpansion(route.id)}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">Ruta {route.ruta}</p>
                              <Badge variant="outline" className="text-xs">{route.totalOrders} clientes</Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(route.fecha).toLocaleDateString("es-CO")}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Cargue</p>
                              <p className="font-bold text-blue-700">{formatCOP(route.totalAmount)}</p>
                            </div>
                            {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                          </div>
                        </div>

                        {/* Totales de la ruta */}
                        <div className="grid grid-cols-4 gap-0 border-t">
                          <div className="text-center p-2 bg-green-50 border-r">
                            <p className="text-xs text-green-600">Entregado</p>
                            <p className="font-bold text-xs text-green-700">{formatCOP(totals.entregado)}</p>
                          </div>
                          <div className="text-center p-2 bg-orange-50 border-r">
                            <p className="text-xs text-orange-600">Fiado</p>
                            <p className="font-bold text-xs text-orange-700">{formatCOP(totals.fiado)}</p>
                          </div>
                          <div className="text-center p-2 bg-red-50 border-r">
                            <p className="text-xs text-red-600">Devolución</p>
                            <p className="font-bold text-xs text-red-700">{formatCOP(totals.devoluciones)}</p>
                          </div>
                          <div className="text-center p-2 bg-gray-100">
                            <p className="text-xs text-gray-600">Agotados</p>
                            <p className="font-bold text-xs text-gray-700">{formatCOP(totals.agotados)}</p>
                          </div>
                        </div>

                        {/* Clientes de la ruta */}
                        {isExpanded && (
                          <div className="border-t divide-y">
                            {clientesDeLaRuta.length === 0 ? (
                              <p className="p-4 text-sm text-gray-500 text-center">Sin clientes</p>
                            ) : (
                              clientesDeLaRuta.map((order) => {
                                if (!order) return null
                                const effectiveTotal = calculateOrderEffectiveTotal(order)
                                const novedadesDelPedido = (novedadesPorPlanilla[route.id] || [])
                                  .filter((n: any) => n.pedido_id === order.id)
                                const yaGestionado = ["entregado","fiado","devolucion"].includes(order.estado)

                                return (
                                  <div key={order.id} className={`p-3 ${yaGestionado ? "bg-gray-50" : "bg-white"}`}>
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="font-medium text-sm truncate">{order.cliente}</p>
                                          <Badge variant="outline" className={`text-xs shrink-0 ${
                                            order.estado === "entregado"  ? "bg-green-100 text-green-700 border-green-300"
                                            : order.estado === "fiado"    ? "bg-orange-100 text-orange-700 border-orange-300"
                                            : order.estado === "devolucion" ? "bg-red-100 text-red-700 border-red-300"
                                            : "bg-gray-100 text-gray-600"
                                          }`}>
                                            {order.estado === "pendiente" ? "PENDIENTE" : order.estado.toUpperCase()}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">{formatCOP(effectiveTotal)}</p>
                                        {novedadesDelPedido.length > 0 && (
                                          <p className="text-xs text-purple-600 mt-0.5">
                                            {novedadesDelPedido.map((n: any) => `${n.tipo_novedad}: ${formatCOP(n.monto_novedad)}`).join(" · ")}
                                          </p>
                                        )}
                                        {order.estado === "fiado" && order.saldoPendiente > 0 && (
                                          <p className="text-xs text-orange-600 mt-0.5">
                                            Abonó {formatCOP(order.montoPagado)} — Debe {formatCOP(order.saldoPendiente)}
                                          </p>
                                        )}
                                      </div>

                                      {!yaGestionado ? (
                                        <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                                          <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-white text-xs px-2"
                                            onClick={() => handleConfirmarEntregado(order)}>
                                            Entregado
                                          </Button>
                                          <Button size="sm" variant="outline" className="h-8 text-xs px-2 border-orange-300 text-orange-700"
                                            onClick={() => handleAbrirNovedad(order, "fiado")}>
                                            Fiado
                                          </Button>
                                          <Button size="sm" variant="outline" className="h-8 text-xs px-2 border-red-300 text-red-700"
                                            onClick={() => handleAbrirNovedad(order, "devolucion")}>
                                            Devolución
                                          </Button>
                                          <Button size="sm" variant="outline" className="h-8 text-xs px-2 border-gray-300 text-gray-600"
                                            onClick={() => handleAbrirNovedad(order, "agotado")}>
                                            Agotado
                                          </Button>
                                          <Button size="sm" variant="outline" className="h-8 text-xs px-2 border-purple-300 text-purple-700"
                                            onClick={() => handleAbrirNovedad(order, "descuento")}>
                                            Descuento
                                          </Button>
                                        </div>
                                      ) : (
                                        <span className="text-green-500 text-sm shrink-0">✓</span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </Card>
                    )
                  })
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Modal de novedad unificado (Fiado / Devolución / Agotado) */}
      <Dialog open={showNovedadModal} onOpenChange={setShowNovedadModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {tipoNovedad === "fiado"      ? "Registrar Fiado"
                : tipoNovedad === "devolucion" ? "Registrar Devolución"
                : tipoNovedad === "descuento"  ? "Registrar Descuento"
                : "Confirmar Agotado"}
            </DialogTitle>
            <DialogDescription>
              {selectedOrder?.cliente} — {formatCOP(calculateOrderEffectiveTotal(selectedOrder))}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {tipoNovedad === "agotado" ? (
              <div className="p-3 bg-gray-50 rounded text-center">
                <p className="text-sm text-gray-600">Se registrará como agotado por</p>
                <p className="text-lg font-bold">{formatCOP(calculateOrderEffectiveTotal(selectedOrder))}</p>
              </div>
            ) : (
              <>
                <div>
                  <Label>
                    {tipoNovedad === "fiado"       ? "¿Cuánto abonó?"
                      : tipoNovedad === "devolucion" ? "¿Cuánto devuelve?"
                      : "Monto del descuento"}
                  </Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={calculateOrderEffectiveTotal(selectedOrder)}
                    value={montoNovedad}
                    onChange={(e) => setMontoNovedad(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="text-lg h-12"
                  />
                </div>
                {Number(montoNovedad) > 0 && tipoNovedad === "fiado" && (
                  <div className="p-3 bg-orange-50 rounded">
                    <p className="text-xs text-orange-600">Saldo que queda fiado:</p>
                    <p className="font-bold text-orange-700">
                      {formatCOP(calculateOrderEffectiveTotal(selectedOrder) - Number(montoNovedad))}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovedadModal(false)} disabled={submittingNovedad}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitNovedad} disabled={submittingNovedad}>
              {submittingNovedad ? "Registrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de cobro CxC */}
      <Dialog open={showCobroModal} onOpenChange={setShowCobroModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cobro CxC</DialogTitle>
            <DialogDescription>
              {selectedCobro?.cliente} — Saldo: {formatCOP(selectedCobro?.saldo_pendiente)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Selector de resultado */}
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant={resultadoCobro === "total" ? "default" : "outline"}
                onClick={() => setResultadoCobro("total")}
                className="text-xs h-9">
                Cobrado total
              </Button>
              <Button size="sm" variant={resultadoCobro === "abono" ? "default" : "outline"}
                onClick={() => setResultadoCobro("abono")}
                className="text-xs h-9">
                Abono parcial
              </Button>
              <Button size="sm" variant={resultadoCobro === "nopago" ? "destructive" : "outline"}
                onClick={() => setResultadoCobro("nopago")}
                className="text-xs h-9">
                No pagó
              </Button>
            </div>

            {(resultadoCobro === "total" || resultadoCobro === "abono") && (
              <>
                <div>
                  <Label className="text-xs">Efectivo</Label>
                  <Input type="number" inputMode="numeric" min={0} placeholder="0"
                    className="text-lg h-12"
                    value={montoEfectivoCobro}
                    onChange={(e) => {
                      setMontoEfectivoCobro(e.target.value)
                      if (resultadoCobro === "total") {
                        setMontoNequiCobro("")
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Nequi / Transferencia</Label>
                  <Input type="number" inputMode="numeric" min={0} placeholder="0"
                    className="text-lg h-12"
                    value={montoNequiCobro}
                    onChange={(e) => setMontoNequiCobro(e.target.value)}
                  />
                </div>
                {/* Referencia y fecha — visibles siempre para Nequi/Transferencia */}
                <div>
                  <Label className="text-xs">
                    Referencia Nequi
                    {Number(montoNequiCobro) > 0 && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <Input
                    placeholder="Número de referencia / comprobante"
                    value={referenciaCobro}
                    onChange={(e) => setReferenciaCobro(e.target.value)}
                    className="h-11"
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Fecha del comprobante
                    {Number(montoNequiCobro) > 0 && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <Input
                    type="date"
                    value={fechaCobro}
                    onChange={(e) => setFechaCobro(e.target.value)}
                    className="h-11"
                  />
                </div>
                {((Number(montoEfectivoCobro) || 0) + (Number(montoNequiCobro) || 0)) > 0 && (
                  <div className="p-2 bg-purple-50 rounded text-sm">
                    <span className="text-purple-600">Total cobrado: </span>
                    <span className="font-bold text-purple-700">
                      {formatCOP((Number(montoEfectivoCobro) || 0) + (Number(montoNequiCobro) || 0))}
                    </span>
                  </div>
                )}
              </>
            )}

            {resultadoCobro === "nopago" && (
              <div className="p-3 bg-red-50 rounded text-sm text-red-700">
                El cobro volverá al admin pendiente de gestión.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCobroModal(false)} disabled={submittingCobro}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitCobro} disabled={!resultadoCobro || submittingCobro}>
              {submittingCobro ? "Registrando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
