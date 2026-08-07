"use client"

import { useState, useEffect, useCallback } from "react"
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
import { LogOut, Wallet, Link2, Clock, X } from "lucide-react"
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
    medioPago: "Efectivo",
    referencia: "",
    monto: "",
    observaciones: "",
  })
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
        if (Number(formData.monto) > 0) params.set("monto", formData.monto)
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
  }, [busquedaFiado, formData.monto])

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
        if (Number(formData.monto) > 0) params.set("monto", formData.monto)
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
  }, [busquedaAsesor, formData.monto])

  const limpiarDestino = () => {
    setDestinoSeleccionado(null)
    setBusquedaFiado("")
    setBusquedaAsesor("")
    setResultadosFiado([])
    setResultadosAsesor([])
  }

  const handleSubmit = async () => {
    if (!formData.medioPago) {
      toast({ title: "Error", description: "Selecciona el medio de pago", variant: "destructive" })
      return
    }
    if (!formData.referencia.trim()) {
      toast({ title: "Error", description: "La referencia es requerida", variant: "destructive" })
      return
    }
    if (!formData.monto || Number(formData.monto) <= 0) {
      toast({ title: "Error", description: "El monto debe ser mayor a 0", variant: "destructive" })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/pagos-anticipados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medioPago: formData.medioPago,
          referencia: formData.referencia.trim(),
          monto: Number(formData.monto),
          cliente: destinoSeleccionado?.cliente || null,
          observaciones: formData.observaciones.trim() || null,
          destinoTipo: destinoSeleccionado?.tipo || null,
          destinoId: destinoSeleccionado?.id || null,
          entregadorVinculado: destinoSeleccionado?.entregador_vinculado || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Error al registrar el pago")

      toast({ title: "Pago registrado", description: `Voucher de ${formatCOP(Number(formData.monto))} registrado correctamente` })
      setUltimoPagoRegistrado(data.pago)
      setCoincidencias(data.coincidencias || [])
      setFormData({ medioPago: "Efectivo", referencia: "", monto: "", observaciones: "" })
      limpiarDestino()
      setTabDestino("fiado")
      loadPagos()
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Error al registrar el pago", variant: "destructive" })
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>Medio de pago</Label>
              <Select value={formData.medioPago} onValueChange={(v) => setFormData({ ...formData, medioPago: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEDIOS_PAGO.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Referencia</Label>
              <Input
                className="mt-1"
                placeholder="Número de comprobante"
                value={formData.referencia}
                onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
              />
            </div>
            <div>
              <Label>Monto</Label>
              <Input
                className="mt-1"
                type="number"
                placeholder="0"
                value={formData.monto}
                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
              />
            </div>
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
    </div>
  )
}
