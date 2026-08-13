"use client"

import { Fragment, useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { LogOut, Wallet, Link2, Clock, X, ChevronDown, ChevronUp, Users, Plus } from "lucide-react"
import type { User } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import { useToast } from "@/hooks/use-toast"

interface PagosAnticipadosViewProps {
  user: User
  onLogout: () => void
}

const MEDIOS_PAGO = ["Efectivo", "Nequi", "Bancolombia", "Daviplata", "Datafono", "Aval", "Nu", "Transferencia"]

type EstadoPago = "pendiente" | "identificado" | "vinculado"

interface PagoAnticipado {
  id: number
  medio_pago: string
  referencia: string
  monto: string | number
  cliente: string | null
  registrado_por: string | null
  registrado_en: string
  estado: EstadoPago
  tipo: string | null
  fiado_id: string | null
  entregador_vinculado: string | null
  observaciones: string | null
  vinculado_en: string | null
  vinculado_por: string | null
}

interface Coincidencia {
  id: string | number
  cliente: string
  ruta?: string
  saldo_pendiente: number | string
}

interface DestinoCandidato {
  tipo: "fiado" | "pedido_asesor"
  id: string | number
  cliente: string
  monto_referencia: number | string
  entregador_vinculado: string
  ruta?: string
  planilla_id?: string
}

interface PedidoAsesorPendiente {
  id: string
  cliente: string
  total: number | string
  created_at: string
  asesor: string | null
  planilla_id: string
  ruta: string | null
  fecha: string
}

function antiguedadDias(registradoEn: string) {
  const diffMs = Date.now() - new Date(registradoEn).getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function BadgeAntiguedad({ registradoEn }: { registradoEn: string }) {
  const dias = antiguedadDias(registradoEn)
  if (dias >= 3) {
    return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">🔴 {dias}d</Badge>
  }
  if (dias >= 1) {
    return <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">🟡 {dias}d</Badge>
  }
  return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">Hoy</Badge>
}

function BadgeEstado({ estado }: { estado: EstadoPago }) {
  if (estado === "vinculado") {
    return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">Vinculado</Badge>
  }
  if (estado === "identificado") {
    return (
      <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-300">
        Identificado - pendiente de cuadre
      </Badge>
    )
  }
  return <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">Pendiente</Badge>
}

function BadgeTipoDestino({ tipo }: { tipo: "fiado" | "pedido_asesor" }) {
  return tipo === "fiado" ? (
    <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300">Fiado</Badge>
  ) : (
    <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300">Pedido asesor</Badge>
  )
}

export function PagosAnticipadosView({ user, onLogout }: PagosAnticipadosViewProps) {
  const { toast } = useToast()

  const [pagos, setPagos] = useState<PagoAnticipado[]>([])
  const [loadingPagos, setLoadingPagos] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<EstadoPago | "todos">("pendiente")

  const [formData, setFormData] = useState({
    observaciones: "",
    fechaPago: new Date().toISOString().split("T")[0],
    numeroFactura: "",
  })
  // ── Líneas de pago: un cliente puede pagar el mismo saldo en varias partes
  // (dos transferencias con referencias distintas, o una transferencia + un
  // efectivo) — cada línea se registra como su propia fila en pagos_anticipados,
  // pero todas comparten fecha/factura/observaciones/destino y se envían juntas.
  const [lineasPago, setLineasPago] = useState<{ id: string; medioPago: string; referencia: string; monto: string }[]>([
    { id: crypto.randomUUID(), medioPago: "Efectivo", referencia: "", monto: "" },
  ])
  const montoTotalLineas = useMemo(
    () => lineasPago.reduce((s, l) => s + (Number(l.monto) || 0), 0),
    [lineasPago]
  )
  const agregarLineaPago = () => {
    setLineasPago(prev => [...prev, { id: crypto.randomUUID(), medioPago: "Efectivo", referencia: "", monto: "" }])
  }
  const eliminarLineaPago = (id: string) => {
    setLineasPago(prev => (prev.length > 1 ? prev.filter(l => l.id !== id) : prev))
  }
  const actualizarLineaPago = (id: string, campo: "medioPago" | "referencia" | "monto", valor: string) => {
    setLineasPago(prev => prev.map(l => (l.id === id ? { ...l, [campo]: valor } : l)))
  }
  const [submitting, setSubmitting] = useState(false)
  const [coincidencias, setCoincidencias] = useState<Coincidencia[]>([])
  const [ultimoPagoRegistrado, setUltimoPagoRegistrado] = useState<PagoAnticipado | null>(null)

  // ── Destino elegido en el propio formulario de registro (opcional) ─────────
  const [tabDestino, setTabDestino] = useState<"fiado" | "pedido_asesor">("fiado")
  const [destinoSeleccionado, setDestinoSeleccionado] = useState<DestinoCandidato | null>(null)
  const [busquedaFiado, setBusquedaFiado] = useState("")
  const [resultadosFiado, setResultadosFiado] = useState<DestinoCandidato[]>([])
  const [buscandoFiado, setBuscandoFiado] = useState(false)
  const [busquedaAsesor, setBusquedaAsesor] = useState("")
  const [resultadosAsesor, setResultadosAsesor] = useState<DestinoCandidato[]>([])
  const [buscandoAsesor, setBuscandoAsesor] = useState(false)

  const [pagoAIdentificar, setPagoAIdentificar] = useState<PagoAnticipado | null>(null)
  const [busquedaDestino, setBusquedaDestino] = useState("")
  const [candidatosDestino, setCandidatosDestino] = useState<DestinoCandidato[]>([])
  const [loadingCandidatos, setLoadingCandidatos] = useState(false)
  const [identificando, setIdentificando] = useState(false)

  // ── Rendición de cuentas por asesor ─────────────────────────────────────────
  const [pedidosAsesor, setPedidosAsesor] = useState<PedidoAsesorPendiente[]>([])
  const [loadingPedidosAsesor, setLoadingPedidosAsesor] = useState(true)
  const [filtroAsesorTexto, setFiltroAsesorTexto] = useState("")
  const [asesorExpandido, setAsesorExpandido] = useState<string | null>(null)

  // ── Registrar pedido de asesor histórico (sin planilla) ─────────────────────
  const [showDialogPedidoAsesor, setShowDialogPedidoAsesor] = useState(false)
  const [formPedidoAsesor, setFormPedidoAsesor] = useState({
    ruta: "", cliente: "", monto: "", asesor: "",
    fecha: new Date().toISOString().split("T")[0], observaciones: "",
  })
  const [submittingPedidoAsesor, setSubmittingPedidoAsesor] = useState(false)

  const handleCrearPedidoAsesor = async () => {
    if (!formPedidoAsesor.cliente.trim() || !formPedidoAsesor.asesor.trim() || !formPedidoAsesor.monto || Number(formPedidoAsesor.monto) <= 0) {
      toast({ title: "Error", description: "Cliente, asesor y monto son obligatorios", variant: "destructive" })
      return
    }
    setSubmittingPedidoAsesor(true)
    try {
      const res = await fetch("/api/pagos-anticipados/crear-pedido-asesor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ruta: formPedidoAsesor.ruta.trim() || null,
          cliente: formPedidoAsesor.cliente.trim(),
          monto: Number(formPedidoAsesor.monto),
          asesor: formPedidoAsesor.asesor.trim(),
          fecha: formPedidoAsesor.fecha,
          observaciones: formPedidoAsesor.observaciones.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al registrar el pedido")

      toast({ title: "Pedido registrado", description: `Se agregó el pedido de ${formPedidoAsesor.cliente} para ${formPedidoAsesor.asesor}` })
      setShowDialogPedidoAsesor(false)
      setFormPedidoAsesor({ ruta: "", cliente: "", monto: "", asesor: "", fecha: new Date().toISOString().split("T")[0], observaciones: "" })
      loadPedidosAsesor()
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Error al registrar el pedido", variant: "destructive" })
    } finally {
      setSubmittingPedidoAsesor(false)
    }
  }

  // ── Registrar fiado histórico (sin pedido) ──────────────────────────────────
  const [showDialogFiado, setShowDialogFiado] = useState(false)
  const [formFiado, setFormFiado] = useState({
    cliente: "", entregador: "", ruta: "", monto: "",
    fecha: new Date().toISOString().split("T")[0], observaciones: "",
  })
  const [submittingFiado, setSubmittingFiado] = useState(false)

  const handleCrearFiado = async () => {
    if (!formFiado.cliente.trim() || !formFiado.entregador.trim() || !formFiado.monto || Number(formFiado.monto) <= 0) {
      toast({ title: "Error", description: "Cliente, entregador y monto son obligatorios", variant: "destructive" })
      return
    }
    setSubmittingFiado(true)
    try {
      const res = await fetch("/api/pagos-anticipados/crear-fiado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: formFiado.cliente.trim(),
          entregador: formFiado.entregador.trim(),
          ruta: formFiado.ruta.trim() || null,
          monto: Number(formFiado.monto),
          fecha: formFiado.fecha,
          observaciones: formFiado.observaciones.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al registrar el fiado")

      toast({ title: "Fiado registrado", description: `Se agregó el fiado de ${formFiado.cliente} a cargo de ${formFiado.entregador}` })
      setShowDialogFiado(false)
      setFormFiado({ cliente: "", entregador: "", ruta: "", monto: "", fecha: new Date().toISOString().split("T")[0], observaciones: "" })
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Error al registrar el fiado", variant: "destructive" })
    } finally {
      setSubmittingFiado(false)
    }
  }

  const loadPedidosAsesor = useCallback(async () => {
    setLoadingPedidosAsesor(true)
    try {
      const res = await fetch("/api/pagos-anticipados/pedidos-asesor")
      const data = await res.json()
      setPedidosAsesor(data.pedidos || [])
    } catch (error) {
      console.error("[PAGOS-ANTICIPADOS] Error cargando pedidos de asesor:", error)
    } finally {
      setLoadingPedidosAsesor(false)
    }
  }, [])

  useEffect(() => {
    loadPedidosAsesor()
  }, [loadPedidosAsesor])

  const resumenAsesores = useMemo(() => {
    const mapa = new Map<string, { asesor: string; numPedidos: number; total: number; pedidos: PedidoAsesorPendiente[] }>()
    for (const p of pedidosAsesor) {
      const nombre = p.asesor || "(sin nombre)"
      if (!mapa.has(nombre)) {
        mapa.set(nombre, { asesor: nombre, numPedidos: 0, total: 0, pedidos: [] })
      }
      const entry = mapa.get(nombre)!
      entry.numPedidos += 1
      entry.total += Number(p.total) || 0
      entry.pedidos.push(p)
    }
    const filtro = filtroAsesorTexto.trim().toLowerCase()
    return Array.from(mapa.values())
      .filter((e) => !filtro || e.asesor.toLowerCase().includes(filtro))
      .sort((a, b) => b.total - a.total)
  }, [pedidosAsesor, filtroAsesorTexto])

  const loadPagos = useCallback(async () => {
    setLoadingPagos(true)
    try {
      const url = filtroEstado === "todos"
        ? "/api/pagos-anticipados"
        : `/api/pagos-anticipados?estado=${filtroEstado}`
      const res = await fetch(url)
      const data = await res.json()
      setPagos(data.pagos || [])
    } catch (error) {
      console.error("[PAGOS-ANTICIPADOS] Error cargando pagos:", error)
      toast({ title: "Error", description: "No se pudo cargar el cuadre administrativo", variant: "destructive" })
    } finally {
      setLoadingPagos(false)
    }
  }, [filtroEstado, toast])

  useEffect(() => {
    loadPagos()
  }, [loadPagos])

  // ── Búsqueda de fiados (Sección A) ──────────────────────────────────────────
  useEffect(() => {
    if (!busquedaFiado.trim()) {
      setResultadosFiado([])
      return
    }
    const timer = setTimeout(async () => {
      setBuscandoFiado(true)
      try {
        const params = new URLSearchParams({ q: busquedaFiado.trim() })
        if (montoTotalLineas > 0) params.set("monto", String(montoTotalLineas))
        const res = await fetch(`/api/pagos-anticipados/buscar-destino?${params.toString()}`)
        const data = await res.json()
        setResultadosFiado((data.resultados || []).filter((r: DestinoCandidato) => r.tipo === "fiado"))
      } catch (error) {
        console.error("[PAGOS-ANTICIPADOS] Error buscando fiado:", error)
        setResultadosFiado([])
      } finally {
        setBuscandoFiado(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [busquedaFiado, montoTotalLineas])

  // ── Búsqueda de pedidos de asesor (Sección B) ───────────────────────────────
  useEffect(() => {
    if (!busquedaAsesor.trim()) {
      setResultadosAsesor([])
      return
    }
    const timer = setTimeout(async () => {
      setBuscandoAsesor(true)
      try {
        const params = new URLSearchParams({ q: busquedaAsesor.trim() })
        if (montoTotalLineas > 0) params.set("monto", String(montoTotalLineas))
        const res = await fetch(`/api/pagos-anticipados/buscar-destino?${params.toString()}`)
        const data = await res.json()
        setResultadosAsesor((data.resultados || []).filter((r: DestinoCandidato) => r.tipo === "pedido_asesor"))
      } catch (error) {
        console.error("[PAGOS-ANTICIPADOS] Error buscando pedido de asesor:", error)
        setResultadosAsesor([])
      } finally {
        setBuscandoAsesor(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [busquedaAsesor, montoTotalLineas])

  const limpiarDestino = () => {
    setDestinoSeleccionado(null)
    setBusquedaFiado("")
    setBusquedaAsesor("")
    setResultadosFiado([])
    setResultadosAsesor([])
  }

  const handleSubmit = async () => {
    const lineasValidas = lineasPago.filter(l => l.monto && Number(l.monto) > 0)
    if (lineasValidas.length === 0) {
      toast({ title: "Error", description: "Agrega al menos una línea con monto mayor a 0", variant: "destructive" })
      return
    }
    // La referencia (número de consignación/transacción) no aplica a pagos en Efectivo.
    for (const linea of lineasValidas) {
      if (linea.medioPago !== "Efectivo" && !linea.referencia.trim()) {
        toast({
          title: "Error",
          description: `Falta la referencia en la línea de ${linea.medioPago} (${formatCOP(Number(linea.monto) || 0)})`,
          variant: "destructive",
        })
        return
      }
    }

    setSubmitting(true)
    const idsExitosos = new Set<string>()
    const errores: string[] = []
    let ultimoPago: PagoAnticipado | null = null
    let ultimasCoincidencias: Coincidencia[] = []
    try {
      for (const linea of lineasValidas) {
        try {
          const res = await fetch("/api/pagos-anticipados", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              medioPago: linea.medioPago,
              referencia: linea.referencia.trim(),
              monto: Number(linea.monto),
              cliente: destinoSeleccionado?.cliente || null,
              observaciones: formData.observaciones.trim() || null,
              destinoTipo: destinoSeleccionado?.tipo || null,
              destinoId: destinoSeleccionado?.id || null,
              entregadorVinculado: destinoSeleccionado?.entregador_vinculado || null,
              fechaPago: formData.fechaPago,
              numeroFactura: formData.numeroFactura.trim() || null,
            }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || "Error al registrar el pago")
          idsExitosos.add(linea.id)
          ultimoPago = data.pago
          ultimasCoincidencias = data.coincidencias || []
        } catch (error) {
          errores.push(
            `${linea.medioPago} ${formatCOP(Number(linea.monto) || 0)}: ${error instanceof Error ? error.message : "error desconocido"}`
          )
        }
      }

      const numExitosos = idsExitosos.size
      if (numExitosos > 0) {
        setUltimoPagoRegistrado(ultimoPago)
        setCoincidencias(ultimasCoincidencias)
      }

      if (errores.length === 0) {
        toast({
          title: "Pago registrado",
          description: `${numExitosos} línea(s) por ${formatCOP(montoTotalLineas)} registradas correctamente`,
        })
        setLineasPago([{ id: crypto.randomUUID(), medioPago: "Efectivo", referencia: "", monto: "" }])
        setFormData({ observaciones: "", fechaPago: new Date().toISOString().split("T")[0], numeroFactura: "" })
        limpiarDestino()
        setTabDestino("fiado")
      } else {
        toast({
          title: numExitosos > 0 ? "Registrado parcialmente" : "Error",
          description: numExitosos > 0
            ? `${numExitosos} línea(s) sí se guardaron. Fallaron: ${errores.join(" · ")}`
            : errores.join(" · "),
          variant: "destructive",
        })
        // Deja solo las líneas que fallaron, listas para corregir — las que sí
        // se guardaron no deben reenviarse.
        setLineasPago(prev => {
          const restantes = prev.filter(l => !idsExitosos.has(l.id))
          return restantes.length > 0 ? restantes : [{ id: crypto.randomUUID(), medioPago: "Efectivo", referencia: "", monto: "" }]
        })
      }
      loadPagos()
    } finally {
      setSubmitting(false)
    }
  }

  const abrirIdentificar = (pago: PagoAnticipado) => {
    setPagoAIdentificar(pago)
    setBusquedaDestino(pago.cliente || "")
    setCandidatosDestino([])
  }

  const cerrarIdentificar = () => {
    setPagoAIdentificar(null)
    setBusquedaDestino("")
    setCandidatosDestino([])
  }

  useEffect(() => {
    if (!pagoAIdentificar) return
    const timer = setTimeout(async () => {
      setLoadingCandidatos(true)
      try {
        const params = new URLSearchParams()
        if (busquedaDestino.trim()) params.set("q", busquedaDestino.trim())
        params.set("monto", String(pagoAIdentificar.monto))
        const res = await fetch(`/api/pagos-anticipados/buscar-destino?${params.toString()}`)
        const data = await res.json()
        setCandidatosDestino(data.resultados || [])
      } catch (error) {
        console.error("[PAGOS-ANTICIPADOS] Error buscando destino:", error)
        setCandidatosDestino([])
      } finally {
        setLoadingCandidatos(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [pagoAIdentificar, busquedaDestino])

  const handleIdentificar = async (destino: DestinoCandidato) => {
    if (!pagoAIdentificar) return
    setIdentificando(true)
    try {
      const res = await fetch(`/api/pagos-anticipados/${pagoAIdentificar.id}/identificar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinoTipo: destino.tipo,
          destinoId: destino.id,
          entregadorVinculado: destino.entregador_vinculado,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al identificar el pago")

      toast({ title: "Identificado", description: data.mensaje })
      cerrarIdentificar()
      loadPagos()
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Error al identificar el pago", variant: "destructive" })
    } finally {
      setIdentificando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Wallet className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Cuadre Administrativo</h1>
                <p className="text-sm text-gray-500">Vouchers y transferencias recibidos antes del cuadre de caja</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={user.rol === "administrador" ? "/admin" : "/caja"}>
                <Button variant="outline" size="sm">Volver</Button>
              </Link>
              <Button variant="outline" onClick={onLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Formulario de registro */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Registrar pago</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Fecha del pago</Label>
              <Input
                className="mt-1"
                type="date"
                value={formData.fechaPago}
                onChange={(e) => setFormData({ ...formData, fechaPago: e.target.value })}
              />
            </div>
            <div>
              <Label>N° Factura <span className="text-gray-400 text-xs">(opcional)</span></Label>
              <Input
                className="mt-1"
                placeholder="Factura a la que corresponde"
                value={formData.numeroFactura}
                onChange={(e) => setFormData({ ...formData, numeroFactura: e.target.value })}
              />
            </div>
          </div>

          {/* Líneas de pago: normalmente una sola, pero un mismo cliente puede
              pagar el mismo saldo en varias partes (dos transferencias con
              referencias distintas, o una transferencia + un efectivo). */}
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="mb-0">
                Líneas de pago
                {montoTotalLineas > 0 && (
                  <span className="text-gray-400 font-normal ml-2">Total: {formatCOP(montoTotalLineas)}</span>
                )}
              </Label>
              <Button variant="outline" size="sm" onClick={agregarLineaPago} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Agregar otro medio
              </Button>
            </div>
            {lineasPago.map((linea, idx) => (
              <div key={linea.id} className="border rounded-lg p-3 bg-gray-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600">Línea {idx + 1}</span>
                  {lineasPago.length > 1 && (
                    <Button variant="ghost" size="sm" className="h-6 text-red-500 hover:text-red-700 p-0"
                      onClick={() => eliminarLineaPago(linea.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">Medio de pago</Label>
                    <Select value={linea.medioPago} onValueChange={(v) => actualizarLineaPago(linea.id, "medioPago", v)}>
                      <SelectTrigger className="h-8 text-sm mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MEDIOS_PAGO.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">
                      Referencia {linea.medioPago !== "Efectivo" && <span className="text-red-500">*</span>}
                      {linea.medioPago === "Efectivo" && <span className="text-gray-400"> (opcional)</span>}
                    </Label>
                    <Input
                      className="h-8 text-sm mt-1"
                      placeholder="Número de comprobante"
                      value={linea.referencia}
                      onChange={(e) => actualizarLineaPago(linea.id, "referencia", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Monto</Label>
                    <Input
                      className="h-8 text-sm mt-1"
                      type="number"
                      placeholder="0"
                      value={linea.monto}
                      onChange={(e) => actualizarLineaPago(linea.id, "monto", e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400">
              Usa "Agregar otro medio" cuando el cliente pagó el mismo saldo en varias partes — por ejemplo dos
              transferencias distintas, o una transferencia y el resto en efectivo.
            </p>
          </div>

          {/* Destino del pago: fiado o pedido de asesor (opcional) */}
          <div className="mt-4">
            <Label className="mb-2 block">¿A qué corresponde este pago? (opcional)</Label>

            {destinoSeleccionado ? (
              <div className="flex items-center justify-between p-3 bg-white border rounded-lg">
                <div>
                  <span className="font-medium">{destinoSeleccionado.cliente}</span>
                  <BadgeTipoDestino tipo={destinoSeleccionado.tipo} />
                  <div className="text-xs text-gray-500 mt-0.5">
                    Entregador: {destinoSeleccionado.entregador_vinculado}
                    {destinoSeleccionado.tipo === "fiado" && destinoSeleccionado.ruta && ` — Ruta ${destinoSeleccionado.ruta}`}
                    {" — "}Monto: {formatCOP(Number(destinoSeleccionado.monto_referencia))}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={limpiarDestino}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Tabs value={tabDestino} onValueChange={(v) => setTabDestino(v as "fiado" | "pedido_asesor")}>
                <TabsList>
                  <TabsTrigger value="fiado">¿Es abono de un fiado?</TabsTrigger>
                  <TabsTrigger value="pedido_asesor">¿Es pago de pedido de asesor?</TabsTrigger>
                </TabsList>

                <TabsContent value="fiado" className="p-3 bg-gray-50 border rounded-lg mt-2 space-y-2">
                  <Input
                    placeholder="Buscar cliente en fiados..."
                    value={busquedaFiado}
                    onChange={(e) => setBusquedaFiado(e.target.value)}
                  />
                  {buscandoFiado ? (
                    <p className="text-xs text-gray-500">Buscando...</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {resultadosFiado.map((c) => (
                        <div key={`fiado-${c.id}`} className="flex items-center justify-between p-2 bg-white rounded border text-sm">
                          <div>
                            <span className="font-medium">{c.cliente}</span>
                            <div className="text-xs text-gray-500">
                              Entregador: {c.entregador_vinculado}{c.ruta && ` — Ruta ${c.ruta}`} — Saldo: {formatCOP(Number(c.monto_referencia))}
                            </div>
                          </div>
                          <Button size="sm" onClick={() => setDestinoSeleccionado(c)}>Elegir</Button>
                        </div>
                      ))}
                      {busquedaFiado.trim() && resultadosFiado.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">Sin coincidencias en fiados</p>
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="pedido_asesor" className="p-3 bg-gray-50 border rounded-lg mt-2 space-y-2">
                  <Input
                    placeholder="Buscar cliente en pedidos de asesor..."
                    value={busquedaAsesor}
                    onChange={(e) => setBusquedaAsesor(e.target.value)}
                  />
                  {buscandoAsesor ? (
                    <p className="text-xs text-gray-500">Buscando...</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {resultadosAsesor.map((c) => (
                        <div key={`asesor-${c.id}`} className="flex items-center justify-between p-2 bg-white rounded border text-sm">
                          <div>
                            <span className="font-medium">{c.cliente}</span>
                            <div className="text-xs text-gray-500">
                              Asesor: {c.entregador_vinculado} — Total: {formatCOP(Number(c.monto_referencia))}
                            </div>
                          </div>
                          <Button size="sm" onClick={() => setDestinoSeleccionado(c)}>Elegir</Button>
                        </div>
                      ))}
                      {busquedaAsesor.trim() && resultadosAsesor.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-2">Sin coincidencias en pedidos de asesor</p>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>

          <div className="mt-3">
            <Label>Observaciones (opcional)</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={formData.observaciones}
              onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
            />
          </div>
          <div className="mt-4">
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Registrando..." : "Registrar pago"}
            </Button>
          </div>

          {ultimoPagoRegistrado && coincidencias.length > 0 && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
              <p className="text-sm font-medium text-amber-800 mb-2">
                Se encontraron posibles coincidencias en fiados pendientes para este pago:
              </p>
              <div className="space-y-1">
                {coincidencias.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm bg-white rounded border p-2">
                    <span>
                      <strong>{c.cliente}</strong>
                      {c.ruta && <span className="text-gray-500"> — Ruta {c.ruta}</span>}
                      <span className="text-gray-500"> — Saldo: {formatCOP(Number(c.saldo_pendiente))}</span>
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => abrirIdentificar(ultimoPagoRegistrado)}
                    >
                      <Link2 className="h-3 w-3 mr-1" />
                      Identificar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Rendición de cuentas por asesor */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-600" />
              <h2 className="text-lg font-semibold">Pedidos de Asesores Pendientes por Cuadrar</h2>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                className="max-w-xs"
                placeholder="Buscar asesor..."
                value={filtroAsesorTexto}
                onChange={(e) => setFiltroAsesorTexto(e.target.value)}
              />
              <Button size="sm" variant="outline" onClick={() => setShowDialogPedidoAsesor(true)}>
                <Plus className="h-3 w-3 mr-1" />
                Pedido histórico
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowDialogFiado(true)}>
                <Plus className="h-3 w-3 mr-1" />
                Fiado histórico
              </Button>
            </div>
          </div>

          {loadingPedidosAsesor ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : resumenAsesores.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              {filtroAsesorTexto.trim() ? "Ningún asesor coincide con la búsqueda." : "No hay pedidos de asesor pendientes por cuadrar."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Asesor</TableHead>
                  <TableHead>Facturas/Pedidos</TableHead>
                  <TableHead>Total a responder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumenAsesores.map((r) => (
                  <Fragment key={r.asesor}>
                    <TableRow
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setAsesorExpandido(asesorExpandido === r.asesor ? null : r.asesor)}
                    >
                      <TableCell className="w-6">
                        {asesorExpandido === r.asesor ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </TableCell>
                      <TableCell className="font-medium">{r.asesor}</TableCell>
                      <TableCell>{r.numPedidos}</TableCell>
                      <TableCell className="font-semibold">{formatCOP(r.total)}</TableCell>
                    </TableRow>
                    {asesorExpandido === r.asesor && (
                      <TableRow>
                        <TableCell colSpan={4} className="bg-gray-50 p-0">
                          <div className="p-3 space-y-1">
                            {r.pedidos.map((p) => (
                              <div key={p.id} className="flex items-center justify-between text-sm bg-white rounded border p-2">
                                <span>
                                  <strong>{p.cliente}</strong>
                                  {p.ruta && <span className="text-gray-500"> — Ruta {p.ruta}</span>}
                                  <span className="text-gray-500"> — {new Date(p.fecha).toLocaleDateString("es-CO")}</span>
                                </span>
                                <span className="font-semibold">{formatCOP(Number(p.total))}</span>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {/* Lista de pagos */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Registros de cuadre administrativo</h2>
            <div className="flex gap-2">
              {(["pendiente", "identificado", "vinculado", "todos"] as const).map((estado) => (
                <Button
                  key={estado}
                  size="sm"
                  variant={filtroEstado === estado ? "default" : "outline"}
                  onClick={() => setFiltroEstado(estado)}
                >
                  {estado === "pendiente" ? "Pendientes"
                    : estado === "identificado" ? "Identificados"
                    : estado === "vinculado" ? "Vinculados"
                    : "Todos"}
                </Button>
              ))}
            </div>
          </div>

          {loadingPagos ? (
            <p className="text-sm text-gray-500">Cargando...</p>
          ) : pagos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No hay registros de cuadre administrativo{filtroEstado !== "todos" ? ` en estado "${filtroEstado}"` : ""}.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Antigüedad</TableHead>
                  <TableHead>Medio</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Entregador</TableHead>
                  <TableHead>Registrado por</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((pago) => (
                  <TableRow key={pago.id}>
                    <TableCell>
                      {pago.estado === "pendiente" ? (
                        <BadgeAntiguedad registradoEn={pago.registrado_en} />
                      ) : (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(pago.registrado_en).toLocaleDateString("es-CO")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{pago.medio_pago}</TableCell>
                    <TableCell className="font-mono text-xs">{pago.referencia}</TableCell>
                    <TableCell className="font-semibold">{formatCOP(Number(pago.monto))}</TableCell>
                    <TableCell>{pago.cliente || <span className="text-gray-400">—</span>}</TableCell>
                    <TableCell className="text-xs text-gray-500">{pago.entregador_vinculado || "—"}</TableCell>
                    <TableCell className="text-xs text-gray-500">{pago.registrado_por || "—"}</TableCell>
                    <TableCell><BadgeEstado estado={pago.estado} /></TableCell>
                    <TableCell>
                      {pago.estado !== "vinculado" && (
                        <Button size="sm" variant="outline" onClick={() => abrirIdentificar(pago)}>
                          <Link2 className="h-3 w-3 mr-1" />
                          {pago.estado === "identificado" ? "Reidentificar" : "Identificar"}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>

      {/* Modal de identificación de destino */}
      <Dialog open={!!pagoAIdentificar} onOpenChange={(open) => !open && cerrarIdentificar()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Identificar destino del pago</DialogTitle>
            <DialogDescription>
              {pagoAIdentificar && (
                <>
                  {pagoAIdentificar.medio_pago} · {formatCOP(Number(pagoAIdentificar.monto))} · Ref. {pagoAIdentificar.referencia}
                  <br />
                  No se registra ningún abono todavía — solo queda listo para que caja lo confirme dentro del cuadre del entregador correspondiente.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Buscar cliente en fiados o pedidos de asesor..."
              value={busquedaDestino}
              onChange={(e) => setBusquedaDestino(e.target.value)}
            />

            {loadingCandidatos ? (
              <p className="text-xs text-gray-500">Buscando...</p>
            ) : candidatosDestino.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No se encontraron coincidencias con ese criterio.</p>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {candidatosDestino.map((c) => (
                  <div key={`${c.tipo}-${c.id}`} className="flex items-center justify-between p-2 bg-gray-50 rounded border text-sm">
                    <div>
                      <span className="font-medium">{c.cliente}</span>
                      <BadgeTipoDestino tipo={c.tipo} />
                      <div className="text-gray-500 text-xs mt-0.5">
                        {c.tipo === "fiado" && c.ruta && `Ruta ${c.ruta} — `}
                        Entregador: {c.entregador_vinculado} — Monto: {formatCOP(Number(c.monto_referencia))}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={identificando}
                      onClick={() => handleIdentificar(c)}
                    >
                      Elegir
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cerrarIdentificar} disabled={identificando}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar pedido de asesor histórico (sin planilla) */}
      <Dialog open={showDialogPedidoAsesor} onOpenChange={setShowDialogPedidoAsesor}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar pedido histórico de asesor</DialogTitle>
            <DialogDescription>
              Para facturas que un asesor se llevó pero que nunca tuvieron planilla en el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ruta <span className="text-gray-400 text-xs">(opcional)</span></Label>
              <Input className="mt-1" value={formPedidoAsesor.ruta}
                onChange={(e) => setFormPedidoAsesor({ ...formPedidoAsesor, ruta: e.target.value })} />
            </div>
            <div>
              <Label>Asesor</Label>
              <Input className="mt-1" value={formPedidoAsesor.asesor}
                onChange={(e) => setFormPedidoAsesor({ ...formPedidoAsesor, asesor: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Cliente</Label>
              <Input className="mt-1" value={formPedidoAsesor.cliente}
                onChange={(e) => setFormPedidoAsesor({ ...formPedidoAsesor, cliente: e.target.value })} />
            </div>
            <div>
              <Label>Monto</Label>
              <Input className="mt-1" type="number" placeholder="0" value={formPedidoAsesor.monto}
                onChange={(e) => setFormPedidoAsesor({ ...formPedidoAsesor, monto: e.target.value })} />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input className="mt-1" type="date" value={formPedidoAsesor.fecha}
                onChange={(e) => setFormPedidoAsesor({ ...formPedidoAsesor, fecha: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Observaciones <span className="text-gray-400 text-xs">(opcional)</span></Label>
              <Textarea className="mt-1" rows={2} value={formPedidoAsesor.observaciones}
                onChange={(e) => setFormPedidoAsesor({ ...formPedidoAsesor, observaciones: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialogPedidoAsesor(false)} disabled={submittingPedidoAsesor}>
              Cancelar
            </Button>
            <Button onClick={handleCrearPedidoAsesor} disabled={submittingPedidoAsesor}>
              {submittingPedidoAsesor ? "Guardando..." : "Registrar pedido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Registrar fiado histórico */}
      <Dialog open={showDialogFiado} onOpenChange={setShowDialogFiado}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar fiado histórico</DialogTitle>
            <DialogDescription>
              Para fiados que un entregador dejó pendientes y nunca quedaron registrados en el sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Cliente</Label>
              <Input className="mt-1" value={formFiado.cliente}
                onChange={(e) => setFormFiado({ ...formFiado, cliente: e.target.value })} />
            </div>
            <div>
              <Label>Entregador</Label>
              <Input className="mt-1" value={formFiado.entregador}
                onChange={(e) => setFormFiado({ ...formFiado, entregador: e.target.value })} />
            </div>
            <div>
              <Label>Ruta <span className="text-gray-400 text-xs">(opcional)</span></Label>
              <Input className="mt-1" value={formFiado.ruta}
                onChange={(e) => setFormFiado({ ...formFiado, ruta: e.target.value })} />
            </div>
            <div>
              <Label>Monto</Label>
              <Input className="mt-1" type="number" placeholder="0" value={formFiado.monto}
                onChange={(e) => setFormFiado({ ...formFiado, monto: e.target.value })} />
            </div>
            <div>
              <Label>Fecha</Label>
              <Input className="mt-1" type="date" value={formFiado.fecha}
                onChange={(e) => setFormFiado({ ...formFiado, fecha: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Observaciones <span className="text-gray-400 text-xs">(opcional)</span></Label>
              <Textarea className="mt-1" rows={2} value={formFiado.observaciones}
                onChange={(e) => setFormFiado({ ...formFiado, observaciones: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialogFiado(false)} disabled={submittingFiado}>
              Cancelar
            </Button>
            <Button onClick={handleCrearFiado} disabled={submittingFiado}>
              {submittingFiado ? "Guardando..." : "Registrar fiado"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
