"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Download, Filter, AlertTriangle, CheckCircle, Package, X } from "lucide-react"
import type { Faltante } from "@/lib/types"

interface FaltantesHistorialViewProps {
  userId?: string
  userRole?: string
}

export function FaltantesHistorialView({ userId, userRole }: FaltantesHistorialViewProps) {
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
      if (userId) params.append("userId", userId)
      if (userRole) params.append("userRole", userRole)

      const url = `/api/faltantes?${params.toString()}`
      console.log('🔍 Cargando faltantes desde:', url)

      const response = await fetch(url)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al cargar faltantes')
      }
      
      const data = await response.json()
      console.log('📦 Faltantes recibidos:', data)
      
      const faltantesArray = Array.isArray(data.faltantes) ? data.faltantes : []
      console.log('✅ Total faltantes:', faltantesArray.length)
      
      setFaltantes(faltantesArray)
    } catch (err) {
      console.error('❌ [FALTANTES] Error:', err)
      setFaltantes([])
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
      a.download = `faltantes_${new Date().toISOString().split('T')[0]}.csv`
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

  const clearFilters = () => {
    setFilterEntregador("all")
    setFilterEstado("all")
    setFilterFechaInicio("")
    setFilterFechaFin("")
    setFilterCodigo("")
  }

  const hasActiveFilters = filterEntregador !== "all" || 
                           filterEstado !== "all" || 
                           filterFechaInicio !== "" || 
                           filterFechaFin !== "" || 
                           filterCodigo !== ""

  const formatFecha = (fecha: string) => {
    try {
      return new Date(fecha).toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return fecha
    }
  }

  // Entregadores únicos
  const entregadores = Array.from(
    new Set(
      faltantes
        .map(f => f?.entregador)
        .filter((e): e is string => Boolean(e) && typeof e === 'string')
    )
  ).sort()

  // Estadísticas
  const stats = {
    total: faltantes.length,
    pendientes: faltantes.filter(f => f.estado === 'pendiente').length,
    resueltos: faltantes.filter(f => f.estado === 'resuelto').length,
    totalUnidades: faltantes.reduce((sum, f) => sum + (f.cantidad_faltante || 0), 0)
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
      {/* Tarjetas de estadísticas */}
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

      {/* Panel de filtros */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <h3 className="font-semibold">Filtros</h3>
            {hasActiveFilters && (
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">Activos</span>
            )}
          </div>
          {hasActiveFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Select value={filterEntregador} onValueChange={setFilterEntregador}>
            <SelectTrigger>
              <SelectValue placeholder="Entregador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los entregadores</SelectItem>
              {entregadores.map(e => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="pendiente">⏳ Pendientes</SelectItem>
              <SelectItem value="resuelto">✅ Resueltos</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            placeholder="Fecha inicio"
            value={filterFechaInicio}
            onChange={(e) => setFilterFechaInicio(e.target.value)}
          />

          <Input
            type="date"
            placeholder="Fecha fin"
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
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
        </div>
      </Card>

      {/* Tabla de faltantes */}
      {faltantes.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">
            {hasActiveFilters ? 'No hay faltantes con estos filtros' : 'No hay faltantes registrados'}
          </h3>
          <p className="text-muted-foreground">
            {hasActiveFilters ? 'Intenta ajustar los filtros' : 'Los faltantes de inventario aparecerán aquí'}
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
                    className={`border-b hover:bg-muted/50 transition-colors ${
                      f.estado === 'pendiente' ? 'bg-orange-50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 text-xs whitespace-nowrap">
                      {formatFecha(f.fecha_marcado)}
                    </td>
                    <td className="py-3 px-4">{f.entregador || '-'}</td>
                    <td className="py-3 px-4 font-mono text-xs">{f.codigo || '-'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span>{f.descripcion || '-'}</span>
                        {f.unidad_incompleta && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">
                            Incompleta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-right py-3 px-4 font-bold">{f.cantidad_solicitada || 0}</td>
                    <td className="text-right py-3 px-4">{f.cantidad_disponible || 0}</td>
                    <td className="text-right py-3 px-4 font-bold text-red-600">
                      {f.cantidad_faltante || 0}
                    </td>
                    <td className="text-center py-3 px-4">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                        f.estado === 'pendiente' 
                          ? 'bg-orange-100 text-orange-700' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {f.estado === 'pendiente' ? '⏳ Pendiente' : '✅ Resuelto'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs max-w-md">
                      <div className="space-y-1">
                        {f.observaciones && (
                          <p className="text-muted-foreground">📝 {f.observaciones}</p>
                        )}
                        {f.estado === 'resuelto' && f.observaciones_resolucion && (
                          <div className="text-green-700">
                            <p>✅ {f.observaciones_resolucion}</p>
                            {f.resuelto_por_nombre && f.fecha_resolucion && (
                              <p className="text-xs mt-1 text-muted-foreground">
                                Resuelto por: {f.resuelto_por_nombre} el {formatFecha(f.fecha_resolucion)}
                              </p>
                            )}
                          </div>
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
