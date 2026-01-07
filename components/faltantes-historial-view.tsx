"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Filter, AlertTriangle, CheckCircle, Package, Calendar } from "lucide-react"
import type { Faltante } from "@/lib/types"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function FaltantesHistorialView() {
  const [faltantes, setFaltantes] = useState<Faltante[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  
  // Filtros
  const [filterEntregador, setFilterEntregador] = useState<string>("all")
  const [filterEstado, setFilterEstado] = useState<string>("all")
  const [filterFechaInicio, setFilterFechaInicio] = useState<string>("")
  const [filterFechaFin, setFilterFechaFin] = useState<string>("")
  const [filterCodigo, setFilterCodigo] = useState<string>("")

  useEffect(() => {
    loadFaltantes()
  }, [filterEntregador, filterEstado, filterFechaInicio, filterFechaFin, filterCodigo])

  async function loadFaltantes() {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      
      if (filterEntregador !== "all") params.append("entregador", filterEntregador)
      if (filterEstado !== "all") params.append("estado", filterEstado)
      if (filterFechaInicio) params.append("fecha_inicio", filterFechaInicio)
      if (filterFechaFin) params.append("fecha_fin", filterFechaFin)
      if (filterCodigo) params.append("codigo", filterCodigo)

      const response = await fetch(`/api/faltantes?${params.toString()}`)
      
      if (!response.ok) throw new Error('Error al cargar faltantes')
      
      const data = await response.json()
      setFaltantes(data.faltantes || [])
    } catch (err) {
      console.error('[FALTANTES] Error:', err)
    } finally {
      setLoading(false)
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
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Error al exportar')
      }
      
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
      alert(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  const entregadores = Array.from(new Set(faltantes.map(f => f.entregador).filter(Boolean))) as string[]
  
  const stats = {
    total: faltantes.length,
    pendientes: faltantes.filter(f => f.estado === 'pendiente').length,
    resueltos: faltantes.filter(f => f.estado === 'resuelto').length,
    totalUnidades: faltantes.reduce((sum, f) => sum + f.cantidad_faltante, 0)
  }

  const formatFecha = (fecha: string) => {
    return new Date(fecha).toLocaleString('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6">
      {/* Header con estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Registros</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <Package className="h-8 w-8 text-blue-500" />
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Pendientes</p>
              <p className="text-2xl font-bold text-orange-600">{stats.pendientes}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-orange-500" />
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Resueltos</p>
              <p className="text-2xl font-bold text-green-600">{stats.resueltos}</p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-500" />
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Unidades Faltantes</p>
              <p className="text-2xl font-bold">{stats.totalUnidades}</p>
            </div>
            <Package className="h-8 w-8 text-red-500" />
          </div>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Filtros</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Select value={filterEntregador} onValueChange={setFilterEntregador}>
            <SelectTrigger>
              <SelectValue placeholder="Entregador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {entregadores.filter(e => e).map(e => (
  <SelectItem key={e} value={e}>{e}</SelectItem>
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
            placeholder="Desde"
            value={filterFechaInicio}
            onChange={(e) => setFilterFechaInicio(e.target.value)}
          />

          <Input
            type="date"
            placeholder="Hasta"
            value={filterFechaFin}
            onChange={(e) => setFilterFechaFin(e.target.value)}
          />

          <Input
            placeholder="Buscar código..."
            value={filterCodigo}
            onChange={(e) => setFilterCodigo(e.target.value)}
          />

          <Button 
            onClick={handleExport} 
            disabled={exporting || faltantes.length === 0}
            className="w-full"
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Exportando...' : 'Excel'}
          </Button>
        </div>
      </Card>

      {/* Tabla de faltantes */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : faltantes.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No hay faltantes registrados</h3>
          <p className="text-muted-foreground">
            Los faltantes que marques durante el alistamiento aparecerán aquí
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
                  <th className="text-left py-3 px-4 font-semibold">Código</th>
                  <th className="text-left py-3 px-4 font-semibold">Producto</th>
                  <th className="text-right py-3 px-4 font-semibold">Solicitado</th>
                  <th className="text-right py-3 px-4 font-semibold">Disponible</th>
                  <th className="text-right py-3 px-4 font-semibold">Faltante</th>
                  <th className="text-center py-3 px-4 font-semibold">Estado</th>
                  <th className="text-left py-3 px-4 font-semibold">Observaciones</th>
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
                    <td className="py-3 px-4 text-xs">
                      {formatFecha(f.fecha_marcado)}
                    </td>
                    <td className="py-3 px-4">{f.entregador}</td>
                    <td className="py-3 px-4 font-mono text-xs">{f.codigo}</td>
                    <td className="py-3 px-4">
                      {f.descripcion}
                      {f.unidad_incompleta && (
                        <span className="ml-2 text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded">
                          Incompleta
                        </span>
                      )}
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
                    <td className="py-3 px-4 text-xs max-w-md">
                      <div className="space-y-1">
                        {f.observaciones && (
                          <p className="text-muted-foreground">
                            📝 {f.observaciones}
                          </p>
                        )}
                        {f.estado === 'resuelto' && f.observaciones_resolucion && (
                          <p className="text-green-700">
                            ✅ {f.observaciones_resolucion}
                            <span className="block text-xs mt-1">
                              Por: {f.resuelto_por_nombre} - {formatFecha(f.fecha_resolucion!)}
                            </span>
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
