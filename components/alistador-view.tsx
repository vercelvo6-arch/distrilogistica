"use client"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Package, LogOut, CheckCircle, ChevronDown, ChevronUp, User, AlertTriangle, Edit } from "lucide-react"
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
}

export function AlistadorView({ onLogout, user }: AlistadorViewProps) {
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDeliveryPersons, setExpandedDeliveryPersons] = useState<Set<string>>(new Set())
  const [editingProduct, setEditingProduct] = useState<{ entregador: string; product: ConsolidatedProduct } | null>(null)
  const [disponibleInput, setDisponibleInput] = useState("")
  const [estadoUnidad, setEstadoUnidad] = useState<"completa" | "incompleta">("completa")
  const [observaciones, setObservaciones] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const response = await fetch('/api/planillas', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) throw new Error('Error al cargar planillas')
      
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
            cantidadDisponible: prod.cantidad_disponible !== null ? Number(prod.cantidad_disponible) : null,
            cantidadFaltante: Number(prod.cantidad_faltante) || 0,
            unidadIncompleta: Boolean(prod.unidad_incompleta),
            observacionesFaltante: prod.observaciones_faltante,
          })),
        })),
        cuentasPorCobrar: [],
      }))
      
      setRouteSheets(planillas)
      
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
    setDisponibleInput(product.cantidadDisponible?.toString() || "")
    setEstadoUnidad(product.unidadIncompleta ? "incompleta" : "completa")
    setObservaciones(product.observacionesFaltante || "")
  }

  const handleSaveCantidadDisponible = async () => {
    if (!editingProduct) return

    const disponible = Number(disponibleInput)
    
    if (isNaN(disponible) || disponible < 0) {
      alert('Por favor ingrese una cantidad válida (0 o mayor)')
      return
    }

    if (disponible > editingProduct.product.cantidadTotal) {
      alert(`La cantidad disponible no puede ser mayor a la solicitada (${editingProduct.product.cantidadTotal})`)
      return
    }

    const faltante = Math.max(0, editingProduct.product.cantidadTotal - disponible)
    const esIncompleta = estadoUnidad === "incompleta"

    if (esIncompleta && !observaciones.trim()) {
      alert('Por favor agregue observaciones para unidades incompletas')
      return
    }

    setSaving(true)

    try {
      const payload = {
        codigo: editingProduct.product.codigo,
        entregador: editingProduct.entregador,
        cantidadSolicitada: editingProduct.product.cantidadTotal,
        cantidadDisponible: disponible,
        cantidadFaltante: faltante,
        unidadIncompleta: esIncompleta,
        observaciones: esIncompleta ? observaciones.trim() : null,
        usuarioId: user.id,
      }

      console.log('[ALISTADOR] Enviando payload:', payload)

      const response = await fetch('/api/productos/faltante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const result = await response.json()
      
      if (!response.ok) {
        throw new Error(result.error || 'Error al guardar cantidad')
      }

      console.log('[ALISTADOR] Respuesta exitosa:', result)

      setEditingProduct(null)
      setDisponibleInput("")
      setEstadoUnidad("completa")
      setObservaciones("")
      await loadData()

    } catch (err) {
      console.error("[ALISTADOR] Error saving cantidad:", err)
      alert(err instanceof Error ? err.message : 'Error al guardar cantidad disponible')
    } finally {
      setSaving(false)
    }
  }

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

  const toggleDeliveryPerson = (entregador: string) => {
    const newExpanded = new Set(expandedDeliveryPersons)
    if (newExpanded.has(entregador)) {
      newExpanded.delete(entregador)
    } else {
      newExpanded.add(entregador)
    }
    setExpandedDeliveryPersons(newExpanded)
  }

  const getEstadoProducto = (product: ConsolidatedProduct) => {
    if (product.cantidadDisponible === null) {
      return { label: 'Pendiente', color: 'bg-gray-100 text-gray-700' }
    }
    if (product.unidadIncompleta) {
      return { label: 'Incompleto', color: 'bg-orange-100 text-orange-700' }
    }
    if (product.cantidadFaltante > 0) {
      return { label: 'Faltante', color: 'bg-red-100 text-red-700' }
    }
    return { label: 'Completo', color: 'bg-green-100 text-green-700' }
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
              const totalIncompletos = consolidatedProducts.filter(p => p.unidadIncompleta).length
              const totalFaltantes = consolidatedProducts.filter(p => p.cantidadFaltante > 0).length

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
                            {consolidatedProducts.length} productos diferentes
                          </span>
                          {totalIncompletos > 0 && (
                            <span className="text-xs px-2 md:px-3 py-1 bg-orange-100 text-orange-700 rounded-full font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {totalIncompletos} incompleto{totalIncompletos > 1 ? "s" : ""}
                            </span>
                          )}
                          {totalFaltantes > 0 && (
                            <span className="text-xs px-2 md:px-3 py-1 bg-red-100 text-red-700 rounded-full font-medium flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              {totalFaltantes} faltante{totalFaltantes > 1 ? "s" : ""}
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
                          <Button
                            size="sm"
                            onClick={() => handleStartPreparation(entregador)}
                            className="bg-blue-600 text-xs md:text-sm"
                          >
                            Iniciar
                          </Button>
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
                            Indique la cantidad disponible y estado de cada producto
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
                                <th className="text-right py-2 md:py-3 px-2 md:px-4 font-semibold">Disponible</th>
                                <th className="text-center py-2 md:py-3 px-2 md:px-4 font-semibold">Estado</th>
                                <th className="text-center py-2 md:py-3 px-2 md:px-4 font-semibold">Acción</th>
                              </tr>
                            </thead>
                            <tbody>
                              {consolidatedProducts.map((product) => {
                                const estadoInfo = getEstadoProducto(product)
                                return (
                                  <tr 
                                    key={product.codigo} 
                                    className={`border-b hover:bg-muted/50 ${
                                      product.unidadIncompleta ? 'bg-orange-50' : 
                                      product.cantidadFaltante > 0 ? 'bg-red-50' : ''
                                    }`}
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
                                    <td className="text-right py-2 md:py-3 px-2 md:px-4 font-bold">
                                      {product.cantidadDisponible ?? '-'}
                                    </td>
                                    <td className="text-center py-2 md:py-3 px-2 md:px-4">
                                      <span className={`text-xs px-2 py-1 rounded-full ${estadoInfo.color}`}>
                                        {estadoInfo.label}
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
                                        {product.cantidadDisponible === null ? 'Registrar' : 'Editar'}
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
      </main>

      <Dialog open={!!editingProduct} onOpenChange={() => {
        if (!saving) {
          setEditingProduct(null)
          setObservaciones("")
          setEstadoUnidad("completa")
          setDisponibleInput("")
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar Cantidad Disponible</DialogTitle>
          </DialogHeader>
          
          {editingProduct && (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Producto:</p>
                <p className="text-sm text-muted-foreground">{editingProduct.product.descripcion}</p>
              </div>
              
              <div>
                <p className="text-sm font-medium mb-1">Código:</p>
                <p className="text-sm font-mono">{editingProduct.product.codigo}</p>
              </div>

              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-sm font-bold text-blue-900">
                  Cantidad solicitada: {editingProduct.product.cantidadTotal} unidades
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  ¿Cuántas unidades hay disponibles en bodega?
                </label>
                <Input
                  type="number"
                  min="0"
                  max={editingProduct.product.cantidadTotal}
                  value={disponibleInput}
                  onChange={(e) => setDisponibleInput(e.target.value)}
                  placeholder="Ej: 7"
                  className="text-lg font-bold"
                  autoFocus
                  disabled={saving}
                />
              </div>

              {disponibleInput && Number(disponibleInput) > 0 && (
                <>
                  <div className="space-y-3">
                    <label className="text-sm font-medium block">
                      Estado de las unidades:
                    </label>
                    <RadioGroup 
                      value={estadoUnidad} 
                      onValueChange={(value: string) => setEstadoUnidad(value as "completa" | "incompleta")}
                      disabled={saving}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="completa" id="completa" />
                        <Label htmlFor="completa" className="font-normal cursor-pointer">
                          ✅ Unidades completas (todo OK)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="incompleta" id="incompleta" />
                        <Label htmlFor="incompleta" className="font-normal cursor-pointer">
                          ⚠️ Unidades incompletas (faltan piezas dentro)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {estadoUnidad === "incompleta" && (
                    <div>
                      <label className="text-sm font-medium mb-2 block text-orange-700">
                        Detalle de unidades incompletas: *
                      </label>
                      <Textarea
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                        placeholder="Ej: Caja incompleta: faltan 2 latas de 6"
                        className="min-h-[80px]"
                        required
                        disabled={saving}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        * Requerido para unidades incompletas
                      </p>
                    </div>
                  )}
                </>
              )}

              {disponibleInput && (
                <div className={`p-3 rounded-lg ${
                  Number(disponibleInput) >= editingProduct.product.cantidadTotal
                    ? 'bg-green-50'
                    : 'bg-red-50'
                }`}>
                  <p className={`text-sm font-bold ${
                    Number(disponibleInput) >= editingProduct.product.cantidadTotal
                      ? 'text-green-900'
                      : 'text-red-900'
                  }`}>
                    {Number(disponibleInput) >= editingProduct.product.cantidadTotal ? (
                      <>✓ Cantidad completa</>
                    ) : (
                      <>⚠️ Faltante: {editingProduct.product.cantidadTotal - Number(disponibleInput)} unidades</>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setEditingProduct(null)
                setObservaciones("")
                setEstadoUnidad("completa")
                setDisponibleInput("")
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveCantidadDisponible} 
              disabled={!disponibleInput || saving}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
