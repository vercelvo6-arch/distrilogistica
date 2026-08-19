"use client"

import type React from "react"
import { useState, useEffect, startTransition } from "react"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SubsanarFaltantesModal, type Faltante, type SubsanacionData } from "@/components/subsanar-faltantes-modal"
import { EliminadosView } from "@/components/eliminados-view"
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
  // Estados para importación por lotes
  const [importProgress, setImportProgress] = useState(0)
  const [importStatus, setImportStatus] = useState<string>("")
  const [isImporting, setIsImporting] = useState(false)

  // Estados para supervisión
  const [supervisionSheets, setSupervisionSheets] = useState<RouteSheet[]>([])
  const [selectedEntregadorSupervision, setSelectedEntregadorSupervision] = useState<string>("todos")
  const [faltantes, setFaltantes] = useState<any[]>([])
  const [faltantesResueltos, setFaltantesResueltos] = useState<any[]>([])
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
    esAsesor: boolean
    nombreAsesor: string
  } | null>(null)

  useEffect(() => {
    loadPlanillas()
    loadEntregadores()
  }, [])

  useEffect(() => {
  if (activeTab === "supervision") {
    // ✅ FIX: Delay aumentado a 150ms para que Radix UI termine
    // de animar la transición del tab antes de disparar setState masivo.
    // Evita el NotFoundError: 'removeChild' on Node (React 19 + Radix).
    const timer = setTimeout(() => {
      loadSupervisionData()
    }, 150)
    return () => clearTimeout(timer)
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
    p.cuadrado_en_caja === true  // ✅ Incluir cuadradas
  )
      .map((p: any) => ({
        id: p.id,
        ruta: p.tipo_ruta,
        fecha: p.fecha,
        fecha_alistamiento: p.fecha_alistamiento,
        entregador: p.entregador,
        estado: p.estado,
        cuadrado_en_caja: p.cuadrado_en_caja || false,
        timer_inicio: p.timer_inicio || null,
        timer_fin: p.timer_fin || null,
        timer_segundos_pausados: p.timer_segundos_pausados || 0,
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

    // 2. Cargar SOLO faltantes pendientes
    const faltantesResponse = await fetch("/api/faltantes")
    let faltantesPendientes: any[] = []
    let faltantesYaResueltos: any[] = []
    if (faltantesResponse.ok) {
      const faltantesData = await faltantesResponse.json()
      faltantesPendientes = (faltantesData.faltantes || []).filter(
        (f: any) => f.estado === 'pendiente'
      )
      // ✅ Necesario para poder revertir: el botón "Revertir" busca aquí
      faltantesYaResueltos = (faltantesData.faltantes || []).filter(
        (f: any) => f.estado === 'resuelto' || f.estado === 'definitivo'
      )
      console.log('[SUPERVISION] ✓ Datos cargados:', {
        planillas: planillasSupervision.length,
        totalFaltantes: faltantesData.faltantes?.length || 0,
        faltantesPendientes: faltantesPendientes.length,
        faltantesResueltos: faltantesYaResueltos.length
      })
    }

    // Actualizar estado directamente — urgente para reflejar cambios del coordinador en pantalla
    setSupervisionSheets([...planillasSupervision])
    setFaltantes(faltantesPendientes)
    setFaltantesResueltos(faltantesYaResueltos)

  } catch (err) {
    console.error("[SUPERVISION] ❌ Error:", err)
    alert("Error al cargar datos de supervisión: " + (err as Error).message)
  }
}
  // ✅ FIX: Función async separada para abrir modal de subsanar (pedidos de último momento)
  const handleAbrirSubsanar = async (producto: any, entregador: string, sheets: any[]) => {
    const faltantesDelProducto = faltantes.filter(
      (f) => f.codigo === producto.codigo && f.entregador === entregador && f.estado === "pendiente",
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
      // Crear faltante automáticamente si no existe (pedido de último momento)
      const sheetDelEntregador = sheets.find((s: any) => s.entregador === entregador)
      const createResponse = await fetch('/api/faltantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planilla_id: sheetDelEntregador?.id,
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          categoria: producto.categoria || '',
          entregador: entregador,
          ruta: sheets[0]?.ruta || '',
          cantidadSolicitada: producto.cantidadTotal,
          cantidadDisponible: 0,
          cantidadFaltante: producto.cantidadTotal,
          unidadIncompleta: false,
          observaciones: 'Registrado por coordinador',
          marcadoPor: user.id,
          estadoAlistamiento: 'no_alistado',
        }),
      })
      if (createResponse.ok) {
        const faltantesResp = await fetch('/api/faltantes').then(r => r.json())
        const nuevoFaltante = (faltantesResp.faltantes || []).find(
          (f: any) => f.codigo === producto.codigo && f.entregador === entregador && f.estado === 'pendiente'
        )
        if (nuevoFaltante) {
          setFaltanteParaSubsanar({
            id: nuevoFaltante.id,
            codigo: producto.codigo,
            descripcion: producto.descripcion,
            categoria: producto.categoria,
            cantidad_faltante: producto.cantidadTotal,
            entregador: entregador,
            ruta: sheets[0]?.ruta || '',
            estado: producto.estadoAlistamiento,
            observaciones: producto.observacionesFaltante,
          })
        }
      } else {
        alert("Error al registrar el faltante automáticamente")
      }
    }
  }

  const handleReportarErrorAlistamiento = async (producto: any, entregador: string, sheets: any[]) => {
    const cantidadRealStr = window.prompt(
      `"${producto.descripcion}" se marcó como Completo (${producto.cantidadTotal} unidades).\n\n¿Cuántas unidades hay REALMENTE disponibles?`
    )
    if (cantidadRealStr === null) return

    const cantidadReal = Number(cantidadRealStr)
    if (isNaN(cantidadReal) || cantidadReal < 0) {
      alert("Ingresa un número válido")
      return
    }
    if (cantidadReal >= producto.cantidadTotal) {
      alert("La cantidad real debe ser menor a la cantidad solicitada, de lo contrario no hay error que corregir")
      return
    }

    const nota = window.prompt("Nota breve sobre el error de alistamiento (obligatoria):")
    if (!nota || !nota.trim()) return

    const sheetDelEntregador = sheets.find((s: any) =>
      s.orders?.some((o: any) =>
        o.items?.some((p: any) => p.codigo === producto.codigo)
      )
    ) || sheets.find((s: any) => s.entregador === entregador)

    try {
      const response = await fetch('/api/faltantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planilla_id: sheetDelEntregador?.id,
          codigo: producto.codigo,
          descripcion: producto.descripcion,
          categoria: producto.categoria || '',
          entregador: entregador,
          ruta: sheetDelEntregador?.ruta || sheets[0]?.ruta || '',
          cantidadSolicitada: producto.cantidadTotal,
          cantidadDisponible: cantidadReal,
          cantidadFaltante: producto.cantidadTotal - cantidadReal,
          unidadIncompleta: false,
          observaciones: `[Corregido por coordinador] ${nota.trim()}`,
          marcadoPor: user.id,
          estadoAlistamiento: 'incompleto',
        }),
      })

      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Error al reportar el error de alistamiento')

      alert('Error de alistamiento registrado. Ahora puedes subsanarlo con la cantidad correcta.')
      await loadSupervisionData()
    } catch (err) {
      console.error('[REPORTAR ERROR ALISTAMIENTO] ❌', err)
      alert('Error al reportar: ' + (err as Error).message)
    }
  }

  const handleRevertirFaltante = async (producto: any, entregador: string) => {
    const faltantesDelProducto = faltantesResueltos.filter(
      (f) => f.codigo === producto.codigo && f.entregador === entregador,
    )

    if (faltantesDelProducto.length === 0) {
      alert("No se encontró el registro de faltante para revertir")
      return
    }

    const justificacion = window.prompt(
      `¿Por qué se revierte la subsanación de "${producto.descripcion}"?\n\nEsta justificación quedará registrada.`
    )

    if (!justificacion || !justificacion.trim()) {
      return
    }

    try {
      const response = await fetch("/api/faltantes/revertir", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          faltanteId: faltantesDelProducto[0].id,
          justificacion: justificacion.trim(),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Error al revertir")
      }

      alert(result.mensaje || "Faltante revertido correctamente")
      await loadSupervisionData()
    } catch (err) {
      console.error("[REVERTIR] ❌ ERROR:", err)
      alert("Error al revertir faltante: " + (err as Error).message)
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

    setIsImporting(true)
    setImportProgress(0)
    setImportStatus("Leyendo archivos...")
    setError(null)

    try {
      const nurturingText = await nurturingFile.text()
      const planillaText = await planillaFile.text()

      // PASO 1: Generar TODAS las rutas en el frontend
      setImportStatus("Generando rutas...")
      const sales = parseNurturingCSV(nurturingText)
      const products = parsePlanillaCSV(planillaText)

      if (sales.length === 0) {
        setError("No se encontraron ventas en el archivo NURTURING")
        setIsImporting(false)
        return
      }

      if (products.length === 0) {
        setError("No se encontró inventario en el archivo PLANILLA")
        setIsImporting(false)
        return
      }

      const fecha = new Date().toISOString().split("T")[0]
      const orders = generateOrdersFromSales(sales, products, fecha)
      const sheets = generateRouteSheets(orders)

      setImportStatus(`Procesando ${sheets.length} rutas...`)

      // PASO 2: Parse - informar al backend cuántas rutas hay
      const parseResponse = await fetch('/api/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'parse',
          routeSheets: sheets
        })
      })

      const parseData = await parseResponse.json()
      
      if (!parseResponse.ok) {
        throw new Error(parseData.error || 'Error al analizar rutas')
      }

      const totalRoutes = parseData.totalRoutes
      setImportStatus(`Guardando ${totalRoutes} rutas...`)

      // PASO 3: Import por lotes de RUTAS COMPLETAS
      let offset = 0
      let hasMore = true
      let totalImported = 0

      while (hasMore) {
        const batchResponse = await fetch('/api/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import-batch',
            routeSheets: sheets,
            offset
          })
        })

        const batchData = await batchResponse.json()

        if (!batchResponse.ok) {
          throw new Error(batchData.error || 'Error al importar lote')
        }

        totalImported += batchData.imported
        offset = batchData.offset
        hasMore = batchData.hasMore
        
        setImportProgress(batchData.progress)
        setImportStatus(`Guardando rutas... ${totalImported}/${totalRoutes} (${batchData.progress}%)`)

        // Pequeña pausa para no saturar el servidor
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      setImportStatus("✅ Importación completada")
      setImportProgress(100)
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      await loadPlanillas()
      setActiveTab("asignar")
      
      setIsImporting(false)
      setImportProgress(0)
      setImportStatus("")

    } catch (err) {
      setError("Error al procesar: " + (err as Error).message)
      setIsImporting(false)
      setImportProgress(0)
      setImportStatus("")
    }
  }

  const handleOpenAssignModal = (sheetId: string, ruta: string) => {
    const today = new Date().toISOString().split("T")[0]
    setAssignmentModal({
      sheetId,
      ruta,
      entregadorSeleccionado: "",
      fechaAlistamiento: today,
      esAsesor: false,
      nombreAsesor: "",
    })
  }

  const handleConfirmAssignment = async () => {
    if (!assignmentModal) return

    if (assignmentModal.esAsesor) {
      if (!assignmentModal.nombreAsesor.trim()) {
        alert("Ingrese el nombre del asesor")
        return
      }
    } else if (!assignmentModal.entregadorSeleccionado) {
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
          esAsesor: assignmentModal.esAsesor,
          nombreAsesor: assignmentModal.nombreAsesor.trim(),
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
      console.log('[COORD] Eliminando planilla:', sheetId)
      
      const response = await fetch('/api/planillas/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planillaId: sheetId })
   })

      const data = await response.json()
      console.log('[COORD] Respuesta:', data)

      if (!response.ok) {
        throw new Error(data.error || "Error al eliminar planilla")
      }

      alert('✅ Planilla eliminada correctamente')
      await loadPlanillas()
      
    } catch (err) {
      console.error('[COORD] Error completo:', err)
      alert("❌ Error al eliminar planilla: " + (err as Error).message)
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
          <TabsList className="grid w-full grid-cols-5 mb-6">
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
            <TabsTrigger value="eliminados">
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminados
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

                {isImporting && (
                  <div className="space-y-3 mb-4">
                    <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                      <div 
                        className="bg-blue-600 h-3 transition-all duration-300 rounded-full"
                        style={{ width: `${importProgress}%` }}
                      />
                    </div>
                    <p className="text-sm text-center text-muted-foreground">
                      {importStatus}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleGeneratePlanillas}
                  disabled={!nurturingFile || !planillaFile || isImporting}
                  className="w-full"
                  size="lg"
                >
                  <FileSpreadsheet className="h-4 w-4 md:h-5 md:w-5 mr-2" />
                  {isImporting ? "Procesando..." : "Generar Planillas por Ruta"}
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

                      // ✅ Calcular tiempo neto de alistamiento desde timer en BD
                      const tiempoAlistamiento = (() => {
                        const sheetConTimer = sheets.find((s: any) => s.timer_inicio && s.timer_fin)
                        if (!sheetConTimer) return null
                        const inicio = new Date((sheetConTimer as any).timer_inicio).getTime()
                        const fin = new Date((sheetConTimer as any).timer_fin).getTime()
                        const pausados = (sheetConTimer as any).timer_segundos_pausados || 0
                        const netos = Math.round((fin - inicio) / 1000) - pausados
                        if (netos <= 0) return null
                        const horas = Math.floor(netos / 3600)
                        const minutos = Math.floor((netos % 3600) / 60)
                        const segundos = netos % 60
                        if (horas > 0) return `${horas}h ${minutos}m ${segundos}s`
                        if (minutos > 0) return `${minutos}m ${segundos}s`
                        return `${segundos}s`
                      })()

                      const totalCompletos = consolidatedProducts.filter(
                        (p: any) => p.estadoAlistamiento === "completo",
                      ).length
                      const totalIncompletos = consolidatedProducts.filter(
                        (p: any) => p.estadoAlistamiento === "incompleto",
                      ).length
                      const totalReemplazos = consolidatedProducts.filter(
                        (p: any) => p.estadoAlistamiento === "reemplazo",
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

                      const nombresRutas = Array.from(new Set(sheets.map((s) => s.ruta).filter(Boolean))).map(
                        (r) => `Ruta ${r}`,
                      )
                      const rutasTexto =
                        nombresRutas.length <= 1
                          ? nombresRutas.join("")
                          : `${nombresRutas.slice(0, -1).join(", ")} y ${nombresRutas[nombresRutas.length - 1]}`

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
                                      {totalRoutes} ruta{totalRoutes > 1 ? "s" : ""}
                                      {rutasTexto ? ` (${rutasTexto})` : ""} · {totalOrders} pedidos ·{" "}
                                      {formatCOP(totalAmount)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <span className="text-xs px-2 md:px-3 py-1 bg-white/80 text-blue-700 rounded-full font-medium">
                                    {consolidatedProducts.length} productos
                                  </span>
                                  {tiempoAlistamiento && (
                                    <span className="text-xs px-2 md:px-3 py-1 bg-purple-100 text-purple-700 rounded-full font-medium">
                                      ⏱ {tiempoAlistamiento}
                                    </span>
                                  )}
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
                                  {totalReemplazos > 0 && (
                                    <span className="text-xs px-2 md:px-3 py-1 bg-orange-100 text-orange-700 rounded-full font-medium">
                                      🔄 {totalReemplazos} reemplazos
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
                                                  : producto.estadoAlistamiento === "reemplazo"
                                                    ? "bg-orange-100 text-orange-800 border border-orange-300"
                                                    : producto.estadoAlistamiento === "no_alistado"
                                                      ? "bg-red-100 text-red-800 border border-red-300"
                                                      : "bg-gray-100 text-gray-700 border border-gray-300"
                                            }`}
                                          >
                                            {producto.estadoAlistamiento === "completo"
                                              ? "✅ Completo"
                                              : producto.estadoAlistamiento === "incompleto"
                                                ? "⚠️ Incompleto"
                                                : producto.estadoAlistamiento === "reemplazo"
                                                  ? "🔄 Reemplazo"
                                                  : producto.estadoAlistamiento === "no_alistado"
                                                    ? "❌ No alistado"
                                                    : "⏳ Pendiente"}
                                          </span>
                                        </td>
                                        <td className="py-2 md:py-3 px-2 md:px-4 text-xs text-muted-foreground">
                                          {producto.estadoAlistamiento === "reemplazo" && producto.productoReemplazo ? (
                                            <span className="text-orange-600 font-medium">
                                              🔄 {producto.productoReemplazo}
                                            </span>
                                          ) : producto.observacionesFaltante || "-"}
                                        </td>
                                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                                          {(() => {
                                            const tieneFaltanteResuelto = faltantesResueltos.some(
                                              (f) => f.codigo === producto.codigo && f.entregador === entregador
                                            )
                                            return (
                                              <div className="flex flex-col gap-1 items-stretch">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => handleAbrirSubsanar(producto, entregador, sheets)}
                                                  disabled={producto.estadoAlistamiento === "completo"}
                                                  className="whitespace-nowrap"
                                                >
                                                  Subsanar
                                                </Button>
                                                {(producto.estadoAlistamiento === "no_alistado" || (producto.estadoAlistamiento === "completo" && tieneFaltanteResuelto)) && (
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-red-600 border-red-300 hover:bg-red-50 whitespace-nowrap"
                                                    onClick={() => handleRevertirFaltante(producto, entregador)}
                                                  >
                                                    Revertir
                                                  </Button>
                                                )}
                                                {producto.estadoAlistamiento === "completo" && !tieneFaltanteResuelto && (
                                                  <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="text-orange-600 border-orange-300 hover:bg-orange-50 whitespace-nowrap"
                                                    onClick={() => handleReportarErrorAlistamiento(producto, entregador, sheets)}
                                                  >
                                                    Reportar error
                                                  </Button>
                                                )}
                                              </div>
                                            )
                                          })()}
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

          {/* PESTAÑA 5: ELIMINADOS */}
          <TabsContent value="eliminados" className="space-y-4">
            <EliminadosView />
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
              {!assignmentModal.esAsesor && (
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
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="esAsesorCheckbox"
                  checked={assignmentModal.esAsesor}
                  onCheckedChange={(checked) =>
                    setAssignmentModal({
                      ...assignmentModal,
                      esAsesor: checked === true,
                      entregadorSeleccionado: checked === true ? "" : assignmentModal.entregadorSeleccionado,
                      nombreAsesor: checked === true ? assignmentModal.nombreAsesor : "",
                    })
                  }
                />
                <label htmlFor="esAsesorCheckbox" className="text-sm font-medium cursor-pointer">
                  Es planilla de asesor
                </label>
              </div>

              {assignmentModal.esAsesor && (
                <div>
                  <label className="block text-sm font-medium mb-2">Nombre del asesor</label>
                  <input
                    type="text"
                    value={assignmentModal.nombreAsesor}
                    onChange={(e) =>
                      setAssignmentModal({
                        ...assignmentModal,
                        nombreAsesor: e.target.value,
                      })
                    }
                    placeholder="Nombre del asesor"
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>
              )}

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

      {faltanteParaSubsanar && (
  <SubsanarFaltantesModal
    faltante={faltanteParaSubsanar}
    onClose={() => setFaltanteParaSubsanar(null)}
    onSubmit={handleSubsanarFaltante}
  />
)}
    </>
  )
}
