"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  User,
  Upload,
  FileSpreadsheet,
  LogOut,
  Truck,
  Trash2,
  Clock,
  Calendar,
  Filter,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react"
import { parseNurturingCSV, parsePlanillaCSV, generateOrdersFromSales, generateRouteSheets } from "@/lib/csv-parser"
import type { RouteSheet, User as UserType } from "@/lib/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SubsanarFaltantesModal, type Faltante, type SubsanacionData } from "@/components/subsanar-faltantes-modal"
import { devolverAlistamiento } from "@/lib/actions/planillas"

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

  // Estados para supervisión
  const [supervisionSheets, setSupervisionSheets] = useState<RouteSheet[]>([])
  const [selectedEntregadorSupervision, setSelectedEntregadorSupervision] = useState<string>("todos")
  const [faltantes, setFaltantes] = useState<any[]>([])
  const [expandedEntregadores, setExpandedEntregadores] = useState<Set<string>>(new Set())
  const [faltanteParaSubsanar, setFaltanteParaSubsanar] = useState<Faltante | null>(null)

  // Filtros para historial
  const [filterDate, setFilterDate] = useState("")
  const [filterEntregador, setFilterEntregador] = useState<string>("todos")
  const [filterEstado, setFilterEstado] = useState<string>("todos")
  const [hasActiveFilter, setHasActiveFilter] = useState(false)
  const [assignmentModal, setAssignmentModal] = useState<{
    sheetId: string
    ruta: string
    entregadorSeleccionado: string
    fechaAlistamiento: string
  } | null>(null)

  useEffect(() => {
    loadPlanillas()
    loadEntregadores()
  }, [])

  useEffect(() => {
    if (activeTab === "supervision") {
      loadSupervisionData()
    }
  }, [activeTab])

  async function loadEntregadores() {
    try {
      const response = await fetch("/api/entregadores")
      if (!response.ok) throw new Error("Error al cargar entregadores")

      const data = await response.json()
      const nombresEntregadores = data.entregadores.map((e: any) => e.nombre)

      setEntregadores(nombresEntregadores)
      console.log("📦 [COORD] Entregadores cargados:", nombresEntregadores)
    } catch (err) {
      console.error("❌ [COORD] Error cargando entregadores:", err)
      setError("No se pudieron cargar los entregadores")
    }
  }

  async function loadPlanillas() {
    console.log("[COORD-LOAD] Iniciando carga de planillas...")
    try {
      const response = await fetch("/api/planillas", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("[COORD-LOAD] Error response:", errorData)
        throw new Error("Error al cargar planillas")
      }

      const data = await response.json()

      const planillas: RouteSheet[] = (data.planillas || []).map((p: any) => ({
        id: p.id,
        ruta: p.tipo_ruta,
        fecha: p.fecha,
        entregador: p.entregador,
        estado: p.estado,
        totalOrders: Array.isArray(p.pedidos) ? p.pedidos.length : 0,
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
            categoria: prod.categoria || "",
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

  const handleSubsanarFaltante = async (data: SubsanacionData) => {
  try {
    console.log('[SUBSANAR] 📦 Datos recibidos del modal:', data)

    // Construir payload limpio sin campos undefined
    const payload: any = {
      faltanteId: data.faltanteId,
      tipoResolucion: data.tipoResolucion || 'completo',
      observaciones_resolucion: data.observaciones_resolucion || data.observaciones || 'Subsanado desde coordinador'
    }

    // Determinar cantidadResuelta según el tipo de resolución
    if (data.tipoResolucion === 'completo') {
      // Para completo, usar la cantidad del faltante
      const faltantesDelProducto = faltantes.find(f => f.id === data.faltanteId)
      payload.cantidadResuelta = faltantesDelProducto?.cantidad_faltante || 0
    } else if (data.tipoResolucion === 'parcial') {
      // Para parcial, usar la cantidad especificada
      const cantidad = data.cantidadResuelta || data.cantidadSubsanada || 0
      payload.cantidadResuelta = Number(cantidad)
    } else if (data.tipoResolucion === 'definitivo') {
      // Para definitivo, cantidad es 0
      payload.cantidadResuelta = 0
    }

    console.log('[SUBSANAR] 📤 Payload enviado al servidor:', payload)

    const response = await fetch("/api/faltantes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || result.details || "Error al subsanar")
    }

    console.log('[SUBSANAR] ✅ Respuesta del servidor:', result)

    alert(result.mensaje || "Faltante subsanado correctamente")

    // Cerrar modal
    setFaltanteParaSubsanar(null)

    // Recargar datos para ver los cambios
    await loadSupervisionData()
    
  } catch (err) {
    console.error("[SUBSANAR] ❌ ERROR:", err)
    alert("Error al subsanar faltante: " + (err as Error).message)
  }
}

  async function loadSupervisionData() {
  try {
    console.log('[SUPERVISION] 🔄 Cargando datos...')

    // 1. Cargar planillas alistadas Y CUADRADAS
    const response = await fetch("/api/planillas")
    if (!response.ok) throw new Error("Error al cargar planillas")

    const data = await response.json()

    const planillasSupervision = (data.planillas || [])
      .filter((p: any) => 
        p.estado === "alistado" || 
        p.estado === "en_ruta" || 
        p.estado === "completado" ||
        p.cuadrado_en_caja === true  // ✅ MOSTRAR TAMBIÉN LAS CUADRADAS
      )
      .map((p: any) => ({
        id: p.id,
        ruta: p.tipo_ruta,
        fecha: p.fecha,
        fecha_alistamiento: p.fecha_alistamiento,
        entregador: p.entregador,
        estado: p.estado,
        cuadrado_en_caja: p.cuadrado_en_caja || false,  // ✅ Agregar indicador
        totalOrders: Array.isArray(p.pedidos) ? p.pedidos.length : 0,
        totalAmount: Number(p.total_cargue) || 0,
        orders: (p.pedidos || []).map((ped: any) => ({
          id: ped.id,
          cliente: ped.cliente,
          estado: ped.estado,  // ✅ Agregar estado del pedido
          items: (ped.productos || []).map((prod: any) => ({
            codigo: prod.codigo,
            descripcion: prod.nombre,
            categoria: prod.categoria || "",
            cantidad: Number(prod.cantidad) || 0,
            valorUnidad: Number(prod.precio_unitario) || 0,
            estadoAlistamiento: prod.estado_alistamiento || "pendiente",
            cantidadDisponible: prod.cantidad_disponible,
            cantidadFaltante: prod.cantidad_faltante || 0,
            unidadIncompleta: prod.unidad_incompleta || false,
            observacionesFaltante: prod.observaciones_faltante,
          })),
        })),
      }))

    setSupervisionSheets(planillasSupervision)

    // 2. Cargar SOLO faltantes pendientes
    const faltantesResponse = await fetch("/api/faltantes")
    if (faltantesResponse.ok) {
      const faltantesData = await faltantesResponse.json()
      
      const faltantesPendientes = (faltantesData.faltantes || []).filter(
        (f: any) => f.estado === 'pendiente'
      )
      
      console.log('[SUPERVISION] ✓ Datos cargados:', {
        planillas: planillasSupervision.length,
        totalFaltantes: faltantesData.faltantes?.length || 0,
        faltantesPendientes: faltantesPendientes.length
      })
      
      setFaltantes(faltantesPendientes)
    }

  } catch (err) {
    console.error("[SUPERVISION] ❌ Error:", err)
    alert("Error al cargar datos de supervisión: " + (err as Error).message)
  }
}
  const handleDevolverAlistamiento = async (planillaId: string, entregador: string, ruta: string) => {
    if (!confirm(`¿Devolver la planilla de ${entregador} - Ruta ${ruta} a estado "Alistando"?\n\nEsto permitirá al alistador completarla correctamente.`)) {
      return
    }

    try {
      await devolverAlistamiento(planillaId)
      alert('✅ Planilla devuelta al alistador correctamente')
      await loadSupervisionData()
    } catch (err) {
      console.error('[DEVOLVER] Error:', err)
      alert('❌ Error al devolver planilla: ' + (err as Error).message)
    }
  }

  const toggleEntregador = (entregador: string) => {
    const newExpanded = new Set(expandedEntregadores)
    if (newExpanded.has(entregador)) {
      newExpanded.delete(entregador)
    } else {
      newExpanded.add(entregador)
    }
    setExpandedEntregadores(newExpanded)
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
      const nurturingText = await nurturingFile.text()
      const planillaText = await planillaFile.text()

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

      const fecha = new Date().toISOString().split("T")[0]
      const orders = generateOrdersFromSales(sales, products, fecha)
      const sheets = generateRouteSheets(orders)

      const response = await fetch("/api/planillas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeSheets: sheets }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || `Error del servidor: ${response.status}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
      await loadPlanillas()
      setActiveTab("asignar")
      setIsProcessing(false)
    } catch (err) {
      setError("Error al procesar los archivos: " + (err as Error).message)
      setIsProcessing(false)
    }
  }

  const handleOpenAssignModal = (sheetId: string, ruta: string) => {
    const today = new Date().toISOString().split("T")[0]
    setAssignmentModal({
      sheetId,
      ruta,
      entregadorSeleccionado: "",
      fechaAlistamiento: today,
    })
  }

  const handleConfirmAssignment = async () => {
    if (!assignmentModal || !assignmentModal.entregadorSeleccionado) {
      alert("Seleccione un entregador")
      return
    }

    try {
      const response = await fetch("/api/assign-entregador", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planillaId: assignmentModal.sheetId,
          entregador: assignmentModal.entregadorSeleccionado,
          fechaAlistamiento: assignmentModal.fechaAlistamiento,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Error al asignar entregador")
      }

      setAssignmentModal(null)
      await loadPlanillas()
    } catch (err) {
      setError("Error al asignar entregador: " + (err as Error).message)
    }
  }

  const handleDeletePlanilla = async (sheetId: string) => {
    if (!confirm("¿Está seguro de eliminar esta planilla? Esta acción no se puede deshacer.")) {
      return
    }

    try {
      const response = await fetch(`/api/planillas/${sheetId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Error al eliminar planilla")
      }

      await loadPlanillas()
    } catch (err) {
      setError("Error al eliminar planilla: " + (err as Error).message)
    }
  }

  const handlePostponePlanilla = async (sheetId: string) => {
    try {
      const response = await fetch("/api/planillas/postpone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planillaId: sheetId }),
      })

      if (!response.ok) {
        throw new Error("Error al posponer planilla")
      }

      await loadPlanillas()
    } catch (err) {
      setError("Error al posponer planilla: " + (err as Error).message)
    }
  }

  const unassignedSheets = routeSheets.filter((s) => !s.entregador && s.estado === "pendiente")
  const assignedSheets = routeSheets.filter((s) => s.entregador || s.estado !== "pendiente")

  let filteredHistorial: RouteSheet[] = []

  if (hasActiveFilter) {
    filteredHistorial = assignedSheets.filter((s) => {
      const sheetDateOnly = s.fecha.split("T")[0]

      if (filterDate && filterDate.length === 10 && filterDate.includes("-")) {
        return (
          sheetDateOnly === filterDate &&
          (filterEntregador === "todos" || s.entregador === filterEntregador) &&
          (filterEstado === "todos" || s.estado === filterEstado)
        )
      }

      if (filterDate === "last7days") {
        const sheetDate = new Date(s.fecha)
        const today = new Date()
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(today.getDate() - 7)

        return (
          sheetDate >= sevenDaysAgo &&
          sheetDate <= today &&
          (filterEntregador === "todos" || s.entregador === filterEntregador) &&
          (filterEstado === "todos" || s.estado === filterEstado)
        )
      }

      if (filterDate === "currentMonth") {
        const sheetDate = new Date(s.fecha)
        const today = new Date()

        return (
          sheetDate.getMonth() === today.getMonth() &&
          sheetDate.getFullYear() === today.getFullYear() &&
          (filterEntregador === "todos" || s.entregador === filterEntregador) &&
          (filterEstado === "todos" || s.estado === filterEstado)
        )
      }

      return (
        (filterEntregador === "todos" || s.entregador === filterEntregador) &&
        (filterEstado === "todos" || s.estado === filterEstado)
      )
    })
  }

  const applyTodayFilter = () => {
    const today = new Date().toISOString().split("T")[0]
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

  // Función para consolidar productos (usada en supervisión)
  const getConsolidatedProducts = (sheets: typeof supervisionSheets) => {
    const productMap = new Map()

    sheets.forEach((sheet) => {
      sheet.orders.forEach((order) => {
        order.items.forEach((item: any) => {
          const existing = productMap.get(item.codigo)
          if (existing) {
            existing.cantidadTotal += item.cantidad
            if (item.estadoAlistamiento === "no_alistado") {
              existing.estadoAlistamiento = "no_alistado"
            } else if (item.estadoAlistamiento === "incompleto" && existing.estadoAlistamiento !== "no_alistado") {
              existing.estadoAlistamiento = "incompleto"
            }
            if (item.observacionesFaltante) {
              existing.observacionesFaltante = existing.observacionesFaltante
                ? `${existing.observacionesFaltante}; ${item.observacionesFaltante}`
                : item.observacionesFaltante
            }
          } else {
            productMap.set(item.codigo, {
              ...item,
              cantidadTotal: item.cantidad,
            })
          }
        })
      })
    })

    return Array.from(productMap.values()).sort((a: any, b: any) => {
      const cat = (a.categoria || "").localeCompare(b.categoria || "")
      return cat !== 0 ? cat : a.descripcion.localeCompare(b.descripcion)
    })
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
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="generar">
              <Upload className="h-4 w-4 mr-2" />
              Generar Hoy
            </TabsTrigger>
            <TabsTrigger value="asignar">
              <Truck className="h-4 w-4 mr-2" />
              Asignar ({unassignedSheets.length})
            </TabsTrigger>
            <TabsTrigger value="supervision">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Supervisión
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
                <p className="text-sm text-muted-foreground">Todas las planillas han sido asignadas</p>
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
                    <div key={sheet.id} className="flex flex-col gap-3 p-3 md:p-4 border rounded-lg bg-muted/50">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex-1">
                          <p className="font-medium text-sm md:text-base">Ruta {sheet.ruta}</p>
                          <p className="text-xs md:text-sm text-muted-foreground">
                            {sheet.totalOrders} pedidos · {formatCOP(sheet.totalAmount)}
                          </p>
                        </div>
                        <Button
                          onClick={() => handleOpenAssignModal(sheet.id, sheet.ruta)}
                          disabled={entregadores.length === 0}
                        >
                          Asignar Entregador
                        </Button>
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

          {/* PESTAÑA 3: SUPERVISIÓN */}
          <TabsContent value="supervision" className="space-y-4">
            <Card className="p-4 md:p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Supervisión de Planillas Alistadas
              </h2>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Filtrar por Entregador</label>
                <Select value={selectedEntregadorSupervision} onValueChange={setSelectedEntregadorSupervision}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos los entregadores</SelectItem>
                    {entregadores.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {supervisionSheets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="font-medium">No hay planillas alistadas</p>
                  <p className="text-sm mt-1">Las planillas aparecerán aquí una vez que el alistador las complete</p>
                </div>
              ) : (
                <div className="space-y-4 md:space-y-6">
                  {(() => {
                    const filteredSheets = supervisionSheets.filter(
                      (s) =>
                        selectedEntregadorSupervision === "todos" || s.entregador === selectedEntregadorSupervision,
                    )

                    const groupedByEntregadorYFecha = filteredSheets.reduce(
                      (acc, sheet) => {
                        const key = `${sheet.entregador}_${sheet.fecha_alistamiento || sheet.fecha}`

                        if (!acc[key]) {
                          acc[key] = {
                            entregador: sheet.entregador,
                            fecha_alistamiento: sheet.fecha_alistamiento || sheet.fecha,
                            sheets: [],
                          }
                        }

                        acc[key].sheets.push(sheet)
                        return acc
                      },
                      {} as Record<
                        string,
                        { entregador: string; fecha_alistamiento: string; sheets: typeof supervisionSheets }
                      >,
                    )

                    return Object.entries(groupedByEntregadorYFecha).map(([key, grupo]) => {
                      const { entregador, fecha_alistamiento, sheets } = grupo
                      const consolidatedProducts = getConsolidatedProducts(sheets)
                      const totalRoutes = sheets.length
                      const totalOrders = sheets.reduce((sum, s) => sum + s.totalOrders, 0)
                      const totalAmount = sheets.reduce((sum, s) => sum + s.totalAmount, 0)

                      const totalCompletos = consolidatedProducts.filter(
                        (p: any) => p.estadoAlistamiento === "completo",
                      ).length
                      const totalIncompletos = consolidatedProducts.filter(
                        (p: any) => p.estadoAlistamiento === "incompleto",
                      ).length
                      const totalNoAlistados = consolidatedProducts.filter(
                        (p: any) => p.estadoAlistamiento === "no_alistado",
                      ).length
                      const totalPendientes = consolidatedProducts.filter(
                        (p: any) => p.estadoAlistamiento === "pendiente",
                      ).length

                      const expanded = expandedEntregadores.has(key)

                      const fechaMostrar = new Date(fecha_alistamiento).toLocaleDateString("es-CO", {
                        day: "2-digit",
                        month: "short",
                      })

                      return (
                        <Card key={key} className="overflow-hidden border-2">
                          <div className="p-4 md:p-5 bg-gradient-to-r from-blue-50 to-green-50">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 md:gap-3 mb-2">
                                  <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-blue-600">
                                    <User className="h-5 w-5 md:h-6 md:w-6 text-white" />
                                  </div>
                                  <div>
                                    <h2 className="font-bold text-lg md:text-xl">
                                      {entregador} - {fechaMostrar}
                                    </h2>
                                    <p className="text-xs md:text-sm text-muted-foreground">
                                      {totalRoutes} ruta{totalRoutes > 1 ? "s" : ""} · {totalOrders} pedidos ·{" "}
                                      {formatCOP(totalAmount)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <span className="text-xs px-2 md:px-3 py-1 bg-white/80 text-blue-700 rounded-full font-medium">
                                    {consolidatedProducts.length} productos
                                  </span>
                                  {totalCompletos > 0 && (
                                    <span className="text-xs px-2 md:px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                                      ✅ {totalCompletos} completos
                                    </span>
                                  )}
                                  {totalIncompletos > 0 && (
                                    <span className="text-xs px-2 md:px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                                      ⚠️ {totalIncompletos} incompletos
                                    </span>
                                  )}
                                  {totalNoAlistados > 0 && (
                                    <span className="text-xs px-2 md:px-3 py-1 bg-red-100 text-red-700 rounded-full font-medium">
                                      ❌ {totalNoAlistados} no alistados
                                    </span>
                                  )}
                                  {totalPendientes > 0 && (
                                    <span className="text-xs px-2 md:px-3 py-1 bg-gray-100 text-gray-700 rounded-full font-medium">
                                      ⏳ {totalPendientes} pendientes
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
<Button
  variant="destructive"
  size="sm"
  onClick={async () => {
    const rutasTexto = sheets.map(s => `Ruta ${s.ruta}`).join(', ')
    
    if (!confirm(
      `¿Devolver la planilla de ${entregador} a estado "Alistando"?\n\n` +
      `Rutas incluidas: ${rutasTexto}\n\n` +
      `Esto permitirá al alistador completarla correctamente.`
    )) {
      return
    }

    try {
      // Devolver todas las rutas de la planilla del entregador
      for (const sheet of sheets) {
        await devolverAlistamiento(sheet.id)
      }
      
      alert(`Planilla devuelta al alistador correctamente (${sheets.length} rutas)`)
      await loadSupervisionData()
    } catch (err) {
      console.error('[DEVOLVER] Error:', err)
      alert('Error al devolver planilla: ' + (err as Error).message)
    }
  }}
  className="bg-orange-600 hover:bg-orange-700"
>
  Devolver
</Button>
                                <Button variant="outline" size="sm" onClick={() => toggleEntregador(key)}>
                                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>

                          {expanded && (
                            <div className="p-3 md:p-5">
                              <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-3 md:p-4 mb-4">
                                <h3 className="font-bold text-base md:text-lg mb-1 text-blue-800 flex items-center gap-2">
                                  <Package className="h-4 w-4 md:h-5 md:w-5" />
                                  Lista de Productos Consolidados
                                </h3>
                                <p className="text-xs md:text-sm text-blue-700">
                                  Estado de alistamiento de cada producto
                                </p>
                              </div>

                              <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-xs md:text-sm">
                                  <thead className="bg-muted">
                                    <tr>
                                      <th className="text-left py-2 md:py-3 px-2 md:px-4 font-semibold">Código</th>
                                      <th className="text-left py-2 md:py-3 px-2 md:px-4 font-semibold">Descripción</th>
                                      <th className="text-left py-2 md:py-3 px-2 md:px-4 font-semibold hidden sm:table-cell">
                                        Categoría
                                      </th>
                                      <th className="text-right py-2 md:py-3 px-2 md:px-4 font-semibold">Cantidad</th>
                                      <th className="text-center py-2 md:py-3 px-2 md:px-4 font-semibold">Estado</th>
                                      <th className="text-left py-2 md:py-3 px-2 md:px-4 font-semibold">
                                        Observaciones
                                      </th>
                                      <th className="text-center py-2 md:py-3 px-2 md:px-4 font-semibold">Acción</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {consolidatedProducts.map((producto: any) => (
                                      <tr key={producto.codigo} className="border-b hover:bg-muted/50">
                                        <td className="py-2 md:py-3 px-2 md:px-4 font-mono text-xs">
                                          {producto.codigo}
                                        </td>
                                        <td className="py-2 md:py-3 px-2 md:px-4">{producto.descripcion}</td>
                                        <td className="py-2 md:py-3 px-2 md:px-4 hidden sm:table-cell">
                                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                                            {producto.categoria || "Sin categoría"}
                                          </span>
                                        </td>
                                        <td className="text-right py-2 md:py-3 px-2 md:px-4 font-bold text-base">
                                          {producto.cantidadTotal}
                                        </td>
                                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                                          <span
                                            className={`text-xs px-3 py-1.5 rounded-full font-medium ${
                                              producto.estadoAlistamiento === "completo"
                                                ? "bg-green-100 text-green-800 border border-green-300"
                                                : producto.estadoAlistamiento === "incompleto"
                                                  ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                                                  : producto.estadoAlistamiento === "no_alistado"
                                                    ? "bg-red-100 text-red-800 border border-red-300"
                                                    : "bg-gray-100 text-gray-700 border border-gray-300"
                                            }`}
                                          >
                                            {producto.estadoAlistamiento === "completo"
                                              ? "✅ Completo"
                                              : producto.estadoAlistamiento === "incompleto"
                                                ? "⚠️ Incompleto"
                                                : producto.estadoAlistamiento === "no_alistado"
                                                  ? "❌ No alistado"
                                                  : "⏳ Pendiente"}
                                          </span>
                                        </td>
                                        <td className="py-2 md:py-3 px-2 md:px-4 text-xs text-muted-foreground">
                                          {producto.observacionesFaltante || "-"}
                                        </td>
                                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                              const faltantesDelProducto = faltantes.filter(
                                                (f) =>
                                                  f.codigo === producto.codigo &&
                                                  f.entregador === entregador &&
                                                  f.estado === "pendiente",
                                              )

                                              if (faltantesDelProducto.length > 0) {
                                                setFaltanteParaSubsanar({
                                                  id: faltantesDelProducto[0].id,
                                                  codigo: producto.codigo,
                                                  descripcion: producto.descripcion,
                                                  categoria: producto.categoria,
                                                  cantidad_faltante: faltantesDelProducto[0].cantidad_faltante,
                                                  entregador: entregador,
                                                  ruta: sheets[0]?.ruta || "",
                                                  estado: producto.estadoAlistamiento,
                                                  observaciones: producto.observacionesFaltante,
                                                })
                                              } else {
                                                alert("No se encontró el faltante en la base de datos")
                                              }
                                            }}
                                            disabled={producto.estadoAlistamiento === "completo"}
                                          >
                                            Subsanar
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </Card>
                      )
                    })
                  })()}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* PESTAÑA 4: HISTORIAL */}
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

              <div className="flex flex-wrap gap-2 mb-4">
                <Button
                  variant={filterDate === new Date().toISOString().split("T")[0] ? "default" : "outline"}
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
                    value={filterDate.startsWith("20") ? filterDate : ""}
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
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
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
                          {sheet.fecha} · {sheet.entregador || "Sin asignar"} · {sheet.totalOrders} pedidos ·{" "}
                          {formatCOP(sheet.totalAmount)}
                        </p>
                      </div>
                      <span
                        className={`text-xs px-3 py-1 rounded-full whitespace-nowrap ${
                          sheet.estado === "completado"
                            ? "bg-green-100 text-green-700"
                            : sheet.estado === "alistado"
                              ? "bg-blue-100 text-blue-700"
                              : sheet.estado === "alistando"
                                ? "bg-yellow-100 text-yellow-700"
                                : sheet.estado === "pospuesto"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-gray-100 text-gray-600"
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

      {assignmentModal && (
        <Dialog open={!!assignmentModal} onOpenChange={() => setAssignmentModal(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Asignar Entregador - Ruta {assignmentModal.ruta}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <label className="block text-sm font-medium mb-2">Entregador</label>
                <Select
                  value={assignmentModal.entregadorSeleccionado}
                  onValueChange={(value) =>
                    setAssignmentModal({
                      ...assignmentModal,
                      entregadorSeleccionado: value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar entregador" />
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

              <div>
                <label className="block text-sm font-medium mb-2">Fecha de Alistamiento</label>
                <input
                  type="date"
                  value={assignmentModal.fechaAlistamiento}
                  onChange={(e) =>
                    setAssignmentModal({
                      ...assignmentModal,
                      fechaAlistamiento: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 border rounded-md"
                  min={new Date().toISOString().split("T")[0]}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  El alistador verá esta ruta en la fecha seleccionada
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignmentModal(null)}>
                Cancelar
              </Button>
              <Button onClick={handleConfirmAssignment}>Confirmar Asignación</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <SubsanarFaltantesModal
        faltante={faltanteParaSubsanar}
        onClose={() => setFaltanteParaSubsanar(null)}
        onSubmit={handleSubsanarFaltante}
      />
    </>
  )
}
