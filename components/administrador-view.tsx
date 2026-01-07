"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Download, AlertTriangle, CheckCircle, Package, TrendingUp, Clock } from "lucide-react"
import type { Faltante, FaltantesStats } from "@/lib/types"

interface FaltantesAdminViewProps {
  userId: string
}

export function FaltantesAdminView({ userId }: FaltantesAdminViewProps) {
  const [faltantes, setFaltantes] = useState<Faltante[]>([])
  const [stats, setStats] = useState<FaltantesStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [resolviendo, setResolviendo] = useState(false)
  
  // Filtros
  const [filterEntregador, setFilterEntregador] = useState<string>("all")
  const [filterEstado, setFilterEstado] = useState<string>("pendiente")
  const [filterFechaInicio, setFilterFechaInicio] = useState<string>("")
  const [filterFechaFin, setFilterFechaFin] = useState<string>("")

  // Dialog de resolución
  const [faltanteSeleccionado, setFaltanteSeleccionado] = useState<Faltante | null>(null)
  const [observacionesResolucion, setObservacionesResolucion] = useState("")

  useEffect(() => {
    loadData()
  }, [filterEntregador, filterEstado, filterFechaInicio, filterFechaFin])

  async function loadData() {
    try {
      setLoading(true)
      
      // Cargar faltantes
      const params = new URLSearchParams()
      if (filterEntregador !== "all") params.append("entregador", filterEntregador)
      if (filterEstado !== "all") params.append("estado", filterEstado)
      if (filterFechaInicio) params.append("fecha_inicio", filterFechaInicio)
      if (filterFechaFin) params.append("fecha_fin", filterFechaFin)

      const [faltantesRes, statsRes] = await Promise.all([
        fetch(`/api/faltantes?${params.toString()}`),
        fetch('/api/faltantes/stats')
      ])
      
      if (!faltantesRes.ok || !statsRes.ok) throw new Error('Error al cargar datos')
      
      const faltantesData = await faltantesRes.json()
      const statsData = await statsRes.json()
      
      setFaltantes(faltantesData.faltantes || [])
      setStats(statsData.stats || null)
    } catch (err) {
      console.error('[FALTANTES ADMIN] Error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleResolverFaltante() {
    if (!faltanteSeleccionado || !observacionesResolucion.trim()) {
      alert('Debe proporcionar observaciones de resolución')
      return
    }

    try {
      setResolviendo(true)
      
      const response = await fetch('/api/faltantes/resolver', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faltanteId: faltanteSeleccionado.id,
          observaciones_resolucion: observacionesResolucion.trim()
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al resolver')
      }

      setFaltanteSeleccionado(null)
      setObservacionesResolucion("")
      await loadData()
      
    } catch (err) {
      console.error('[RESOLVER] Error:', err)
      alert(err instanceof Error ? err.message : 'Error al resolver faltante')
    } finally {
      setResolviendo(false)
    }
  }

  async function handleExport() {
    try {
      setExporting(true)
      const params = new URLSearchParams()
      
      if (filterEntregador !== "all") params.append("entregador", filterEntregador)
      if (filterEstado !== "all") params.append("estado", filterEstado)
      if (filterFechaInicio) params.append("fecha_inicio", filterFechaInicio)
      if (filterFechaFin) params.append("fecha_fin", filterFechaFin)

      const response = await fetch(`/api/faltantes/export?${params.toString()}`)
      
      if (!response.ok) throw new Error('Error al exportar')
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `faltantes_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('[EXPORT] Error:', err)
      alert('Error al exportar datos')
    } finally {
      setExporting(false)
    }
  }

  const entregadores = Array.from(new Set(faltantes.map(f => f.entregador)))

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-CO', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Dashboard de estadísticas */}
      {stats && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 border-2 border-orange-200 bg-orange-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pendientes</p>
                  <p className="text-3xl font-bold text-orange-600">
                    {stats.totales.total_pendientes}
                  </p>
                </div>
                <AlertTriangle className="h-10 w-10 text-orange-500" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Resueltos</p>
                  <p className="text-3xl font-bold text-green-600">
                    {stats.totales.total_resueltos}
                  </p>
                </div>
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hoy</p>
                  <p className="text-3xl font-bold">{stats.totales.total_hoy}</p>
                </div>
                <Clock className="h-10 w-10 text-blue-500" />
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total General</p>
                  <p className="text-3xl font-bold">{stats.totales.total_general}</p>
                </div>
                <Package className="h-10 w-10 text-purple-500" />
              </div>
            </Card>
          </div>

          {/* Productos más faltantes */}
          {stats.productos_mas_faltantes.length > 0 && (
            <Card className="p-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-red-500" />
                Top 5 Productos con Más Faltantes
              </h3>
              <div className="space-y-2">
                {stats.productos_mas_faltantes.slice(0, 5).map((p, idx) => (
                  <div key={p.codigo} className="flex items-center justify-between p-2 bg-muted rounded">
                    <div className="flex-1">
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {p.codigo}
                      </span>
                      <span className="text-sm">{p.descripcion}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-red-600">{p.total_veces} veces</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        ({p.total_unidades} unid.)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Select value={filterEntregador} onValueChange={setFilterEntregador}>
            <SelectTrigger>
              <SelectValue placeholder="Entregador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {stats?.por_entregador.map(e => (
                <SelectItem key={e.entregador} value={e.entregador}>
                  {e.entregador} ({e.pendientes} pend.)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="resuelto">Resueltos</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={filterFechaInicio}
            onChange={(e) => setFilterFechaInicio(e.target.value)}
          />

          <Input
            type="date"
            value={filterFechaFin}
            onChange={(e) => setFilterFechaFin(e.target.value)}
          />

          <Button 
            onClick={handleExport} 
            disabled={exporting || faltantes.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Exportando...' : 'Excel'}
          </Button>
        </div>
      </Card>

      {/* Tabla de faltantes */}
      {faltantes.length === 0 ? (
        <Card className="p-12 text-center">
          <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
          <h3 className="text-lg font-semibold mb-2">¡Todo en orden!</h3>
          <p className="text-muted-foreground">
            No hay faltantes {filterEstado === 'pendiente' ? 'pendientes' : 'con los filtros seleccionados'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left py-3 px-4 font-semibold">Fecha</th>
                  <th className="text-left py-3 px-4 font-semibold">Entregador</th>
                  <th className="text-left py-3 px-4 font-semibold">Producto</th>
                  <th className="text-right py-3 px-4 font-semibold">Solicitado</th>
                  <th className="text-right py-3 px-4 font-semibold">Disponible</th>
                  <th className="text-right py-3 px-4 font-semibold">Faltante</th>
                  <th className="text-center py-3 px-4 font-semibold">Estado</th>
                  <th className="text-center py-3 px-4 font-semibold">Acción</th>
                </tr>
              </thead>
              <tbody>
                {faltantes.map((f) => (
                  <tr 
                    key={f.id}
                    className={`border-b hover:bg-muted/50 ${
                      f.estado === 'pendiente' ? 'bg-orange-50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      {formatFecha(f.fecha_marcado)}
                    </td>
                    <td className="py-3 px-4 font-medium">{f.entregador}</td>
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {f.codigo}
                        </span>
                        <p className="text-sm">{f.descripcion}</p>
                        {f.unidad_incompleta && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                            Incompleta
                          </span>
                        )}
                        {f.observaciones && (
                          <p className="text-xs text-muted-foreground mt-1">
                            📝 {f.observaciones}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 font-bold">
                      {f.cantidad_solicitada}
                    </td>
                    <td className="text-right py-3 px-4">
                      {f.cantidad_disponible}
                    </td>
                    <td className="text-right py-3 px-4 font-bold text-red-600">
                      {f.cantidad_faltante}
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        f.estado === 'pendiente'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {f.estado === 'pendiente' ? 'PENDIENTE' : 'RESUELTO'}
                      </span>
                    </td>
                    <td className="text-center py-3 px-4">
                      {f.estado === 'pendiente' ? (
                        <Button
                          size="sm"
                          onClick={() => setFaltanteSeleccionado(f)}
                          className="bg-green-600"
                        >
                          Resolver
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          ✓ Por {f.resuelto_por_nombre}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Dialog de resolución */}
      <Dialog open={!!faltanteSeleccionado} onOpenChange={() => setFaltanteSeleccionado(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resolver Faltante</DialogTitle>
          </DialogHeader>
          
          {faltanteSeleccionado && (
            <div className="space-y-4">
              <div className="p-4 bg-orange-50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Entregador:</span>
                  <span className="font-bold">{faltanteSeleccionado.entregador}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Producto:</span>
                  <span className="text-sm">{faltanteSeleccionado.descripcion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Código:</span>
                  <span className="font-mono text-xs">{faltanteSeleccionado.codigo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-medium">Faltante:</span>
                  <span className="font-bold text-red-600">
                    {faltanteSeleccionado.cantidad_faltante} unidades
                  </span>
                </div>
                {faltanteSeleccionado.observaciones && (
                  <div className="pt-2 border-t">
                    <span className="text-sm font-medium">Observación inicial:</span>
                    <p className="text-sm text-muted-foreground mt-1">
                      {faltanteSeleccionado.observaciones}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium block mb-2">
                  ¿Cómo se resolvió este faltante? *
                </label>
                <Textarea
                  value={observacionesResolucion}
                  onChange={(e) => setObservacionesResolucion(e.target.value)}
                  placeholder="Ej: Se completó el pedido con stock de otra bodega"
                  className="min-h-[100px]"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  * Campo obligatorio
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setFaltanteSeleccionado(null)
                setObservacionesResolucion("")
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleResolverFaltante}
              disabled={resolviendo || !observacionesResolucion.trim()}
              className="bg-green-600"
            >
              {resolviendo ? 'Resolviendo...' : 'Marcar como Resuelto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
