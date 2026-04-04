"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RefreshCw, ArrowRight, X, Trash2 } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { useToast } from "@/hooks/use-toast"

interface RepasosPedido {
  id: string
  cliente: string
  planilla_origen_id: number
  ruta_origen: string
  fecha_origen: string
  entregador_origen: string
  total: number
  observaciones?: string
  productos: {
    codigo: string
    nombre: string
    cantidad: number
    precio_unitario: number
    total: number
  }[]
}

interface PlanillaDestino {
  id: number
  tipo_ruta: string
  fecha: string
  entregador: string
  estado: string
  total_cargue: number
}

interface RepassosViewProps {
  onLogout: () => void
  userRole: string
}

export function RepassosView({ onLogout, userRole }: RepassosViewProps) {
  const { toast } = useToast()
  const [repasos, setRepasos] = useState<RepasosPedido[]>([])
  const [planillasDisponibles, setPlanillasDisponibles] = useState<PlanillaDestino[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRepaso, setSelectedRepaso] = useState<RepasosPedido | null>(null)
  const [showAsignarModal, setShowAsignarModal] = useState(false)
  const [showEliminarModal, setShowEliminarModal] = useState(false)
  const [planillaDestinoId, setPlanillaDestinoId] = useState<string>("")
  const [asignando, setAsignando] = useState(false)
  const [eliminando, setEliminando] = useState(false)

  const isMounted = useRef(true)

  useEffect(() => {
    loadData()
    
    return () => {
      isMounted.current = false
    }
  }, [])

  async function loadData() {
    try {
      setLoading(true)
      await Promise.all([loadRepasos(), loadPlanillasDisponibles()])
    } catch (err) {
      console.error("Error loading data:", err)
      if (isMounted.current) {
        toast({
          title: "Error",
          description: "No se pudieron cargar los datos",
          variant: "destructive",
        })
      }
    } finally {
      if (isMounted.current) {
        setLoading(false)
      }
    }
  }

  async function loadRepasos() {
    try {
      const response = await fetch("/api/repasos")
      if (!response.ok) throw new Error("Error al cargar repasos")

      const data = await response.json()
      if (isMounted.current) {
        setRepasos(data.repasos || [])
      }
    } catch (err) {
      console.error("Error loading repasos:", err)
      throw err
    }
  }

  async function loadPlanillasDisponibles() {
    try {
      const response = await fetch("/api/planillas")
      if (!response.ok) throw new Error("Error al cargar planillas")

      const data = await response.json()
      
      const planillasFuturas = (data.planillas || [])
        .sort((a: any, b: any) => {
          return new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
        })
        .map((p: any) => ({
          id: p.id,
          tipo_ruta: p.tipo_ruta,
          fecha: p.fecha,
          entregador: p.entregador,
          estado: p.estado,
          total_cargue: Number(p.total_cargue) || 0,
        }))

      if (isMounted.current) {
        setPlanillasDisponibles(planillasFuturas)
      }
    } catch (err) {
      console.error("Error loading planillas:", err)
      throw err
    }
  }

  function openAsignarModal(repaso: RepasosPedido) {
    setSelectedRepaso(repaso)
    setPlanillaDestinoId("")
    setShowAsignarModal(true)
  }

  function openEliminarModal(repaso: RepasosPedido) {
    setSelectedRepaso(repaso)
    setShowEliminarModal(true)
  }

  function closeModal() {
    setShowAsignarModal(false)
    setShowEliminarModal(false)
    setSelectedRepaso(null)
    setPlanillaDestinoId("")
  }

  async function handleAsignarRepaso() {
    if (!selectedRepaso || !planillaDestinoId) {
      toast({
        title: "Error",
        description: "Selecciona una planilla de destino",
        variant: "destructive",
      })
      return
    }

    try {
      setAsignando(true)

      const payload = {
        pedidoId: selectedRepaso.id,
        planillaDestinoId: planillaDestinoId,
      }
      
      console.log('🔍 Enviando payload:', payload)

      const response = await fetch("/api/repasos/asignar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()
      
      console.log('📥 Respuesta:', data)

      if (!response.ok) {
        throw new Error(data.error || "Error al asignar repaso")
      }

      if (isMounted.current) {
        toast({
          title: "✅ Repaso Asignado",
          description: `Repaso asignado exitosamente. El monto se sumó al cargue de la planilla.`,
        })

        closeModal()
        await loadData()
      }
    } catch (error) {
      console.error("Error asignando repaso:", error)
      if (isMounted.current) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Error al asignar repaso",
          variant: "destructive",
        })
      }
    } finally {
      if (isMounted.current) {
        setAsignando(false)
      }
    }
  }

  async function handleEliminarRepaso() {
    if (!selectedRepaso) return

    try {
      setEliminando(true)

      const response = await fetch("/api/repasos/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId: selectedRepaso.id }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al eliminar repaso")
      }

      if (isMounted.current) {
        toast({
          title: "🗑️ Repaso Eliminado",
          description: `El repaso de ${selectedRepaso.cliente} fue eliminado correctamente.`,
        })

        closeModal()
        await loadData()
      }
    } catch (error) {
      console.error("Error eliminando repaso:", error)
      if (isMounted.current) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Error al eliminar repaso",
          variant: "destructive",
        })
      }
    } finally {
      if (isMounted.current) {
        setEliminando(false)
      }
    }
  }

  const totalRepasos = repasos.reduce((sum, r) => sum + r.total, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-blue-600" />
              Gestión de Repasos
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pedidos pendientes de reasignación a rutas futuras
            </p>
          </div>
          <Button onClick={loadData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4 bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-700 mb-1">Total Repasos</p>
            <p className="text-3xl font-bold text-blue-600">{repasos.length}</p>
          </Card>
          <Card className="p-4 bg-purple-50 border-purple-200">
            <p className="text-sm text-purple-700 mb-1">Valor Total</p>
            <p className="text-3xl font-bold text-purple-600">{formatCOP(totalRepasos)}</p>
          </Card>
          <Card className="p-4 bg-green-50 border-green-200">
            <p className="text-sm text-green-700 mb-1">Planillas Disponibles</p>
            <p className="text-3xl font-bold text-green-600">{planillasDisponibles.length}</p>
          </Card>
        </div>

        {repasos.length === 0 ? (
          <Card className="p-8 text-center">
            <RefreshCw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-muted-foreground">
              No hay repasos pendientes
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Los pedidos marcados como "repaso" aparecerán aquí
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {repasos.map((repaso) => (
              <Card key={repaso.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h3 className="text-lg font-semibold">{repaso.cliente}</h3>
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                        {repaso.productos.length} productos
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      <div>
                        <p className="text-muted-foreground">Ruta Origen</p>
                        <p className="font-medium">{repaso.ruta_origen}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Entregador</p>
                        <p className="font-medium">{repaso.entregador_origen}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Fecha Origen</p>
                        <p className="font-medium">
                          {new Date(repaso.fecha_origen).toLocaleDateString("es-CO")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Valor Total</p>
                        <p className="font-bold text-blue-600">{formatCOP(repaso.total)}</p>
                      </div>
                    </div>

                    {repaso.observaciones && (
                      <div className="bg-muted p-3 rounded text-sm mb-3">
                        <p className="text-muted-foreground">Observaciones:</p>
                        <p>{repaso.observaciones}</p>
                      </div>
                    )}

                    <details className="text-sm">
                      <summary className="cursor-pointer text-blue-600 font-medium mb-2">
                        Ver productos ({repaso.productos.length})
                      </summary>
                      <div className="ml-4 space-y-1">
                        {repaso.productos.map((prod, idx) => (
                          <div key={idx} className="flex justify-between py-1 border-b">
                            <span>
                              {prod.codigo} - {prod.nombre} x{prod.cantidad}
                            </span>
                            <span className="font-medium">{formatCOP(prod.total)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>

                  <div className="ml-4 flex flex-col gap-2">
                    <Button
                      onClick={() => openAsignarModal(repaso)}
                      size="sm"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Asignar a Ruta
                    </Button>
                    <Button
                      onClick={() => openEliminarModal(repaso)}
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* MODAL ASIGNAR REPASO */}
      {showAsignarModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">Asignar Repaso a Planilla</h2>
                <p className="text-sm text-muted-foreground">
                  Cliente: {selectedRepaso?.cliente} - Total: {formatCOP(selectedRepaso?.total || 0)}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={closeModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4 py-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Planilla de Destino
                </label>
                
                <select
                  value={planillaDestinoId}
                  onChange={(e) => setPlanillaDestinoId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background"
                >
                  <option value="">Selecciona una planilla</option>
                  {planillasDisponibles.map((planilla) => (
                    <option key={planilla.id} value={planilla.id.toString()}>
                      Ruta {planilla.tipo_ruta} - {planilla.entregador} - {new Date(planilla.fecha).toLocaleDateString("es-CO")}
                    </option>
                  ))}
                </select>
              </div>

              {planillaDestinoId && (
                <Card className="p-4 bg-green-50 border-green-200">
                  <p className="text-sm font-medium text-green-900 mb-2">
                    ✓ El repaso será agregado a esta planilla
                  </p>
                  <p className="text-xs text-green-700">
                    El total del pedido ({formatCOP(selectedRepaso?.total || 0)}) se sumará al
                    total_cargue de la planilla destino
                  </p>
                </Card>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={closeModal}
                disabled={asignando}
              >
                Cancelar
              </Button>
              <Button onClick={handleAsignarRepaso} disabled={asignando || !planillaDestinoId}>
                {asignando ? "Asignando..." : "Confirmar Asignación"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL ELIMINAR REPASO */}
      {showEliminarModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-red-600">Eliminar Repaso</h2>
              <Button variant="ghost" size="icon" onClick={closeModal}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-4 py-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded">
                <p className="font-medium text-red-800 mb-2">
                  Cliente: {selectedRepaso?.cliente}
                </p>
                <p className="text-sm text-red-700">
                  Total: {formatCOP(selectedRepaso?.total || 0)}
                </p>
                <p className="text-sm text-red-700">
                  Productos: {selectedRepaso?.productos.length}
                </p>
              </div>

              <p className="text-sm text-gray-600">
                ⚠️ Esta acción es <strong>irreversible</strong>. El repaso será eliminado permanentemente
                y el cargue de la planilla será actualizado automáticamente.
              </p>

              <p className="text-xs text-gray-500">
                Solo elimina repasos si fueron creados por error. Si el pedido debe ser entregado,
                usa "Asignar a Ruta" en su lugar.
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={closeModal}
                disabled={eliminando}
              >
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleEliminarRepaso} 
                disabled={eliminando}
              >
                {eliminando ? "Eliminando..." : "Eliminar Repaso"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
