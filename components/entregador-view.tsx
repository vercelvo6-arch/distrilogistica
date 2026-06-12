"use client"

import { useState, useEffect } from "react"
import { Truck, LogOut, History, ChevronDown, ChevronUp, RefreshCw } from "lucide-react"
import type { RouteSheet, User } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import { updatePedidoEstado } from "@/lib/actions/planillas"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

interface EntregadorViewProps {
  onLogout: () => void
  user: User
}

export function EntregadorView({ onLogout, user }: EntregadorViewProps) {
  const { toast } = useToast()
  const entregador = user.nombre

  // ── Datos ────────────────────────────────────────────────────────────────────
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [historial, setHistorial] = useState<any[]>([])
  const [cobrosAsignados, setCobrosAsignados] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // ── Vista ────────────────────────────────────────────────────────────────────
  const [selectedView, setSelectedView] = useState<"rutas" | "historial">("rutas")
  const [expandedRoutes, setExpandedRoutes] = useState<Set<number>>(new Set())

  // ── Modal novedad por cliente ─────────────────────────────────────────────────
  const [showNovedadModal, setShowNovedadModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null)
  const [tipoNovedad, setTipoNovedad] = useState<"fiado" | "devolucion" | "agotado" | "descuento" | null>(null)
  const [montoNovedad, setMontoNovedad] = useState("")
  const [submittingNovedad, setSubmittingNovedad] = useState(false)

  // ── Modal cobro CxC ──────────────────────────────────────────────────────────
  const [showCobroModal, setShowCobroModal] = useState(false)
  const [selectedCobro, setSelectedCobro] = useState<any | null>(null)
  const [resultadoCobro, setResultadoCobro] = useState<"total" | "abono" | "nopago" | null>(null)
  const [montoEfectivoCobro, setMontoEfectivoCobro] = useState("")
  const [montoNequiCobro, setMontoNequiCobro] = useState("")
  const [referenciaCobro, setReferenciaCobro] = useState("")
  const [submittingCobro, setSubmittingCobro] = useState(false)

  // ── Carga inicial ────────────────────────────────────────────────────────────
  useEffect(() => { loadData() }, [])
  useEffect(() => { if (selectedView === "historial") loadHistorial() }, [selectedView])

  async function loadData(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      const [planillasRes, cobrosRes] = await Promise.all([
        fetch("/api/planillas"),
        fetch(`/api/fiados/asignar-cobro?entregador=${encodeURIComponent(entregador)}&rol=entregador`)
      ])

      if (!planillasRes.ok) throw new Error("Error al cargar planillas")

      const data = await planillasRes.json()

      const planillas: RouteSheet[] = (Array.isArray(data.planillas) ? data.planillas : [])
        .map((p: any) => ({
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
            direccion: ped.direccion,
            telefono: ped.telefono,
            ruta: p.tipo_ruta,
            fecha: p.fecha,
            planillaId: p.id,
            estado: ped.estado,
            total: Number(ped.total) || 0,
            montoPagado: Number(ped.monto_pagado) || 0,
            saldoPendiente: Number(ped.saldo_pendiente) || Number(ped.total) || 0,
            descuento: Number(ped.descuento) || 0,
            esCobro: ped.es_cobro || false,
            items: (Array.isArray(ped.productos) ? ped.productos : []).map((prod: any) => ({
              codigo: prod.codigo,
              descripcion: prod.nombre,
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

      if (cobrosRes.ok) {
        const cobrosData = await cobrosRes.json()
        setCobrosAsignados(cobrosData.cobros || [])
      }

    } catch (err) {
      console.error("[ENTREGADOR] Error:", err)
      toast({ title: "Error", description: "No se pudieron cargar los datos", variant: "destructive" })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function loadHistorial() {
    try {
      const [resInd, resAgr] = await Promise.all([
        fetch("/api/caja/recibir-efectivo"),
        fetch("/api/cuadres-caja"),
      ])
      const [dataInd, dataAgr] = await Promise.all([resInd.json(), resAgr.json()])

      const individuales = (Array.isArray(dataInd.recepciones) ? dataInd.recepciones : [])
        .filter((r: any) => r.entregador === entregador)
        .map((r: any) => ({ ...r, tipo: "individual" }))

      const agrupados = (Array.isArray(dataAgr.cuadres) ? dataAgr.cuadres : [])
        .filter((c: any) => c.entregador === entregador)
        .map((c: any) => ({
          ...c,
          tipo: "agrupado",
          fecha_recepcion: c.created_at || c.fecha_cuadre,
          efectivo_esperado: c.total_esperado,
          efectivo_recibido: c.total_efectivo,
          diferencia_efectivo: c.diferencia,
          tipo_ruta: Array.isArray(c.rutas_nombres) && c.rutas_nombres.length > 0
            ? c.rutas_nombres.join(", ")
            : `${Array.isArray(c.planillas_ids) ? c.planillas_ids.length : 1} ruta(s)`,
        }))

      setHistorial([...individuales, ...agrupados].sort(
        (a, b) => new Date(b.fecha_recepcion).getTime() - new Date(a.fecha_recepcion).getTime()
      ))
    } catch (err) {
      console.error("[ENTREGADOR] Error historial:", err)
    }
  }

  // ── Filtrar mis rutas activas ─────────────────────────────────────────────────
  const misRutas = routeSheets.filter(
    (s) => s.entregador === entregador &&
           (s.estado === "alistado" || s.estado === "completado" || s.estado === "en_ruta") &&
           !s.cuadradoEnCaja
  )

  // ── Totales globales ──────────────────────────────────────────────────────────
  const totalCargue      = misRutas.reduce((s, r) => s + r.totalAmount, 0)
  const totalClientes    = misRutas.reduce((s, r) => s + r.totalOrders, 0)
  const totalCobrosAsig  = cobrosAsignados.reduce((s, c) => s + Number(c.saldo_pendiente || 0), 0)

  // Contar novedades registradas
  const todosOrders = misRutas.flatMap(r => r.orders || [])
  const fiados      = todosOrders.filter(o => o.estado === "fiado")
  const devueltos   = todosOrders.filter(o => o.estado === "devolucion")
  const pendientes  = todosOrders.filter(o => o.estado === "pendiente")

  const totalFiado       = fiados.reduce((s, o) => s + (o.saldoPendiente || o.total), 0)
  const totalDevolucion  = devueltos.reduce((s, o) => s + (o.total || 0), 0)

  // ── Handlers novedades ────────────────────────────────────────────────────────
  const abrirNovedad = (order: any, tipo: typeof tipoNovedad) => {
    setSelectedOrder(order)
    setTipoNovedad(tipo)
    setMontoNovedad(tipo === "agotado" ? String(order.total) : "")
    setShowNovedadModal(true)
  }

  const handleSubmitNovedad = async () => {
    if (!selectedOrder || !tipoNovedad) return
    const monto = Number(montoNovedad) || 0

    if (tipoNovedad !== "agotado" && monto <= 0) {
      toast({ title: "Error", description: "Ingresa un monto válido", variant: "destructive" })
      return
    }

    try {
      setSubmittingNovedad(true)

      if (tipoNovedad === "fiado") {
        const saldo = (selectedOrder.total || 0) - monto
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
        setRouteSheets(prev => prev.map(s => ({
          ...s,
          orders: s.orders.map(o => o.id === selectedOrder.id ? { ...o, estado: "devolucion" as const } : o)
        })))
        toast({ title: "Devolución registrada", description: formatCOP(monto) })

      } else if (tipoNovedad === "agotado") {
        await updatePedidoEstado(selectedOrder.id, "devolucion")
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
    } catch {
      toast({ title: "Error", description: "No se pudo registrar la novedad", variant: "destructive" })
    } finally {
      setSubmittingNovedad(false)
    }
  }

  // ── Handlers cobro CxC ────────────────────────────────────────────────────────
  const abrirCobro = (cobro: any) => {
    setSelectedCobro(cobro)
    setResultadoCobro(null)
    setMontoEfectivoCobro("")
    setMontoNequiCobro("")
    setReferenciaCobro("")
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
        toast({ title: "Cobro devuelto", description: "Regresó al admin para gestión" })
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
      toast({ title: "Error", description: "Referencia Nequi obligatoria", variant: "destructive" })
      return
    }

    try {
      setSubmittingCobro(true)
      const res = await fetch("/api/fiados/registrar-abono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiadoId: selectedCobro.id,
          montoEfectivo: efectivo,
          montoNequi: nequi,
          referenciaPago: referenciaCobro.trim() || null,
          entregadorCobro: entregador,
          observaciones: "Registrado por entregador en ruta",
        }),
      })
      const data = await res.json()
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

  const estadoColor = (estado: string) => {
    if (estado === "entregado")  return "bg-green-100 text-green-700 border-green-300"
    if (estado === "fiado")      return "bg-orange-100 text-orange-700 border-orange-300"
    if (estado === "devolucion") return "bg-red-100 text-red-700 border-red-300"
    return "bg-gray-100 text-gray-600 border-gray-200"
  }

  const estadoLabel = (estado: string) => {
    if (estado === "pendiente")  return "PENDIENTE"
    if (estado === "entregado")  return "ENTREGADO"
    if (estado === "fiado")      return "FIADO"
    if (estado === "devolucion") return "DEVOLUCION"
    return estado.toUpperCase()
  }

  // ── RENDER ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Truck className="h-10 w-10 text-blue-400 mx-auto mb-3 animate-pulse" />
          <p className="text-gray-500 text-sm">Cargando rutas...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-gray-50" translate="no">

        {/* HEADER STICKY */}
        <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-100 rounded-lg">
                <Truck className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm leading-tight">{entregador}</p>
                <p className="text-xs text-gray-400 leading-tight">
                  {misRutas.length} ruta(s) · {totalClientes} cliente(s)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={onLogout}
                className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Salir
              </button>
            </div>
          </div>

          {/* TABS */}
          <div className="flex border-t">
            <button
              onClick={() => setSelectedView("rutas")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                selectedView === "rutas"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-gray-500"
              }`}
            >
              Mis Rutas
            </button>
            <button
              onClick={() => setSelectedView("historial")}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                selectedView === "historial"
                  ? "text-blue-600 border-b-2 border-blue-600 bg-blue-50"
                  : "text-gray-500"
              }`}
            >
              <History className="h-3.5 w-3.5 inline mr-1" />
              Historial
            </button>
          </div>
        </header>

        <main className="px-3 py-4 max-w-lg mx-auto space-y-4">

          {selectedView === "historial" ? (
            /* ── HISTORIAL ── */
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-gray-800">Mi historial de entregas</h2>
              {historial.length === 0 ? (
                <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
                  Sin historial disponible
                </div>
              ) : historial.map((rec) => (
                <div key={rec.id} className="bg-white rounded-xl border p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">
                        {rec.tipo_ruta || "Ruta"}
                        {rec.tipo === "agrupado" && (
                          <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">AGRUPADO</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {rec.fecha_recepcion
                          ? new Date(String(rec.fecha_recepcion).includes("T")
                              ? rec.fecha_recepcion
                              : String(rec.fecha_recepcion).replace(" ", "T")
                            ).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      rec.estado === "cuadrado"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {rec.estado === "cuadrado" ? "Cuadrado" : "Con diferencia"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mt-3">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs text-gray-400">Esperado</p>
                      <p className="font-bold text-xs text-gray-700">{formatCOP(Number(rec.efectivo_esperado))}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-xs text-gray-400">Recibido</p>
                      <p className="font-bold text-xs text-gray-700">{formatCOP(Number(rec.efectivo_recibido))}</p>
                    </div>
                    <div className={`rounded-lg p-2 ${Number(rec.diferencia_efectivo) === 0 ? "bg-green-50" : "bg-red-50"}`}>
                      <p className="text-xs text-gray-400">Diferencia</p>
                      <p className={`font-bold text-xs ${Number(rec.diferencia_efectivo) === 0 ? "text-green-700" : "text-red-700"}`}>
                        {Number(rec.diferencia_efectivo) > 0 ? "+" : ""}
                        {formatCOP(Number(rec.diferencia_efectivo))}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          ) : (
            /* ── RUTAS ── */
            <>
              {/* RESUMEN DEL DÍA */}
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Resumen del día</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-blue-500 font-medium">Cargue total</p>
                    <p className="font-bold text-blue-700 text-base">{formatCOP(totalCargue)}</p>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-purple-500 font-medium">Cobros CxC</p>
                    <p className="font-bold text-purple-700 text-base">{formatCOP(totalCobrosAsig)}</p>
                    {cobrosAsignados.length > 0 && (
                      <p className="text-xs text-purple-400">{cobrosAsignados.length} pendiente(s)</p>
                    )}
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-orange-500 font-medium">Fiados</p>
                    <p className="font-bold text-orange-700 text-base">{formatCOP(totalFiado)}</p>
                    {fiados.length > 0 && <p className="text-xs text-orange-400">{fiados.length} cliente(s)</p>}
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-red-500 font-medium">Devoluciones</p>
                    <p className="font-bold text-red-700 text-base">{formatCOP(totalDevolucion)}</p>
                    {devueltos.length > 0 && <p className="text-xs text-red-400">{devueltos.length} pedido(s)</p>}
                  </div>
                </div>
                {pendientes.length > 0 && (
                  <div className="mt-2 bg-yellow-50 rounded-lg px-3 py-2 text-center">
                    <p className="text-xs text-yellow-700 font-medium">
                      {pendientes.length} cliente(s) sin gestionar
                    </p>
                  </div>
                )}
              </div>

              {/* COBROS CxC */}
              {cobrosAsignados.length > 0 && (
                <div className="bg-white rounded-xl border border-purple-200">
                  <div className="px-4 py-3 border-b border-purple-100 flex items-center justify-between">
                    <p className="font-semibold text-sm text-purple-800">
                      Cobros CxC asignados
                    </p>
                    <span className="bg-purple-100 text-purple-700 text-xs font-bold px-2 py-0.5 rounded-full">
                      {cobrosAsignados.length}
                    </span>
                  </div>
                  <div className="divide-y divide-purple-50">
                    {cobrosAsignados.map((cobro) => (
                      <div key={cobro.id} className="flex items-center justify-between px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm text-gray-800 truncate">{cobro.cliente}</p>
                          <p className="text-xs text-purple-600 mt-0.5">
                            Ruta {cobro.ruta} · Saldo: <span className="font-semibold">{formatCOP(cobro.saldo_pendiente)}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => abrirCobro(cobro)}
                          className="ml-3 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2 rounded-lg shrink-0"
                        >
                          Registrar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* RUTAS */}
              {misRutas.length === 0 ? (
                <div className="bg-white rounded-xl border p-8 text-center text-gray-400 text-sm">
                  No hay rutas activas hoy
                </div>
              ) : misRutas.map((route) => {
                const isExpanded = expandedRoutes.has(route.id)
                const orders = route.orders || []
                const pendientesRuta = orders.filter(o => o.estado === "pendiente").length
                const gestionadosRuta = orders.filter(o => o.estado !== "pendiente").length

                return (
                  <div key={route.id} className="bg-white rounded-xl border overflow-hidden">

                    {/* Header de ruta */}
                    <button
                      className="w-full px-4 py-3 flex items-center justify-between text-left active:bg-gray-50"
                      onClick={() => {
                        const next = new Set(expandedRoutes)
                        if (next.has(route.id)) next.delete(route.id)
                        else next.add(route.id)
                        setExpandedRoutes(next)
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-900 text-sm">Ruta {route.ruta}</p>
                          {pendientesRuta > 0 && (
                            <span className="bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
                              {pendientesRuta} pendiente(s)
                            </span>
                          )}
                          {gestionadosRuta > 0 && (
                            <span className="bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full font-medium">
                              {gestionadosRuta} gestionado(s)
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {orders.length} cliente(s) · {new Date(route.fecha + "T12:00:00").toLocaleDateString("es-CO")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Cargue</p>
                          <p className="font-bold text-blue-700 text-sm">{formatCOP(route.totalAmount)}</p>
                        </div>
                        {isExpanded
                          ? <ChevronUp className="h-4 w-4 text-gray-400" />
                          : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </button>

                    {/* Clientes de la ruta */}
                    {isExpanded && (
                      <div className="border-t divide-y">
                        {orders.length === 0 ? (
                          <p className="p-4 text-sm text-gray-400 text-center">Sin clientes</p>
                        ) : orders.map((order) => {
                          const yaGestionado = order.estado !== "pendiente"
                          const esFiado = order.estado === "fiado"

                          return (
                            <div key={order.id} className={`p-4 ${yaGestionado ? "bg-gray-50" : "bg-white"}`}>
                              {/* Info del cliente */}
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-sm text-gray-900 truncate">
                                      {order.cliente}
                                    </p>
                                    <Badge
                                      variant="outline"
                                      className={`text-xs shrink-0 ${estadoColor(order.estado)}`}
                                    >
                                      {estadoLabel(order.estado)}
                                    </Badge>
                                  </div>
                                  {order.direccion && (
                                    <p className="text-xs text-gray-400 mt-0.5 truncate">{order.direccion}</p>
                                  )}
                                  <p className="text-sm font-bold text-gray-700 mt-1">
                                    {formatCOP(order.total)}
                                  </p>
                                  {esFiado && order.saldoPendiente > 0 && (
                                    <p className="text-xs text-orange-600 mt-0.5">
                                      Abonó {formatCOP(order.montoPagado)} · Debe {formatCOP(order.saldoPendiente)}
                                    </p>
                                  )}
                                  {order.descuento > 0 && (
                                    <p className="text-xs text-purple-600 mt-0.5">
                                      Descuento: {formatCOP(order.descuento)}
                                    </p>
                                  )}
                                </div>
                                {yaGestionado && (
                                  <span className="text-green-500 text-lg shrink-0 mt-0.5">✓</span>
                                )}
                              </div>

                              {/* Botones de novedad — solo si pendiente */}
                              {!yaGestionado && (
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                  <button
                                    onClick={() => abrirNovedad(order, "fiado")}
                                    className="py-2.5 rounded-lg border border-orange-300 text-orange-700 text-sm font-medium active:bg-orange-50"
                                  >
                                    Fiado
                                  </button>
                                  <button
                                    onClick={() => abrirNovedad(order, "devolucion")}
                                    className="py-2.5 rounded-lg border border-red-300 text-red-700 text-sm font-medium active:bg-red-50"
                                  >
                                    Devolución
                                  </button>
                                  <button
                                    onClick={() => abrirNovedad(order, "agotado")}
                                    className="py-2.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium active:bg-gray-50"
                                  >
                                    Agotado
                                  </button>
                                  <button
                                    onClick={() => abrirNovedad(order, "descuento")}
                                    className="py-2.5 rounded-lg border border-purple-300 text-purple-700 text-sm font-medium active:bg-purple-50"
                                  >
                                    Descuento
                                  </button>
                                </div>
                              )}

                              {/* Si ya gestionado pero quiere editar */}
                              {yaGestionado && (
                                <button
                                  onClick={() => {
                                    const tipo = order.estado === "fiado" ? "fiado"
                                      : order.estado === "devolucion" ? "devolucion"
                                      : "agotado"
                                    abrirNovedad(order, tipo as any)
                                  }}
                                  className="mt-2 w-full py-2 rounded-lg border border-gray-200 text-gray-500 text-xs font-medium active:bg-gray-100"
                                >
                                  Corregir novedad
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </main>
      </div>

      {/* ── MODAL NOVEDAD ── */}
      <Dialog open={showNovedadModal} onOpenChange={setShowNovedadModal}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="text-base">
              {tipoNovedad === "fiado"     ? "Registrar Fiado"
               : tipoNovedad === "devolucion" ? "Registrar Devolución"
               : tipoNovedad === "descuento"  ? "Registrar Descuento"
               : "Confirmar Agotado"}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {selectedOrder?.cliente}
              <span className="font-semibold ml-1">{formatCOP(selectedOrder?.total)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {tipoNovedad === "agotado" ? (
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-sm text-gray-500 mb-1">Se registrará como agotado por</p>
                <p className="text-2xl font-bold text-gray-800">{formatCOP(selectedOrder?.total)}</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">
                    {tipoNovedad === "fiado"      ? "¿Cuánto abonó el cliente?"
                     : tipoNovedad === "devolucion" ? "¿Cuánto devuelve?"
                     : "Monto del descuento"}
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={selectedOrder?.total}
                    value={montoNovedad}
                    onChange={(e) => setMontoNovedad(e.target.value)}
                    placeholder="0"
                    autoFocus
                    className="w-full text-xl font-bold border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-400"
                  />
                </div>
                {Number(montoNovedad) > 0 && tipoNovedad === "fiado" && (
                  <div className="bg-orange-50 rounded-xl p-3 flex justify-between">
                    <span className="text-sm text-orange-600">Saldo fiado:</span>
                    <span className="font-bold text-orange-700">
                      {formatCOP((selectedOrder?.total || 0) - Number(montoNovedad))}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={() => setShowNovedadModal(false)}
              disabled={submittingNovedad}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmitNovedad}
              disabled={submittingNovedad}
              className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {submittingNovedad ? "Registrando..." : "Confirmar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MODAL COBRO CxC ── */}
      <Dialog open={showCobroModal} onOpenChange={setShowCobroModal}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="text-base">Cobro CxC</DialogTitle>
            <DialogDescription>
              <span className="font-semibold">{selectedCobro?.cliente}</span>
              <br />
              <span className="text-sm">Saldo: <span className="font-bold text-purple-700">{formatCOP(selectedCobro?.saldo_pendiente)}</span></span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Selector resultado */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: "total",  label: "Cobrado total",  color: "bg-green-600" },
                { key: "abono",  label: "Abono parcial",  color: "bg-blue-600" },
                { key: "nopago", label: "No pagó",        color: "bg-red-600" },
              ].map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => setResultadoCobro(key as any)}
                  className={`py-3 rounded-xl text-xs font-semibold transition-colors ${
                    resultadoCobro === key
                      ? `${color} text-white`
                      : "border border-gray-200 text-gray-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {(resultadoCobro === "total" || resultadoCobro === "abono") && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Efectivo</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={montoEfectivoCobro}
                    onChange={(e) => setMontoEfectivoCobro(e.target.value)}
                    placeholder="0"
                    className="w-full text-lg font-bold border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Nequi / Transferencia</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={montoNequiCobro}
                    onChange={(e) => setMontoNequiCobro(e.target.value)}
                    placeholder="0"
                    className="w-full text-lg font-bold border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400"
                  />
                </div>
                {Number(montoNequiCobro) > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">
                      Referencia Nequi <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={referenciaCobro}
                      onChange={(e) => setReferenciaCobro(e.target.value)}
                      placeholder="Número de referencia"
                      className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-purple-400 text-sm"
                    />
                  </div>
                )}
                {((Number(montoEfectivoCobro) || 0) + (Number(montoNequiCobro) || 0)) > 0 && (
                  <div className="bg-purple-50 rounded-xl p-3 flex justify-between">
                    <span className="text-sm text-purple-600">Total cobrado:</span>
                    <span className="font-bold text-purple-700">
                      {formatCOP((Number(montoEfectivoCobro) || 0) + (Number(montoNequiCobro) || 0))}
                    </span>
                  </div>
                )}
              </>
            )}

            {resultadoCobro === "nopago" && (
              <div className="bg-red-50 rounded-xl p-4 text-center">
                <p className="text-sm text-red-700">El cobro regresará al admin para gestión</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <button
              onClick={() => setShowCobroModal(false)}
              disabled={submittingCobro}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmitCobro}
              disabled={!resultadoCobro || submittingCobro}
              className="flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold disabled:opacity-50"
            >
              {submittingCobro ? "Registrando..." : "Confirmar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
