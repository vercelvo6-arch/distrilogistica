"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CreditCard, LogOut, Download, DollarSign, CheckCircle2, Plus, ArrowRight, Upload } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
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

interface Fiado {
  id: string
  cliente: string
  direccion: string
  telefono: string
  barrio: string
  total: number
  monto_pagado: number
  saldo_pendiente: number
  fecha: string
  entregador: string
  tipo_ruta: string
  planilla_id: string
  estado: string
  observaciones?: string
  abonos?: Abono[]
}

interface Abono {
  id: number
  monto_abono: number
  fecha_abono: string
  metodo_pago: string
  observaciones?: string
  registrado_por: string
}

interface ResumenFiados {
  entregador: string
  total_fiados: number
  monto_total: number
}

interface PlanillaDestino {
  id: string
  tipo_ruta: string
  fecha: string
  entregador: string
  estado: string
  total_cargue: number
}

interface FiadosViewProps {
  onLogout: () => void
  userRole: "administrador" | "coordinador" | "caja"
  userId?: string
}

export function FiadosView({ onLogout, userRole, userId }: FiadosViewProps) {
  const { toast } = useToast()
  const [fiados, setFiados] = useState<Fiado[]>([])
  const [resumen, setResumen] = useState<ResumenFiados[]>([])
  const [selectedFiados, setSelectedFiados] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [entregadores, setEntregadores] = useState<string[]>([])

  // Estados para modal de abono
  const [showAbonoModal, setShowAbonoModal] = useState(false)
  const [selectedFiado, setSelectedFiado] = useState<Fiado | null>(null)
  const [abonoForm, setAbonoForm] = useState({
    monto: "",
    metodoPago: "efectivo",
    observaciones: ""
  })
  const [submittingAbono, setSubmittingAbono] = useState(false)

  // Estados para asignar cobros
  const [showCobroModal, setShowCobroModal] = useState(false)
  const [selectedFiadoParaCobro, setSelectedFiadoParaCobro] = useState<Fiado | null>(null)
  const [planillasDisponibles, setPlanillasDisponibles] = useState<PlanillaDestino[]>([])
  const [planillaCobroId, setPlanillaCobroId] = useState<string>("")
  const [asignandoCobro, setAsignandoCobro] = useState(false)

  // Estados para importar
  const [importando, setImportando] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filtros
  const [entregadorFilter, setEntregadorFilter] = useState("all")
  const [fechaInicio, setFechaInicio] = useState(() => {
    const date = new Date()
    date.setDate(1)
    return date.toISOString().split("T")[0]
  })
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().split("T")[0])

  useEffect(() => {
    loadFiados()
    loadEntregadores()
  }, [fechaInicio, fechaFin, entregadorFilter])

  const loadEntregadores = async () => {
    try {
      const response = await fetch('/api/entregadores')
      if (!response.ok) throw new Error('Error al cargar entregadores')
      
      const data = await response.json()
      const nombres = data.entregadores.map((e: any) => e.nombre)
      setEntregadores(nombres)
    } catch (error) {
      console.error('Error cargando entregadores:', error)
    }
  }

  const loadFiados = async () => {
    try {
      setLoading(true)
      
      const params = new URLSearchParams({
        fechaInicio,
        fechaFin,
        ...(entregadorFilter !== 'all' && { entregador: entregadorFilter })
      })

      const response = await fetch(`/api/fiados?${params}`)
      if (!response.ok) throw new Error('Error al cargar fiados')

      const data = await response.json()
      setFiados(data.fiados || [])
      setResumen(data.resumen || [])
    } catch (error) {
      console.error('Error loading fiados:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los fiados",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleImportarClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  console.log('🔵 [FIADOS] handleFileChange EJECUTADO')
  console.log('🔵 [FIADOS] Evento:', e)
  console.log('🔵 [FIADOS] e.target:', e.target)
  console.log('🔵 [FIADOS] e.target.files:', e.target.files)
  
  const file = e.target.files?.[0]
  console.log('🔵 [FIADOS] Archivo extraído:', file)
  
  if (!file) {
    console.log('❌ [FIADOS] NO HAY ARCHIVO')
    return
  }

  console.log('✅ [FIADOS] Archivo detectado:', {
    nombre: file.name,
    tipo: file.type,
    tamaño: file.size
  })

  try {
    setImportando(true)
    console.log('📤 [FIADOS] Creando FormData...')
    
    const formData = new FormData()
    formData.append('file', file)
    console.log('📤 [FIADOS] FormData creado, enviando...')

    const response = await fetch('/api/fiados/importar', {
      method: 'POST',
      body: formData
    })

    console.log('📥 [FIADOS] Respuesta status:', response.status)
    const data = await response.json()
    console.log('📥 [FIADOS] Data recibida:', data)

    if (!response.ok) {
      throw new Error(data.error || 'Error al importar')
    }

    toast({
      title: "Importación Exitosa",
      description: data.mensaje,
    })

    await loadFiados()
    
  } catch (error) {
    console.error('❌ [FIADOS] ERROR:', error)
    toast({
      title: "Error",
      description: error instanceof Error ? error.message : "Error al importar fiados",
      variant: "destructive",
    })
  } finally {
    setImportando(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }
}
  const loadPlanillasDisponibles = async () => {
    try {
      const response = await fetch("/api/planillas")
      if (!response.ok) throw new Error("Error al cargar planillas")

      const data = await response.json()
      
      const planillas = (data.planillas || [])
        .sort((a: any, b: any) => {
          return new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        })
        .map((p: any) => ({
          id: p.id,
          tipo_ruta: p.tipo_ruta,
          fecha: p.fecha,
          entregador: p.entregador,
          estado: p.estado,
          total_cargue: Number(p.total_cargue) || 0,
        }))

      setPlanillasDisponibles(planillas)
    } catch (err) {
      console.error("Error loading planillas:", err)
    }
  }

  const openCobroModal = async (fiado: Fiado) => {
    setSelectedFiadoParaCobro(fiado)
    setPlanillaCobroId("")
    await loadPlanillasDisponibles()
    setShowCobroModal(true)
  }

  const handleAsignarCobro = async () => {
    if (!selectedFiadoParaCobro || !planillaCobroId) {
      toast({
        title: "Error",
        description: "Selecciona una planilla de destino",
        variant: "destructive",
      })
      return
    }

    try {
      setAsignandoCobro(true)

      console.log('🔍 DATOS A ENVIAR:', {
        pedidoFiadoId: selectedFiadoParaCobro.id,
        planillaDestinoId: planillaCobroId,
        selectedFiadoCompleto: selectedFiadoParaCobro
       })
      
      const response = await fetch("/api/fiados/asignar-cobro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoFiadoId: selectedFiadoParaCobro.id,
          planillaDestinoId: planillaCobroId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al asignar cobro")
      }

      toast({
        title: "✅ Cobro Asignado",
        description: `Cobro de ${formatCOP(data.cobro.monto)} asignado a ${data.planilla.entregador}`,
      })

      setShowCobroModal(false)
      setSelectedFiadoParaCobro(null)
      setPlanillaCobroId("")
      await loadFiados()
    } catch (error) {
      console.error("Error asignando cobro:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al asignar cobro",
        variant: "destructive",
      })
    } finally {
      setAsignandoCobro(false)
    }
  }

  const handleMarcarPagado = async () => {
    if (selectedFiados.size === 0) {
      toast({
        title: "Atención",
        description: "Selecciona al menos un fiado para marcar como pagado",
      })
      return
    }

    try {
      const response = await fetch('/api/fiados/marcar-pagado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pedidoIds: Array.from(selectedFiados),
          usuarioId: userId 
        })
      })

      if (!response.ok) throw new Error('Error al marcar como pagado')

      toast({
        title: "✅ Éxito",
        description: `${selectedFiados.size} fiado(s) marcado(s) como pagado(s)`,
      })
      
      setSelectedFiados(new Set())
      loadFiados()
    } catch (error) {
      console.error('Error marking paid:', error)
      toast({
        title: "Error",
        description: "No se pudieron marcar los fiados como pagados",
        variant: "destructive",
      })
    }
  }

  const openAbonoModal = (fiado: Fiado) => {
    setSelectedFiado(fiado)
    setAbonoForm({
      monto: "",
      metodoPago: "efectivo",
      observaciones: ""
    })
    setShowAbonoModal(true)
  }

  const handleRegistrarAbono = async () => {
    if (!selectedFiado) return

    const montoAbono = parseFloat(abonoForm.monto)
    
    if (!montoAbono || montoAbono <= 0) {
      toast({
        title: "Error",
        description: "Ingresa un monto válido para el abono",
        variant: "destructive",
      })
      return
    }

    if (montoAbono > selectedFiado.saldo_pendiente) {
      toast({
        title: "Error",
        description: `El abono no puede ser mayor al saldo pendiente (${formatCOP(selectedFiado.saldo_pendiente)})`,
        variant: "destructive",
      })
      return
    }

    try {
      setSubmittingAbono(true)

      const response = await fetch('/api/fiados/registrar-abono', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedidoId: selectedFiado.id,
          montoAbono,
          metodoPago: abonoForm.metodoPago,
          observaciones: abonoForm.observaciones || null,
          usuarioId: userId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al registrar abono')
      }

      toast({
        title: "✅ Abono Registrado",
        description: `Abono de ${formatCOP(montoAbono)} registrado. Saldo pendiente: ${formatCOP(data.saldo_pendiente)}`,
      })

      setShowAbonoModal(false)
      setSelectedFiado(null)
      await loadFiados()
    } catch (error) {
      console.error('Error registrando abono:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al registrar abono",
        variant: "destructive",
      })
    } finally {
      setSubmittingAbono(false)
    }
  }

  const exportarCSV = () => {
    const headers = ["Cliente", "Dirección", "Teléfono", "Barrio", "Total", "Pagado", "Saldo", "Fecha", "Entregador", "Ruta", "Estado"]
    
    const rows = fiados.map(f => [
      f.cliente,
      f.direccion || '',
      f.telefono || '',
      f.barrio || '',
      Number(f.total || 0).toFixed(2),
      Number(f.monto_pagado || 0).toFixed(2),
      Number(f.saldo_pendiente || 0).toFixed(2),
      f.fecha,
      f.entregador,
      f.tipo_ruta,
      f.estado
    ])

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `fiados_${fechaInicio}_${fechaFin}.csv`
    a.click()
    window.URL.revokeObjectURL(url)

    toast({
      title: "✅ Exportado",
      description: "Reporte de fiados descargado exitosamente",
    })
  }

  const totalGeneral = resumen.reduce((sum, r) => sum + r.monto_total, 0)
  const totalClientes = fiados.length

  return (
    <>
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
                <CreditCard className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold">Cuentas por Cobrar (Fiados)</h1>
                <p className="text-xs text-muted-foreground">Gestión de créditos y asignación de cobros</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 sm:py-8 max-w-7xl">
        <div className="space-y-4 sm:space-y-6">
          {/* Filtros */}
          <Card className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
              <div className="flex-1 w-full sm:w-auto">
                <label className="text-sm font-medium mb-2 block">Fecha Inicio</label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-1 w-full sm:w-auto">
                <label className="text-sm font-medium mb-2 block">Fecha Fin</label>
                <Input
                  type="date"
                  value={fechaFin}
                  onChange={(e) => setFechaFin(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex-1 w-full sm:w-auto">
                <label className="text-sm font-medium mb-2 block">Entregador</label>
                <Select value={entregadorFilter} onValueChange={setEntregadorFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {entregadores.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
                <Button 
                  onClick={handleImportarClick}
                  disabled={importando}
                  variant="outline"
                  className="flex-1 sm:flex-none border-green-300 text-green-700 hover:bg-green-50"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {importando ? "Importando..." : "Importar"}
                </Button>
                <Button onClick={exportarCSV} variant="outline" className="flex-1 sm:flex-none">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </div>
            </div>
          </Card>

          {/* Resumen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {resumen.map((r) => (
              <Card key={r.entregador} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-semibold text-sm">{r.entregador}</p>
                  <CreditCard className="h-4 w-4 text-orange-500" />
                </div>
                <p className="text-2xl font-bold text-orange-600">{formatCOP(r.monto_total)}</p>
                <p className="text-xs text-muted-foreground mt-1">{r.total_fiados} cliente(s) con saldo</p>
              </Card>
            ))}

            <Card className="p-4 bg-orange-50 border-orange-200">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-orange-700">Total General</p>
                <DollarSign className="h-4 w-4 text-orange-500" />
              </div>
              <p className="text-2xl font-bold text-orange-600">{formatCOP(totalGeneral)}</p>
              <p className="text-xs text-orange-600 mt-1">{totalClientes} cuenta(s) por cobrar</p>
            </Card>
          </div>

          {/* Tabla detallada */}
          <Card className="p-4 sm:p-6 overflow-x-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
              <h2 className="text-lg font-semibold">Detalle de Fiados</h2>
              {selectedFiados.size > 0 && (
                <Button onClick={handleMarcarPagado} size="sm" className="w-full sm:w-auto">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Marcar como Pagados ({selectedFiados.size})
                </Button>
              )}
            </div>

            <div className="min-w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Entregador</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pagado</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center py-8">
                        Cargando...
                      </TableCell>
                    </TableRow>
                  ) : fiados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        No hay fiados para el período seleccionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    fiados.map((fiado) => {
                      const saldo = Number(fiado.saldo_pendiente || fiado.total)
                      const isParcial = Number(fiado.monto_pagado) > 0 && saldo > 0
                      
                      return (
                        <TableRow key={fiado.id}>
                          <TableCell>
                            {(fiado.estado === "fiado" || fiado.estado === "parcial") && (
                              <Checkbox
                                checked={selectedFiados.has(fiado.id)}
                                onCheckedChange={(checked) => {
                                  const newSet = new Set(selectedFiados)
                                  if (checked) {
                                    newSet.add(fiado.id)
                                  } else {
                                    newSet.delete(fiado.id)
                                  }
                                  setSelectedFiados(newSet)
                                }}
                              />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{fiado.cliente}</TableCell>
                          <TableCell className="text-sm">{fiado.direccion || 'N/A'}</TableCell>
                          <TableCell className="text-sm">{fiado.telefono || 'N/A'}</TableCell>
                          <TableCell>{new Date(fiado.fecha).toLocaleDateString('es-CO')}</TableCell>
                          <TableCell>{fiado.entregador}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{fiado.tipo_ruta}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCOP(Number(fiado.total || 0))}
                          </TableCell>
                          <TableCell className="text-right text-green-600">
                            {formatCOP(Number(fiado.monto_pagado || 0))}
                          </TableCell>
                          <TableCell className="text-right font-bold text-orange-600">
                            {formatCOP(saldo)}
                          </TableCell>
                          <TableCell>
                            {isParcial ? (
                              <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                                parcial
                              </Badge>
                            ) : fiado.estado === "pagado" ? (
                              <Badge variant="default" className="bg-green-100 text-green-700">
                                pagado
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                                fiado
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex gap-2 justify-center">
                              {(fiado.estado === "fiado" || fiado.estado === "parcial") && saldo > 0 && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openAbonoModal(fiado)}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    Abono
                                  </Button>
                                  {userRole === "administrador" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => openCobroModal(fiado)}
                                      className="border-blue-300 text-blue-700 hover:bg-blue-50"
                                    >
                                      <ArrowRight className="h-3 w-3 mr-1" />
                                      Asignar a Cobrar
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </main>

      {/* MODAL PARA REGISTRAR ABONO */}
      <Dialog open={showAbonoModal} onOpenChange={setShowAbonoModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Registrar Abono</DialogTitle>
            <DialogDescription>
              Cliente: {selectedFiado?.cliente}
            </DialogDescription>
          </DialogHeader>

          {selectedFiado && (
            <div className="space-y-4 py-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total del pedido:</span>
                  <span className="font-semibold">{formatCOP(Number(selectedFiado.total))}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total pagado:</span>
                  <span className="text-green-600 font-semibold">
                    {formatCOP(Number(selectedFiado.monto_pagado || 0))}
                  </span>
                </div>
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="font-medium">Saldo pendiente:</span>
                  <span className="font-bold text-orange-600">
                    {formatCOP(Number(selectedFiado.saldo_pendiente || selectedFiado.total))}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="montoAbono">Monto del Abono *</Label>
                <Input
                  id="montoAbono"
                  type="number"
                  step="0.01"
                  min="0"
                  max={selectedFiado.saldo_pendiente}
                  value={abonoForm.monto}
                  onChange={(e) => setAbonoForm({ ...abonoForm, monto: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="metodoPago">Método de Pago</Label>
                <Select
                  value={abonoForm.metodoPago}
                  onValueChange={(value) => setAbonoForm({ ...abonoForm, metodoPago: value })}
                >
                  <SelectTrigger id="metodoPago">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="efectivo">Efectivo</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="consignacion">Consignación</SelectItem>
                    <SelectItem value="otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observaciones">Observaciones (opcional)</Label>
                <Textarea
                  id="observaciones"
                  value={abonoForm.observaciones}
                  onChange={(e) => setAbonoForm({ ...abonoForm, observaciones: e.target.value })}
                  placeholder="Notas adicionales sobre el abono..."
                  rows={3}
                />
              </div>

              {abonoForm.monto && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-green-900">Nuevo saldo:</span>
                    <span className="text-xl font-bold text-green-600">
                      {formatCOP(
                        Number(selectedFiado.saldo_pendiente) - parseFloat(abonoForm.monto || "0")
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAbonoModal(false)}
              disabled={submittingAbono}
            >
              Cancelar
            </Button>
            <Button onClick={handleRegistrarAbono} disabled={submittingAbono}>
              {submittingAbono ? "Registrando..." : "Registrar Abono"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL PARA ASIGNAR COBRO */}
      <Dialog open={showCobroModal} onOpenChange={setShowCobroModal}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Asignar Fiado a Cobrar</DialogTitle>
            <DialogDescription>
              Cliente: {selectedFiadoParaCobro?.cliente} - Saldo: {formatCOP(selectedFiadoParaCobro?.saldo_pendiente || 0)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-orange-50 border border-orange-200 p-4 rounded-lg">
              <p className="text-sm font-medium text-orange-900 mb-2">
                💰 Monto a Cobrar
              </p>
              <p className="text-3xl font-bold text-orange-600">
                {formatCOP(selectedFiadoParaCobro?.saldo_pendiente || 0)}
              </p>
            </div>

            <div>
              <Label htmlFor="planillaCobro">Asignar a Planilla / Entregador</Label>
              <Select 
                value={planillaCobroId} 
                onValueChange={(value) => {
                  console.log('✅ Planilla seleccionada:', value)
                  setPlanillaCobroId(value)
                }}
              >
                <SelectTrigger id="planillaCobro">
                  <SelectValue placeholder="Selecciona una planilla" />
                </SelectTrigger>
                <SelectContent>
                  {planillasDisponibles.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No hay planillas disponibles
                    </div>
                  ) : (
                    planillasDisponibles.map((planilla) => (
                      <SelectItem key={planilla.id} value={planilla.id}>
                        <div className="flex items-center justify-between w-full gap-4">
                          <span className="font-medium">
                            Ruta {planilla.tipo_ruta} - {planilla.entregador}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(planilla.fecha).toLocaleDateString("es-CO")}
                          </span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {planillaCobroId && (
              <Card className="p-4 bg-green-50 border-green-200">
                <p className="text-sm font-medium text-green-900 mb-2">
                  ✓ El cobro será agregado a esta planilla
                </p>
                <p className="text-xs text-green-700">
                  • El monto de {formatCOP(selectedFiadoParaCobro?.saldo_pendiente || 0)} se sumará al total_cargue
                </p>
                <p className="text-xs text-green-700">
                  • Aparecerá como "COBRO" en la planilla
                </p>
                <p className="text-xs text-green-700">
                  • Al cobrarse, se actualizará el fiado original
                </p>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCobroModal(false)
                setPlanillaCobroId("")
              }}
              disabled={asignandoCobro}
            >
              Cancelar
            </Button>
            <Button onClick={handleAsignarCobro} disabled={asignandoCobro || !planillaCobroId}>
              {asignandoCobro ? "Asignando..." : "Confirmar Asignación"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
