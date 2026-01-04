"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CreditCard, LogOut, Download, DollarSign, CheckCircle2 } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"

interface Fiado {
  id: string
  cliente: string
  direccion: string
  telefono: string
  barrio: string
  total: number
  fecha: string
  entregador: string
  tipo_ruta: string
  planilla_id: string
  estado: string
  observaciones?: string
}

interface ResumenFiados {
  entregador: string
  total_fiados: number
  monto_total: number
}

interface FiadosViewProps {
  onLogout: () => void
  userRole: "administrador" | "coordinador" | "caja"
}

export function FiadosView({ onLogout, userRole }: FiadosViewProps) {
  const { toast } = useToast()
  const [fiados, setFiados] = useState<Fiado[]>([])
  const [resumen, setResumen] = useState<ResumenFiados[]>([])
  const [selectedFiados, setSelectedFiados] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [entregadores, setEntregadores] = useState<string[]>([])

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
        body: JSON.stringify({ pedidoIds: Array.from(selectedFiados) })
      })

      if (!response.ok) throw new Error('Error al marcar como pagado')

      toast({
        title: "Éxito",
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

  const exportarCSV = () => {
    const headers = ["Cliente", "Dirección", "Teléfono", "Barrio", "Monto", "Fecha", "Entregador", "Ruta", "Estado"]
    
    const rows = fiados.map(f => [
      f.cliente,
      f.direccion || '',
      f.telefono || '',
      f.barrio || '',
      Number(f.total || 0).toFixed(2),
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
      title: "Exportado",
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
                <p className="text-xs text-muted-foreground">Gestión de créditos a clientes</p>
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
              <Button onClick={exportarCSV} variant="outline" className="w-full sm:w-auto">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
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
                    <TableHead>Barrio</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Entregador</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        Cargando...
                      </TableCell>
                    </TableRow>
                  ) : fiados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                        No hay fiados para el período seleccionado
                      </TableCell>
                    </TableRow>
                  ) : (
                    fiados.map((fiado) => (
                      <TableRow key={fiado.id}>
                        <TableCell>
                          {fiado.estado === "fiado" && (
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
                        <TableCell className="text-sm">{fiado.barrio || 'N/A'}</TableCell>
                        <TableCell className="text-sm">{fiado.telefono || 'N/A'}</TableCell>
                        <TableCell>{new Date(fiado.fecha).toLocaleDateString('es-CO')}</TableCell>
                        <TableCell>{fiado.entregador}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{fiado.tipo_ruta}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold text-orange-600">
                          {formatCOP(Number(fiado.total || 0))}
                        </TableCell>
                        <TableCell>
                          <Badge variant={fiado.estado === "pagado" ? "default" : "secondary"}>
                            {fiado.estado}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      </main>
    </>
  )
}
