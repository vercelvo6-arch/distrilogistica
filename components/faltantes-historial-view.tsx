"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Download, Filter, AlertTriangle, CheckCircle, Package, X, Trash2, Loader2 } from "lucide-react"
import type { Faltante } from "@/lib/types"

interface FaltantesHistorialViewProps {
  userId?: string
  userRole?: string
}

const ROLES_BAJA = ["alistador", "coordinador", "administrador"]

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

  // Entregadores conocidos: se acumulan para que el selector no se vacíe al filtrar por uno.
  const [todosEntregadores, setTodosEntregadores] = useState<string[]>([])

  // Selección para dar de baja en bloque
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [dialogBaja, setDialogBaja] = useState(false)
  const [motivoBaja, setMotivoBaja] = useState("No se pudo entregar")
  const [dandoDeBaja, setDandoDeBaja] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null)

  const puedeDarDeBaja = !!userRole && ROLES_BAJA.includes(userRole)

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

      const response = await fetch(`/api/faltantes?${params.toString()}`)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al cargar faltantes')
      }

      const data = await response.json()
      const faltantesArray: Faltante[] = Array.isArray(data.faltantes) ? data.faltantes : []

      setFaltantes(faltantesArray)
      setSeleccionados(new Set())
      setTodosEntregadores((prev) =>
        Array.from(new Set([...prev, ...faltantesArray.map((f) => f?.entregador).filter((e): e is string => Boolean(e))])).sort()
      )
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

  const soloPendientes = () => {
    setFilterEstado("pendiente")
    setFilterFechaInicio("")
    setFilterFechaFin("")
  }

  const hasActiveFilters = filterEntregador !== "all" ||
                           filterEstado !== "all" ||
                           filterFechaInicio !== "" ||
                           filterFechaFin !== "" ||
                           filterCodigo !== ""

  const formatFecha = (fecha: string) => {
    try {
      return new Date(fecha).toLocaleString('es-CO', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      })
    } catch {
      return fecha
    }
  }

  const stats = {
    total: faltantes.length,
    pendientes: faltantes.filter(f => f.estado === 'pendiente').length,
    resueltos: faltantes.filter(f => f.estado === 'resuelto').length,
    noEntregados: faltantes.filter(f => (f.estado as string) === 'definitivo').length,
    totalUnidades: faltantes.reduce((sum, f) => sum + (f.cantidad_faltante || 0), 0)
  }

  // Solo los pendientes se pueden dar de baja.
  const pendientesVisibles = useMemo(() => faltantes.filter((f) => f.estado === 'pendiente'), [faltantes])
  const todosMarcados = pendientesVisibles.length > 0 && pendientesVisibles.every((f) => seleccionados.has(f.id))
  const unidadesSeleccionadas = pendientesVisibles
    .filter((f) => seleccionados.has(f.id))
    .reduce((sum, f) => sum + (Number(f.cantidad_faltante) || 0), 0)

  const alternar = (id: string) => {
    setSeleccionados((prev) => {
      const nuevo = new Set(prev)
      if (nuevo.has(id)) nuevo.delete(id)
      else nuevo.add(id)
      return nuevo
    })
  }

  const alternarTodos = () => {
    setSeleccionados(todosMarcados ? new Set() : new Set(pendientesVisibles.map((f) => f.id)))
  }

  async function confirmarBaja() {
    setDandoDeBaja(true)
    try {
      const res = await fetch("/api/faltantes/baja-en-bloque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(seleccionados), motivo: motivoBaja }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "No se pudo dar de baja")
      setMensaje({ tipo: "ok", texto: data.mensaje || "Listo" })
      setDialogBaja(false)
      await loadFaltantes()
    } catch (err) {
      setMensaje({ tipo: "error", texto: err instanceof Error ? err.message : "Error al dar de baja" })
    } finally {
      setDandoDeBaja(false)
    }
  }

  if (loading && faltantes.length === 0) {
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
              <p className="text-sm text-muted-foreground">Resueltos / no entregados</p>
              <p className="text-2xl font-bold text-green-600">{stats.resueltos} <span className="text-base text-gray-400">/ {stats.noEntregados}</span></p>
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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            <h3 className="font-semibold">Filtros</h3>
            {hasActiveFilters && (
              <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">Activos</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={filterEstado === "pendiente" && !filterFechaInicio && !filterFechaFin ? "default" : "outline"}
              size="sm"
              onClick={soloPendientes}
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Revisar todos los pendientes
            </Button>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Select value={filterEntregador} onValueChange={setFilterEntregador}>
            <SelectTrigger>
              <SelectValue placeholder="Entregador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los entregadores</SelectItem>
              {todosEntregadores.map(e => (
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
              <SelectItem value="definitivo">🚫 No se entregaron</SelectItem>
            </SelectContent>
          </Select>

          <Input type="date" title="Marcados desde" value={filterFechaInicio} onChange={(e) => setFilterFechaInicio(e.target.value)} />
          <Input type="date" title="Marcados hasta" value={filterFechaFin} onChange={(e) => setFilterFechaFin(e.target.value)} />

          <Input placeholder="Buscar código..." value={filterCodigo} onChange={(e) => setFilterCodigo(e.target.value)} />

          <Button onClick={handleExport} disabled={exporting || faltantes.length === 0} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Sin fechas, la lista muestra los últimos 7 días; al pedir los pendientes se muestran todos, sin importar qué tan viejos sean.
        </p>
      </Card>

      {mensaje && (
        <div className={`rounded border px-3 py-2 text-sm flex items-center justify-between ${mensaje.tipo === "ok" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Barra de acción en bloque */}
      {puedeDarDeBaja && pendientesVisibles.length > 0 && (
        <Card className="p-3 flex flex-wrap items-center gap-3 bg-orange-50 border-orange-200">
          <span className="text-sm">
            <strong>{seleccionados.size}</strong> de {pendientesVisibles.length} pendientes seleccionados
            {seleccionados.size > 0 && <> · <strong>{unidadesSeleccionadas}</strong> unidades</>}
          </span>
          <Button variant="outline" size="sm" onClick={alternarTodos}>
            {todosMarcados ? "Quitar selección" : `Seleccionar los ${pendientesVisibles.length} que se ven`}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={seleccionados.size === 0}
            onClick={() => { setMotivoBaja("No se pudo entregar"); setDialogBaja(true) }}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Eliminar seleccionados
          </Button>
          <span className="text-xs text-muted-foreground">
            Usa los filtros (entregador, fechas, código) y luego selecciona lo que se ve.
          </span>
        </Card>
      )}

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
                  {puedeDarDeBaja && (
                    <th className="py-3 px-3 w-8">
                      <input
                        type="checkbox"
                        aria-label="Seleccionar todos los pendientes"
                        checked={todosMarcados}
                        disabled={pendientesVisibles.length === 0}
                        onChange={alternarTodos}
                      />
                    </th>
                  )}
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
                {faltantes.map((f) => {
                  const esPendiente = f.estado === 'pendiente'
                  const esDefinitivo = (f.estado as string) === 'definitivo'
                  return (
                    <tr
                      key={f.id}
                      className={`border-b hover:bg-muted/50 transition-colors ${esPendiente ? 'bg-orange-50' : ''} ${seleccionados.has(f.id) ? 'bg-red-50' : ''}`}
                    >
                      {puedeDarDeBaja && (
                        <td className="py-3 px-3">
                          {esPendiente && (
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar ${f.descripcion || f.codigo}`}
                              checked={seleccionados.has(f.id)}
                              onChange={() => alternar(f.id)}
                            />
                          )}
                        </td>
                      )}
                      <td className="py-3 px-4 text-xs whitespace-nowrap">{formatFecha(f.fecha_marcado)}</td>
                      <td className="py-3 px-4">{f.entregador || '-'}</td>
                      <td className="py-3 px-4 font-mono text-xs">{f.codigo || '-'}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span>{f.descripcion || '-'}</span>
                          {f.unidad_incompleta && (
                            <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">Incompleta</span>
                          )}
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 font-bold">{f.cantidad_solicitada || 0}</td>
                      <td className="text-right py-3 px-4">{f.cantidad_disponible || 0}</td>
                      <td className="text-right py-3 px-4 font-bold text-red-600">{f.cantidad_faltante || 0}</td>
                      <td className="text-center py-3 px-4">
                        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                          esPendiente ? 'bg-orange-100 text-orange-700'
                            : esDefinitivo ? 'bg-gray-100 text-gray-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {esPendiente ? '⏳ Pendiente' : esDefinitivo ? '🚫 No se entregó' : '✅ Resuelto'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs max-w-md">
                        <div className="space-y-1">
                          {f.observaciones && <p className="text-muted-foreground">📝 {f.observaciones}</p>}
                          {!esPendiente && f.observaciones_resolucion && (
                            <div className={esDefinitivo ? 'text-gray-700' : 'text-green-700'}>
                              <p>{esDefinitivo ? '🚫' : '✅'} {f.observaciones_resolucion}</p>
                              {f.resuelto_por_nombre && f.fecha_resolucion && (
                                <p className="text-xs mt-1 text-muted-foreground">
                                  Por: {f.resuelto_por_nombre} el {formatFecha(f.fecha_resolucion)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={dialogBaja} onOpenChange={(abierto) => { if (!dandoDeBaja) setDialogBaja(abierto) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar {seleccionados.size} faltantes pendientes</DialogTitle>
            <DialogDescription>
              Salen de la lista de pendientes ({unidadesSeleccionadas} unidades) y quedan marcados como
              “No se entregó”, con este motivo, tu nombre y la fecha. No se borra el historial y el coordinador
              puede revertir cualquiera desde Supervisión.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-sm font-medium block mb-1">Motivo</label>
            <Textarea value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogBaja(false)} disabled={dandoDeBaja}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarBaja} disabled={dandoDeBaja || !motivoBaja.trim()}>
              {dandoDeBaja ? <Loader2 className="h-4 w-4 animate-spin" /> : `Eliminar ${seleccionados.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
