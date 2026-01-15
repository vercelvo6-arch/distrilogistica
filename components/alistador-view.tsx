"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Package, LogOut, CheckCircle, ChevronDown, ChevronUp, User, Edit, Loader2, FileText, Trash2, Calendar } from "lucide-react"
import type { RouteSheet } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import { useState, useEffect } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { updatePlanillaEstado } from "@/lib/actions/planillas"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FaltantesHistorialView } from "@/components/faltantes-historial-view"

interface AlistadorViewProps {
  onLogout: () => void
  user: { id: string; nombre: string }
}

interface ConsolidatedProduct {
  codigo: string
  descripcion: string
  categoria: string
  cantidadTotal: number
  valorUnidad: number
  cantidadDisponible: number | null
  cantidadFaltante: number
  unidadIncompleta: boolean
  observacionesFaltante: string | null
  estadoAlistamiento: 'pendiente' | 'completo' | 'incompleto' | 'no_alistado'
}

export function AlistadorView({ onLogout, user }: AlistadorViewProps) {
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [rutasProgramadas, setRutasProgramadas] = useState<RouteSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedDeliveryPersons, setExpandedDeliveryPersons] = useState<Set<string>>(new Set())
  const [editingProduct, setEditingProduct] = useState<{ entregador: string; product: ConsolidatedProduct } | null>(null)
  const [disponibleInput, setDisponibleInput] = useState("")
  const [estadoSeleccionado, setEstadoSeleccionado] = useState<'completo' | 'incompleto' | 'no_alistado'>("completo")
  const [observaciones, setObservaciones] = useState("")
  const [activeTab, setActiveTab] = useState("alistamiento")

  useEffect(() => {
    loadData()
  }, [])

  // 🔥 FUNCIÓN CORREGIDA - Confiar 100% en la BD
  // 🔥 FUNCIÓN CON FILTRO POR FECHA DE ALISTAMIENTO
  async function loadData() {
  try {
    const response = await fetch('/api/planillas', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })
    
    if (!response.ok) throw new Error('Error al cargar planillas')
    
    const data = await response.json()

    // 🔥 OBTENER FECHA DE HOY (solo YYYY-MM-DD)
    const hoy = new Date().toISOString().split('T')[0]
    console.log('[ALISTADOR] 📅 Fecha actual:', hoy)

    // 🔥 SEPARAR: planillas para HOY vs FUTURAS
    const planillasHoy: any[] = []
    const planillasFuturas: any[] = []

    const fechaAlistamiento = p.fecha_alistamiento 
  ? p.fecha_alistamiento.split('T')[0].trim()
  : hoy

console.log('[DEBUG] Comparando:', { 
  ruta: p.tipo_ruta, 
  fechaAlistamiento, 
  hoy, 
  resultado: fechaAlistamiento > hoy ? 'FUTURA' : 'HOY' 
})

      const tieneEntregador = p.entregador
      const estaActiva = p.estado === 'pendiente' || p.estado === 'alistando'

      if (!tieneEntregador || !estaActiva) return // Ignorar sin entregador o completadas

      if (fechaAlistamiento <= hoy) {
        // ✅ Para alistar HOY o atrasadas
        planillasHoy.push(p)
        console.log('[ALISTADOR] ✅ Para alistar HOY:', {
          ruta: p.tipo_ruta,
          entregador: p.entregador,
          fecha_alistamiento: fechaAlistamiento,
        })
      } else {
        // 📅 Programadas para el FUTURO (solo lectura)
        planillasFuturas.push(p)
        console.log('[ALISTADOR] 📅 Programada (futuro):', {
          ruta: p.tipo_ruta,
          entregador: p.entregador,
          fecha_alistamiento: fechaAlistamiento,
        })
      }
    })

    console.log('[ALISTADOR] 📊 Para alistar hoy:', planillasHoy.length)
    console.log('[ALISTADOR] 📊 Programadas (futuro):', planillasFuturas.length)

    // Mapear planillas HOY
    const planillas: RouteSheet[] = planillasHoy.map((p: any) => ({
      id: p.id,
      ruta: p.tipo_ruta,
      fecha: p.fecha,
      entregador: p.entregador,
      estado: p.estado,
      fecha_alistamiento: p.fecha_alistamiento,
      totalOrders: (p.pedidos || []).filter((ped: any) => ped.id !== null).length,
      totalAmount: Number(p.total_cargue) || 0,
      montoCargue: Number(p.total_cargue) || 0,
      montoEntregado: Number(p.total_entregado) || 0,
      montoFiado: Number(p.total_fiado) || 0,
      montoDevoluciones: Number(p.total_devolucion) || 0,
      montoRepasos: Number(p.total_repaso) || 0,
      orders: (p.pedidos || []).filter((ped: any) => ped.id !== null).map((ped: any) => ({
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
          cantidadDisponible: prod.cantidad_disponible,
          cantidadFaltante: prod.cantidad_faltante || 0,
          unidadIncompleta: prod.unidad_incompleta || false,
          observacionesFaltante: prod.observaciones_faltante,
          estadoAlistamiento: prod.estado_alistamiento || 'pendiente',
        })),
      })),
      cuentasPorCobrar: [],
    }))

    // Mapear planillas FUTURAS (mismo formato)
    const programadas: RouteSheet[] = planillasFuturas.map((p: any) => ({
      id: p.id,
      ruta: p.tipo_ruta,
      fecha: p.fecha,
      entregador: p.entregador,
      estado: p.estado,
      fecha_alistamiento: p.fecha_alistamiento,
      totalOrders: (p.pedidos || []).filter((ped: any) => ped.id !== null).length,
      totalAmount: Number(p.total_cargue) || 0,
      montoCargue: Number(p.total_cargue) || 0,
      montoEntregado: 0,
      montoFiado: 0,
      montoDevoluciones: 0,
      montoRepasos: 0,
      orders: (p.pedidos || []).filter((ped: any) => ped.id !== null).map((ped: any) => ({
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
          cantidadDisponible: null,
          cantidadFaltante: 0,
          unidadIncompleta: false,
          observacionesFaltante: null,
          estadoAlistamiento: 'pendiente',
        })),
      })),
      cuentasPorCobrar: [],
    }))

    setRouteSheets(planillas)
    setRutasProgramadas(programadas) // 🔥 GUARDAR PROGRAMADAS
    
  } catch (err) {
    console.error("[ALISTADOR] Error loading planillas:", err)
  } finally {
    setLoading(false)
  }
}

  const pendingSheets = routeSheets.filter(
    (s) => s.entregador && (s.estado === "pendiente" || s.estado === "alistando"),
  )

  const unassignedSheets = routeSheets.filter((s) => !s.entregador)

  const groupedByDeliveryPerson = pendingSheets.reduce(
    (acc, sheet) => {
      const entregador = sheet.entregador!
      if (!acc[entregador]) {
        acc[entregador] = []
      }
      acc[entregador].push(sheet)
      return acc
    },
    {} as Record<string, RouteSheet[]>,
  )

  const getConsolidatedProducts = (sheets: RouteSheet[]): ConsolidatedProduct[] => {
    const productMap = new Map<string, ConsolidatedProduct>()

    sheets.forEach((sheet) => {
      sheet.orders.forEach((order) => {
        order.items.forEach((item) => {
          const existing = productMap.get(item.codigo)
          if (existing) {
            existing.cantidadTotal += item.cantidad
            if (item.cantidadFaltante) {
              existing.cantidadFaltante += item.cantidadFaltante
            }
            if (item.unidadIncompleta) {
              existing.unidadIncompleta = true
            }
            if (item.estadoAlistamiento && item.estadoAlistamiento !== 'pendiente') {
              existing.estadoAlistamiento = item.estadoAlistamiento
            }
          } else {
            productMap.set(item.codigo, {
              codigo: item.codigo,
              descripcion: item.descripcion,
              categoria: item.categoria,
              cantidadTotal: item.cantidad,
              valorUnidad: item.valorUnidad,
              cantidadDisponible: item.cantidadDisponible,
              cantidadFaltante: item.cantidadFaltante || 0,
              unidadIncompleta: item.unidadIncompleta || false,
              observacionesFaltante: item.observacionesFaltante,
              estadoAlistamiento: item.estadoAlistamiento || 'pendiente',
            })
          }
        })
      })
    })

    return Array.from(productMap.values()).sort((a, b) => {
      const cat = a.categoria.localeCompare(b.categoria)
      return cat !== 0 ? cat : a.descripcion.localeCompare(b.descripcion)
    })
  }

  const handleOpenEditDialog = (entregador: string, product: ConsolidatedProduct) => {
    setEditingProduct({ entregador, product })
    setDisponibleInput(product.cantidadDisponible?.toString() || product.cantidadTotal.toString())
    
    if (product.estadoAlistamiento === 'no_alistado') {
      setEstadoSeleccionado('no_alistado')
    } else if (product.unidadIncompleta) {
      setEstadoSeleccionado('incompleto')
    } else {
      setEstadoSeleccionado('completo')
    }
    
    setObservaciones(product.observacionesFaltante || "")
  }

  // 🔥 FUNCIÓN CORREGIDA - Guardar SIEMPRE en BD
  const handleSaveEstadoAlistamiento = async () => {
    if (!editingProduct) return

    const disponible = Number(disponibleInput) || 0

    // Validaciones solo para estados que requieren observaciones
    if (estadoSeleccionado === 'no_alistado' && !observaciones.trim()) {
      alert('Por favor agregue observaciones para productos no alistados')
      return
    }

    if (estadoSeleccionado === 'incompleto' && !observaciones.trim()) {
      alert('Por favor agregue observaciones para productos incompletos')
      return
    }

    try {
      setSaving(true)

      const sheetForEntregador = routeSheets.find(s => 
        s.entregador === editingProduct.entregador &&
        s.orders.some(order => 
          order.items.some(item => item.codigo === editingProduct.product.codigo)
        )
      )

      if (!sheetForEntregador) {
        throw new Error('No se encontró planilla para el entregador')
      }

      const faltante = editingProduct.product.cantidadTotal - disponible

      console.log('🔍 DEBUG - Guardando estado:', {
        codigo: editingProduct.product.codigo,
        estadoSeleccionado,
        disponible,
        faltante,
        planilla_id: sheetForEntregador.id
      })

      // 🔥 SIEMPRE GUARDAR EN BASE DE DATOS - NO IMPORTA EL ESTADO
      const saveResponse = await fetch('/api/faltantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planilla_id: sheetForEntregador.id,
          codigo: editingProduct.product.codigo,
          descripcion: editingProduct.product.descripcion,
          categoria: editingProduct.product.categoria,
          entregador: editingProduct.entregador,
          ruta: sheetForEntregador.ruta,
          cantidadSolicitada: editingProduct.product.cantidadTotal,
          cantidadDisponible: disponible,
          cantidadFaltante: faltante,
          unidadIncompleta: estadoSeleccionado === 'incompleto',
          observaciones: observaciones.trim() || null,
          marcadoPor: user.id,
          estadoAlistamiento: estadoSeleccionado,
        }),
      })

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json()
        throw new Error(errorData.error || 'Error al guardar estado')
      }

      console.log('✅ Estado guardado correctamente en BD')

      // 🔥 ACTUALIZAR EL ESTADO LOCAL INMEDIATAMENTE
      const updatedSheets = routeSheets.map(sheet => {
        if (sheet.entregador === editingProduct.entregador) {
          return {
            ...sheet,
            orders: sheet.orders.map(order => ({
              ...order,
              items: order.items.map(item => {
                if (item.codigo === editingProduct.product.codigo) {
                  return {
                    ...item,
                    estadoAlistamiento: estadoSeleccionado,
                    cantidadDisponible: disponible,
                    cantidadFaltante: faltante,
                    unidadIncompleta: estadoSeleccionado === 'incompleto',
                    observacionesFaltante: observaciones.trim() || null
                  }
                }
                return item
              })
            }))
          }
        }
        return sheet
      })

      // Actualizar el estado inmediatamente para feedback visual
      setRouteSheets(updatedSheets)

      setEditingProduct(null)
      setDisponibleInput("")
      setEstadoSeleccionado("completo")
      setObservaciones("")

    } catch (err) {
      console.error("[ALISTADOR] Error saving estado:", err)
      alert('Error al guardar estado de alistamiento: ' + (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

 // ... continuación de AlistadorView

  const handleStartPreparation = async (entregador: string) => {
    try {
      const sheetsToUpdate = routeSheets.filter((s) => s.entregador === entregador && s.estado === "pendiente")

      for (const sheet of sheetsToUpdate) {
        await updatePlanillaEstado(sheet.id, "alistando")
      }

      await loadData()
    } catch (err) {
      console.error("[ALISTADOR] Error starting preparation:", err)
    }
  }

  const handleCompletePreparation = async (entregador: string) => {
    try {
      const sheetsToUpdate = routeSheets.filter((s) => s.entregador === entregador && s.estado === "alistando")

      for (const sheet of sheetsToUpdate) {
        await updatePlanillaEstado(sheet.id, "alistado", user.id)
      }

      await loadData()
    } catch (err) {
      console.error("[ALISTADOR] Error completing preparation:", err)
    }
  }

  const handleEliminarRutasEntregador = async (entregador: string) => {
    const sheetsToDelete = routeSheets.filter((s) => s.entregador === entregador && s.estado === "pendiente")
    
    if (sheetsToDelete.length === 0) {
      alert("No hay rutas pendientes para eliminar")
      return
    }

    const totalRutas = sheetsToDelete.length
    const rutasStr = sheetsToDelete.map(s => s.ruta).join(", ")
    
    if (!confirm(`¿ELIMINAR ${totalRutas} ruta(s) de ${entregador}?\n\nRutas: ${rutasStr}\n\nEl coordinador deberá regenerarlas.`)) {
      return
    }

    try {
      let eliminadas = 0
      
      for (const sheet of sheetsToDelete) {
        const response = await fetch(`/api/planillas/${sheet.id}`, {
          method: 'DELETE',
        })

        if (response.ok) {
          eliminadas++
        }
      }

      alert(`${eliminadas} ruta(s) eliminadas correctamente`)
      await loadData()
      
    } catch (err) {
      console.error("[ALISTADOR] Error eliminando rutas:", err)
      alert("Error al eliminar las rutas")
    }
  }

  const toggleDeliveryPerson = (entregador: string) => {
    const newExpanded = new Set(expandedDeliveryPersons)
    if (newExpanded.has(entregador)) {
      newExpanded.delete(entregador)
    } else {
      newExpanded.add(entregador)
    }
    setExpandedDeliveryPersons(newExpanded)
  }

  const getEstadoInfo = (estado: string) => {
    switch (estado) {
      case 'completo':
        return { 
          label: 'Completo', 
          color: 'bg-green-100 text-green-800 border border-green-300',
          icon: '✅'
        }
      case 'incompleto':
        return { 
          label: 'Incompleto', 
          color: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
          icon: '⚠️'
        }
      case 'no_alistado':
        return { 
          label: 'No Alistado', 
          color: 'bg-red-100 text-red-800 border border-red-300',
          icon: '❌'
        }
      default:
        return { 
          label: 'Pendiente', 
          color: 'bg-gray-100 text-gray-700 border border-gray-300',
          icon: '⏳'
        }
    }
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
        <div className="container mx-auto px-3 md:px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-purple-500">
                <Package className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold">Alistador de Bodega</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Preparación optimizada por entregador</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 md:px-4 py-4 md:py-8 max-w-7xl">
        {unassignedSheets.length > 0 && (
          <Alert className="mb-4 md:mb-6 bg-amber-50 border-amber-200">
            <AlertDescription className="text-xs md:text-sm text-amber-800">
              Hay {unassignedSheets.length} ruta(s) esperando asignación de entregador por parte del coordinador
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
  <TabsTrigger value="alistamiento" className="text-sm md:text-base">
    <Package className="h-4 w-4 mr-2" />
    Alistamiento
  </TabsTrigger>
  <TabsTrigger value="programadas" className="text-sm md:text-base">
    <Calendar className="h-4 w-4 mr-2" />
    Programadas ({rutasProgramadas.length})
  </TabsTrigger>
  <TabsTrigger value="novedades" className="text-sm md:text-base">
    <FileText className="h-4 w-4 mr-2" />
    Novedades
  </TabsTrigger>
</TabsList>

          <TabsContent value="alistamiento">
            {pendingSheets.length === 0 ? (
              <Card className="p-8 md:p-12 text-center">
                <Package className="h-12 w-12 md:h-16 md:w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-base md:text-lg font-semibold mb-2">No hay rutas para alistar</h3>
                <p className="text-sm md:text-base text-muted-foreground">
                  Espere a que el coordinador genere las planillas y asigne los entregadores
                </p>
              </Card>
            ) : (
              <div className="space-y-4 md:space-y-6">
                {Object.entries(groupedByDeliveryPerson).map(([entregador, sheets]) => {
                  const isExpanded = expandedDeliveryPersons.has(entregador)
                  const consolidatedProducts = getConsolidatedProducts(sheets)
                  const totalRoutes = sheets.length
                  const totalOrders = sheets.reduce((sum, s) => sum + s.totalOrders, 0)
                  const totalAmount = sheets.reduce((sum, s) => sum + s.totalAmount, 0)
                  const allPending = sheets.every((s) => s.estado === "pendiente")
                  const allReady = sheets.every((s) => s.estado === "alistando")
                  
                  const totalCompletos = consolidatedProducts.filter(p => p.estadoAlistamiento === 'completo').length
                  const totalIncompletos = consolidatedProducts.filter(p => p.estadoAlistamiento === 'incompleto').length
                  const totalNoAlistados = consolidatedProducts.filter(p => p.estadoAlistamiento === 'no_alistado').length
                  const totalPendientes = consolidatedProducts.filter(p => p.estadoAlistamiento === 'pendiente').length

                  return (
                    <Card key={entregador} className="overflow-hidden border-2">
                      <div className="p-4 md:p-5 bg-gradient-to-r from-purple-50 to-blue-50">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 md:gap-3 mb-2">
                              <div className="flex h-10 w-10 md:h-12 md:w-12 items-center justify-center rounded-lg bg-purple-600">
                                <User className="h-5 w-5 md:h-6 md:w-6 text-white" />
                              </div>
                              <div>
                                <h2 className="font-bold text-lg md:text-xl">{entregador}</h2>
                                <p className="text-xs md:text-sm text-muted-foreground">
                                  {totalRoutes} ruta{totalRoutes > 1 ? "s" : ""} · {totalOrders} pedidos · Total:{" "}
                                  {formatCOP(totalAmount)}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              <span className="text-xs px-2 md:px-3 py-1 bg-white/80 text-purple-700 rounded-full font-medium">
                                {consolidatedProducts.length} productos
                              </span>
                              {totalCompletos > 0 && (
                                <span className="text-xs px-2 md:px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                                  ✅ {totalCompletos} completos
                                </span>
                              )}
                              {totalIncompletos > 0 && (
                                <span className="text-xs px-2 md:px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium flex items-center gap-1">
                                  ⚠️ {totalIncompletos} incompletos
                                </span>
                              )}
                              {totalNoAlistados > 0 && (
                                <span className="text-xs px-2 md:px-3 py-1 bg-red-100 text-red-700 rounded-full font-medium flex items-center gap-1">
                                  ❌ {totalNoAlistados} no alistados
                                </span>
                              )}
                              {totalPendientes > 0 && (
                                <span className="text-xs px-2 md:px-3 py-1 bg-gray-100 text-gray-700 rounded-full font-medium flex items-center gap-1">
                                  ⏳ {totalPendientes} pendientes
                                </span>
                              )}
                              <span
                                className={`text-xs px-2 md:px-3 py-1 rounded-full font-medium ${
                                  allPending
                                    ? "bg-yellow-100 text-yellow-700"
                                    : allReady
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-orange-100 text-orange-700"
                                }`}
                              >
                                {allPending ? "Por alistar" : allReady ? "Listo para completar" : "En proceso"}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => toggleDeliveryPerson(entregador)}>
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                            {allPending && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEliminarRutasEntregador(entregador)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  <span className="hidden md:inline">Eliminar</span>
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleStartPreparation(entregador)}
                                  className="bg-blue-600 text-xs md:text-sm"
                                >
                                  Iniciar
                                </Button>
                              </>
                            )}
                            {allReady && (
                              <Button
                                size="sm"
                                onClick={() => handleCompletePreparation(entregador)}
                                className="bg-green-600 text-xs md:text-sm"
                              >
                                <CheckCircle className="h-4 w-4 mr-1 md:mr-2" />
                                Completar
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="p-3 md:p-5">
                          <div className="mb-4 md:mb-6">
                            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-3 md:p-4 mb-4">
                              <h3 className="font-bold text-base md:text-lg mb-1 text-green-800 flex items-center gap-2">
                                <Package className="h-4 w-4 md:h-5 md:w-5" />
                                Lista de Productos Consolidados
                              </h3>
                              <p className="text-xs md:text-sm text-green-700 mb-4">
                                Registre el estado de alistamiento de cada producto
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
                                    <th className="text-right py-2 md:py-3 px-2 md:px-4 font-semibold">Solicitado</th>
                                    <th className="text-center py-2 md:py-3 px-2 md:px-4 font-semibold">Estado</th>
                                    <th className="text-center py-2 md:py-3 px-2 md:px-4 font-semibold">Acción</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {consolidatedProducts.map((product) => {
                                    const estadoInfo = getEstadoInfo(product.estadoAlistamiento)
                                    return (
                                      <tr 
                                        key={product.codigo} 
                                        className="border-b hover:bg-muted/50"
                                      >
                                        <td className="py-2 md:py-3 px-2 md:px-4 font-mono text-xs">{product.codigo}</td>
                                        <td className="py-2 md:py-3 px-2 md:px-4">
                                          {product.descripcion}
                                          {product.observacionesFaltante && (
                                            <p className="text-xs text-orange-600 mt-1">
                                              📝 {product.observacionesFaltante}
                                            </p>
                                          )}
                                        </td>
                                        <td className="py-2 md:py-3 px-2 md:px-4 hidden sm:table-cell">
                                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                                            {product.categoria}
                                          </span>
                                        </td>
                                        <td className="text-right py-2 md:py-3 px-2 md:px-4 font-bold text-base">
                                          {product.cantidadTotal}
                                        </td>
                                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                                          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${estadoInfo.color}`}>
                                            {estadoInfo.icon} {estadoInfo.label}
                                          </span>
                                        </td>
                                        <td className="text-center py-2 md:py-3 px-2 md:px-4">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleOpenEditDialog(entregador, product)}
                                            className="text-xs"
                                          >
                                            <Edit className="h-3 w-3 mr-1" />
                                            {product.estadoAlistamiento === 'pendiente' ? 'Registrar' : 'Editar'}
                                          </Button>
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="programadas">
  {rutasProgramadas.length === 0 ? (
    <Card className="p-8 md:p-12 text-center">
      <Calendar className="h-12 w-12 md:h-16 md:w-16 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-base md:text-lg font-semibold mb-2">No hay rutas programadas</h3>
      <p className="text-sm md:text-base text-muted-foreground">
        Las rutas con fecha de alistamiento futura aparecerán aquí
      </p>
    </Card>
  ) : (
    <div className="space-y-3">
      {rutasProgramadas.map((sheet) => {
        const fechaAlistamiento = sheet.fecha_alistamiento 
          ? new Date(sheet.fecha_alistamiento).toLocaleDateString('es-CO')
          : 'Sin fecha'
        
        return (
          <Card key={sheet.id} className="p-4 border-l-4 border-l-blue-500 bg-blue-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <p className="font-bold text-blue-900">
                    Ruta {sheet.ruta} - {sheet.entregador}
                  </p>
                </div>
                <p className="text-sm text-blue-700">
                  📅 Programada para: <span className="font-semibold">{fechaAlistamiento}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {sheet.totalOrders} pedidos · {formatCOP(sheet.totalAmount)}
                </p>
              </div>
              <span className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full font-medium">
                Programada
              </span>
            </div>
          </Card>
        )
      })}
    </div>
  )}
</TabsContent>

          <TabsContent value="novedades">
            <FaltantesHistorialView userId={user.id} userRole="alistador" />
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={!!editingProduct} onOpenChange={() => !saving && setEditingProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Estado de Alistamiento</DialogTitle>
          </DialogHeader>
          
          {editingProduct && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-900">Producto:</p>
                <p className="text-sm text-blue-700">{editingProduct.product.descripcion}</p>
                <p className="text-xs font-mono text-blue-600 mt-1">{editingProduct.product.codigo}</p>
                <p className="text-sm font-bold text-blue-900 mt-2">
                  Cantidad solicitada: {editingProduct.product.cantidadTotal} unidades
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  ¿Cuántas unidades hay disponibles?
                </label>
                <Input
                  type="number"
                  min="0"
                  max={editingProduct.product.cantidadTotal}
                  value={disponibleInput}
                  onChange={(e) => setDisponibleInput(e.target.value)}
                  placeholder="Ej: 10"
                  className="text-lg font-bold"
                  disabled={saving}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium block">Estado del producto:</label>
                <RadioGroup 
                  value={estadoSeleccionado} 
                  onValueChange={(value: string) => setEstadoSeleccionado(value as 'completo' | 'incompleto' | 'no_alistado')}
                  disabled={saving}
                >
                  <div className="flex items-center space-x-2 p-2 rounded border hover:bg-muted">
                    <RadioGroupItem value="completo" id="completo" />
                    <Label htmlFor="completo" className="font-normal cursor-pointer flex-1">
                      ✅ Completo (todo OK)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-2 rounded border hover:bg-muted">
                    <RadioGroupItem value="incompleto" id="incompleto" />
                    <Label htmlFor="incompleto" className="font-normal cursor-pointer flex-1">
                      ⚠️ Incompleto (faltan piezas dentro de la unidad)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 p-2 rounded border hover:bg-muted">
                    <RadioGroupItem value="no_alistado" id="no_alistado" />
                    <Label htmlFor="no_alistado" className="font-normal cursor-pointer flex-1">
                      ❌ No alistado (no hay stock)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {(estadoSeleccionado === "incompleto" || estadoSeleccionado === "no_alistado") && (
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Observaciones (requerido):
                  </label>
                  <Textarea
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Describe la situación: ¿qué falta?, ¿por qué?, ¿cuándo estará disponible?"
                    className="min-h-[100px]"
                    disabled={saving}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingProduct(null)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEstadoAlistamiento}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Guardar Estado
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
