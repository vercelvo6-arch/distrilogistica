"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { User, Upload, FileSpreadsheet, LogOut, Truck, Trash2, Clock, Calendar, Filter } from "lucide-react"
import { parseNurturingCSV, parsePlanillaCSV, generateOrdersFromSales, generateRouteSheets } from "@/lib/csv-parser"
import type { RouteSheet, User as UserType } from "@/lib/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface CoordinadorViewProps {
  onLogout: () => void
  user: UserType
}

export function CoordinadorView({ onLogout, user }: CoordinadorViewProps) {
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [nurturingFile, setNurturingFile] = useState<File | null>(null)
  const [planillaFile, setPlanillaFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [entregadores, setEntregadores] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState("generar")
  
  // Filtros para historial
  const [filterDate, setFilterDate] = useState("")
  const [filterEntregador, setFilterEntregador] = useState<string>("todos")
  const [filterEstado, setFilterEstado] = useState<string>("todos")
  const [hasActiveFilter, setHasActiveFilter] = useState(false)

  useEffect(() => {
    loadPlanillas()
    loadEntregadores()
  }, [])

  async function loadEntregadores() {
    try {
      const response = await fetch('/api/entregadores')
      if (!response.ok) throw new Error('Error al cargar entregadores')
      
      const data = await response.json()
      const nombresEntregadores = data.entregadores.map((e: any) => e.nombre)
      
      setEntregadores(nombresEntregadores)
      console.log('📦 [COORD] Entregadores cargados:', nombresEntregadores)
    } catch (err) {
      console.error('❌ [COORD] Error cargando entregadores:', err)
      setError('No se pudieron cargar los entregadores')
    }
  }

  async function loadPlanillas() {
    console.log("[COORD-LOAD] Iniciando carga de planillas...")
    try {
      const response = await fetch('/api/planillas', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error("[COORD-LOAD] Error response:", errorData)
        throw new Error('Error al cargar planillas')
      }
      
      const data = await response.json()
      
      const planillas: RouteSheet[] = (data.planillas || []).map((p: any) => ({
        id: p.id,
        ruta: p.tipo_ruta,
        fecha: p.fecha,
        entregador: p.entregador,
        estado: p.estado,
        totalOrders: p.pedidos?.length || 0,
        totalAmount: Number(p.total_cargue) || 0,
        montoCargue: Number(p.total_cargue) || 0,
        montoEntregado: Number(p.total_entregado) || 0,
        montoFiado: Number(p.total_fiado) || 0,
        montoDevoluciones: Number(p.total_devolucion) || 0,
        montoRepasos: Number(p.total_repaso) || 0,
        orders: (p.pedidos || []).map((ped: any) => ({
          id: ped.id,
          cliente: ped.cliente,
          ruta: p.tipo_ruta,
          fecha: p.fecha,
          estado: ped.estado,
          total: Number(ped.total) || 0,
          montoPagado: 0,
          saldoPendiente: Number(ped.total) || 0,
          comentarios: ped.observaciones,
          items: (ped.productos || []).map((prod: any) => ({
            codigo: prod.codigo,
            descripcion: prod.nombre,
            categoria: prod.categoria || '',
            cantidad: Number(prod.cantidad) || 0,
            valorUnidad: Number(prod.precio_unitario) || 0,
            subtotal: Number(prod.total) || 0,
          })),
        })),
        cuentasPorCobrar: [],
      }))
      
      console.log("[COORD-LOAD] ✓ Total planillas transformadas:", planillas.length)
      setRouteSheets(planillas)
    } catch (err) {
      console.error("[COORD-LOAD] ❌ Error loading planillas:", err)
      setError("Error al cargar planillas: " + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleNurturingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setNurturingFile(e.target.files[0])
      setError(null)
    }
  }

  const handlePlanillaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setPlanillaFile(e.target.files[0])
      setError(null)
    }
  }

  const handleGeneratePlanillas = async () => {
    if (!nurturingFile || !planillaFile) {
      setError("Por favor cargue ambos archivos")
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      console.log("[COORD] 📄 Leyendo archivos...")
      const nurturingText = await nurturingFile.text()
      const planillaText = await planillaFile.text()

      console.log("[COORD] 🔍 Parseando CSV...")
      const sales = parseNurturingCSV(nurturingText)
      const products = parsePlanillaCSV(planillaText)

      if (sales.length === 0) {
        setError("No se encontraron ventas en el archivo NURTURING")
        setIsProcessing(false)
        return
      }

      if (products.length === 0) {
        setError("No se encontró inventario en el archivo PLANILLA")
        setIsProcessing(false)
        return
      }

      console.log("[COORD] 📦 Generando órdenes...")
      const fecha = new Date().toISOString().split("T")[0]
      console.log("[COORD] Fecha de hoy:", fecha)
      const orders = generateOrdersFromSales(sales, products, fecha)
      
      console.log("[COORD] 📋 Generando planillas...")
      const sheets = generateRouteSheets(orders)

      console.log("[COORD] 🚀 Enviando al servidor...")
      console.log("[COORD] Planillas a enviar:", sheets.length)
      console.log("[COORD] Primera planilla:", sheets[0])
      console.log("[COORD] Tamaño del JSON:", JSON.stringify({ routeSheets: sheets }).length, "caracteres")

      const response = await fetch('/api/planillas', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ routeSheets: sheets })
      })

      console.log("[COORD] 📡 Respuesta del servidor - Status:", response.status)
      console.log("[COORD] 📡 Respuesta del servidor - OK:", response.ok)

      const result = await response.json()
      console.log("[COORD] 📡 Resultado completo:", result)

      if (!response.ok) {
        console.error("[COORD] ❌ Error del servidor:", result)
        throw new Error(result.error || `Error del servidor: ${response.status}`)
      }

      console.log("[COORD] ✅ Planillas creadas exitosamente")
      console.log("[COORD] 📊 Total insertadas:", result.count)
      
      if (result.errors && result.errors.length > 0) {
        console.warn("[COORD] ⚠️ Errores durante inserción:", result.errors)
      }

      console.log("[COORD] ⏳ Esperando 2 segundos antes de recargar...")
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      console.log("[COORD] 🔄 Recargando planillas...")
      await loadPlanillas()
      
      console.log("[COORD] ✅ Cambiando a pestaña Asignar")
      setActiveTab("asignar")
      
      setIsProcessing(false)
      
    } catch (err) {
      console.error("[COORD] ❌ ERROR COMPLETO:", err)
      console.error("[COORD] ❌ Tipo de error:", err instanceof Error ? err.constructor.name : typeof err)
      console.error("[COORD] ❌ Mensaje:", err instanceof Error ? err.message : String(err))
      console.error("[COORD] ❌ Stack trace:", err instanceof Error ? err.stack : 'No disponible')
      setError("Error al procesar los archivos: " + (err as Error).message)
      setIsProcessing(false)
    }
  }

  const handleAssignEntregador = async (sheetId: string, entregador: string) => {
    try {
      const response = await fetch('/api/assign-entregador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planillaId: sheetId, entregador })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al asignar entregador')
      }

      await loadPlanillas()
    } catch (err) {
      console.error("[COORD] Error asignando entregador:", err)
      setError("Error al asignar entregador: " + (err as Error).message)
    }
  }

  const handleDeletePlanilla = async (sheetId: string) => {
    if (!confirm('¿Está seguro de eliminar esta planilla? Esta acción no se puede deshacer.')) {
      return
    }

    try {
      const response = await fetch(`/api/planillas/${sheetId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Error al eliminar planilla')
      }

      await loadPlanillas()
    } catch (err) {
      console.error("[COORD] Error eliminando planilla:", err)
      setError("Error al eliminar planilla: " + (err as Error).message)
    }
  }

  const handlePostponePlanilla = async (sheetId: string) => {
    try {
      const response = await fetch('/api/planillas/postpone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planillaId: sheetId })
      })

      if (!response.ok) {
        throw new Error('Error al posponer planilla')
      }

      await loadPlanillas()
    } catch (err) {
      console.error("[COORD] Error posponiendo planilla:", err)
      setError("Error al posponer planilla: " + (err as Error).message)
    }
  }

  // Filtrar planillas para cada pestaña
  const unassignedSheets = routeSheets.filter(s => !s.entregador && s.estado === 'pendiente')
  const assignedSheets = routeSheets.filter(s => s.entregador || s.estado !== 'pendiente')
  
  // Aplicar filtros al historial
  let filteredHistorial: RouteSheet[] = []
  
  if (hasActiveFilter) {
    filteredHistorial = assignedSheets.filter(s => {
      // Extraer solo la fecha YYYY-MM-DD de la BD (sin el timestamp)
      const sheetDateOnly = s.fecha.split('T')[0]
      
      // Si filterDate es una fecha en formato YYYY-MM-DD
      if (filterDate && filterDate.length === 10 && filterDate.includes('-')) {
        return sheetDateOnly === filterDate && 
          (filterEntregador === "todos" || s.entregador === filterEntregador) &&
          (filterEstado === "todos" || s.estado === filterEstado)
      }
      
      // Filtro "Últimos 7 días"
      if (filterDate === "last7days") {
        const sheetDate = new Date(s.fecha)
        const today = new Date()
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(today.getDate() - 7)
        
        return sheetDate >= sevenDaysAgo && sheetDate <= today &&
          (filterEntregador === "todos" || s.entregador === filterEntregador) &&
          (filterEstado === "todos" || s.estado === filterEstado)
      }
      
      // Filtro "Mes actual"
      if (filterDate === "currentMonth") {
        const sheetDate = new Date(s.fecha)
        const today = new Date()
        
        return sheetDate.getMonth() === today.getMonth() && 
          sheetDate.getFullYear() === today.getFullYear() &&
          (filterEntregador === "todos" || s.entregador === filterEntregador) &&
          (filterEstado === "todos" || s.estado === filterEstado)
      }
      
      // Si no hay filterDate pero hay otros filtros
      return (filterEntregador === "todos" || s.entregador === filterEntregador) &&
        (filterEstado === "todos" || s.estado === filterEstado)
    })
  }

  // Funciones de filtros rápidos
  const applyTodayFilter = () => {
    const today = new Date().toISOString().split('T')[0]
    setFilterDate(today)
    setFilterEntregador("todos")
    setFilterEstado("todos")
    setHasActiveFilter(true)
  }

  const applyLast7DaysFilter = () => {
    setFilterDate("last7days")
    setFilterEntregador("todos")
    setFilterEstado("todos")
    setHasActiveFilter(true)
  }

  const applyCurrentMonthFilter = () => {
    setFilterDate("currentMonth")
    setFilterEntregador("todos")
    setFilterEstado("todos")
    setHasActiveFilter(true)
  }

  const clearFilters = () => {
    setFilterDate("")
    setFilterEntregador("todos")
    setFilterEstado("todos")
    setHasActiveFilter(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-blue-500">
                <User className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold">Coordinador Logístico</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Generación y asignación de planillas diarias
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 md:px-4 py-4 md:py-8 max-w-5xl">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="generar">
              <Upload className="h-4 w-4 mr-2" />
              Generar Hoy
            </TabsTrigger>
            <TabsTrigger value="asignar">
              <Truck className="h-4 w-4 mr-2" />
              Asignar ({unassignedSheets.length})
            </TabsTrigger>
            <TabsTrigger value="historial">
              <Calendar className="h-4 w-4 mr-2" />
              Historial
            </TabsTrigger>
          </TabsList>

          {/* PESTAÑA 1: GENERAR HOY */}
          <TabsContent value="generar" className="space-y-4">
            <Card className="p-4 md:p-6">
              <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
                <Upload className="h-4 w-4 md:h-5 md:w-5" />
                Carga de Archivos Diarios
              </h2>

              <div className="space-y-3 md:space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">NURTURING - Ventas del Día Anterior (CSV)</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleNurturingUpload}
                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  {nurturingFile && <p className="text-sm text-muted-foreground mt-1">✓ {nurturingFile.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    INVENTARIO GENERAL - Catálogo de Productos (CSV)
                  </label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handlePlanillaUpload}
                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  {planillaFile && <p className="text-sm text-muted-foreground mt-1">✓ {planillaFile.name}</p>}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleGeneratePlanillas}
                  disabled={!nurturingFile || !planillaFile || isProcessing}
                  className="w-full"
                  size="lg"
                >
                  <FileSpreadsheet className="h-4 w-4 md:h-5 md:w-5 mr-2" />
                  {isProcessing ? "Procesando..." : "Generar Planillas por Ruta"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          {/* PESTAÑA 2: ASIGNAR */}
          <TabsContent value="asignar" className="space-y-4">
            {unassignedSheets.length === 0 ? (
              <Card className="p-8 text-center">
                <Truck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay planillas pendientes</h3>
                <p className="text-sm text-muted-foreground">
                  Todas las planillas han sido asignadas
                </p>
              </Card>
            ) : (
              <Card className="p-4 md:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                    <Truck className="h-4 w-4 md:h-5 md:w-5" />
                    Asignación de Entregadores ({unassignedSheets.length} rutas)
                  </h2>
                </div>

                <Alert className="mb-4 bg-amber-50 border-amber-200">
                  <AlertDescription className="text-sm text-amber-800">
                    Asigne un entregador a cada ruta antes de que el alistador pueda comenzar la preparación
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  {unassignedSheets.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="flex flex-col gap-3 p-3 md:p-4 border rounded-lg bg-muted/50"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-medium text-sm md:text-base">Ruta {sheet.ruta}</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {sheet.totalOrders} pedidos · {formatCOP(sheet.totalAmount)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select
                            value={sheet.entregador || ""}
                            onValueChange={(value) => handleAssignEntregador(sheet.id, value)}
                            disabled={entregadores.length === 0}
                          >
                            <SelectTrigger className="w-full sm:w-[180px]">
                              <SelectValue placeholder={entregadores.length === 0 ? "Sin entregadores" : "Seleccionar"} />
                            </SelectTrigger>
                            <SelectContent>
                              {entregadores.map((entregador) => (
                                <SelectItem key={entregador} value={entregador}>
                                  {entregador}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 justify-end border-t pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePostponePlanilla(sheet.id)}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        >
                          <Clock className="h-4 w-4 mr-1" />
                          Posponer
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeletePlanilla(sheet.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* PESTAÑA 3: HISTORIAL */}
          <TabsContent value="historial" className="space-y-4">
            <Card className="p-4 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  <h3 className="font-semibold">Filtros</h3>
                </div>
                {hasActiveFilter && (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Limpiar filtros
                  </Button>
                )}
              </div>

              {/* Filtros rápidos */}
              <div className="flex flex-wrap gap-2 mb-4">
                <Button
                  variant={filterDate === new Date().toISOString().split('T')[0] ? "default" : "outline"}
                  size="sm"
                  onClick={applyTodayFilter}
                >
                  Hoy
                </Button>
                <Button
                  variant={filterDate === "last7days" ? "default" : "outline"}
                  size="sm"
                  onClick={applyLast7DaysFilter}
                >
                  Últimos 7 días
                </Button>
                <Button
                  variant={filterDate === "currentMonth" ? "default" : "outline"}
                  size="sm"
                  onClick={applyCurrentMonthFilter}
                >
                  Mes actual
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Fecha</label>
                  <input
                    type="date"
                    value={filterDate.startsWith('20') ? filterDate : ''}
                    onChange={(e) => {
                      setFilterDate(e.target.value)
                      setHasActiveFilter(true)
                    }}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Entregador</label>
                  <Select 
                    value={filterEntregador} 
                    onValueChange={(val) => {
                      setFilterEntregador(val)
                      setHasActiveFilter(true)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {entregadores.map((e) => (
                        <SelectItem key={e} value={e}>{e}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Estado</label>
                  <Select 
                    value={filterEstado} 
                    onValueChange={(val) => {
                      setFilterEstado(val)
                      setHasActiveFilter(true)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="alistando">Alistando</SelectItem>
                      <SelectItem value="alistado">Alistado</SelectItem>
                      <SelectItem value="en_ruta">En Ruta</SelectItem>
                      <SelectItem value="completado">Completado</SelectItem>
                      <SelectItem value="pospuesto">Pospuesto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!hasActiveFilter ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">Seleccione un filtro para ver el historial</p>
                  <p className="text-sm mt-1">Use los botones rápidos o configure filtros personalizados arriba</p>
                </div>
              ) : filteredHistorial.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No se encontraron planillas con los filtros aplicados
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredHistorial.map((sheet) => (
                    <div
                      key={sheet.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 md:p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm md:text-base">Ruta {sheet.ruta}</p>
                        <p className="text-xs md:text-sm text-muted-foreground">
                          {sheet.fecha} · {sheet.entregador || 'Sin asignar'} · {sheet.totalOrders} pedidos · {formatCOP(sheet.totalAmount)}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-3 py-1 rounded-full whitespace-nowrap ${
                          sheet.estado === 'completado' ? 'bg-green-100 text-green-700' :
                          sheet.estado === 'alistado' ? 'bg-blue-100 text-blue-700' :
                          sheet.estado === 'alistando' ? 'bg-yellow-100 text-yellow-700' :
                          sheet.estado === 'pospuesto' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {sheet.estado}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            </TabsContent>
        </Tabs>
      </main>
    </>
  )
}
