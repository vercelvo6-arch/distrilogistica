"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCOP } from "@/lib/format-utils"
import { useToast } from "@/hooks/use-toast"
import { Plus, Trash2, AlertCircle, X } from "lucide-react"
import type { Order } from "@/lib/types"

interface ModalNovedadesEntregadorProps {
  order: Order
  planillaId: string  // ← string, no number
  onClose: () => void
  onNovedadCreada: () => void
}

interface Novedad {
  id: string
  tipo_novedad: string
  monto_novedad: number
  monto_pagado?: number
  descripcion: string
  validado: boolean
  registrado_por: string
  created_at: string
}

export function ModalNovedadesEntregador({ 
  order, 
  planillaId,
  onClose, 
  onNovedadCreada 
}: ModalNovedadesEntregadorProps) {
  const { toast } = useToast()
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [showNuevaForm, setShowNuevaForm] = useState(false)
  const [nuevaNovedad, setNuevaNovedad] = useState({
    tipo: "",
    monto: "",
    descripcion: "",
    montoPagado: "",
  })

  useEffect(() => {
    loadNovedades()
  }, [order.id])

  async function loadNovedades() {
    try {
      const response = await fetch(`/api/novedades?pedidoId=${order.id}`)
      if (!response.ok) throw new Error("Error al cargar novedades")
      const data = await response.json()
      setNovedades(data.novedades || [])
    } catch (error) {
      console.error("Error cargando novedades:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCrearNovedad() {
    if (!nuevaNovedad.tipo || !nuevaNovedad.monto) {
      toast({ title: "Error", description: "Debes seleccionar tipo y monto", variant: "destructive" })
      return
    }

    const monto = Number(nuevaNovedad.monto)
    if (monto <= 0) {
      toast({ title: "Error", description: "El monto debe ser mayor a 0", variant: "destructive" })
      return
    }

    if (nuevaNovedad.tipo === "fiado_parcial") {
      const montoPagado = Number(nuevaNovedad.montoPagado || 0)
      if (montoPagado < 0 || montoPagado > monto) {
        toast({
          title: "Error",
          description: `El monto pagado debe estar entre $0 y ${formatCOP(monto)}`,
          variant: "destructive",
        })
        return
      }
    }

    try {
      setSubmitting(true)

      const response = await fetch("/api/novedades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pedidoId: order.id,
          tipoNovedad: nuevaNovedad.tipo,
          montoNovedad: monto,
          descripcion: nuevaNovedad.descripcion || null,
          montoPagado: nuevaNovedad.tipo === "fiado_parcial" ? Number(nuevaNovedad.montoPagado || 0) : 0,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Error al crear novedad")

      toast({ title: "Novedad Registrada", description: "La novedad fue creada exitosamente" })

      setNuevaNovedad({ tipo: "", monto: "", descripcion: "", montoPagado: "" })
      setShowNuevaForm(false)
      await loadNovedades()
      onNovedadCreada()
    } catch (error) {
      console.error("Error creando novedad:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo crear la novedad",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEliminarNovedad(novedadId: string) {
    if (!confirm("¿Eliminar esta novedad?")) return

    try {
      const response = await fetch(`/api/novedades/${novedadId}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Error al eliminar")

      toast({ title: "Eliminada", description: "Novedad eliminada correctamente" })
      await loadNovedades()
      onNovedadCreada()
    } catch (error) {
      toast({ title: "Error", description: "No se pudo eliminar la novedad", variant: "destructive" })
    }
  }

  const getTipoLabel = (tipo: string) => {
    switch (tipo) {
      case "agotado": return "Agotado"
      case "devolucion": return "Devolución"
      case "fiado_parcial": return "Fiado Parcial"
      case "error_facturacion": return "Error Facturación"
      default: return tipo
    }
  }

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case "agotado": return "bg-gray-100 text-gray-700 border-gray-300"
      case "devolucion": return "bg-red-100 text-red-700 border-red-300"
      case "fiado_parcial": return "bg-orange-100 text-orange-700 border-orange-300"
      case "error_facturacion": return "bg-yellow-100 text-yellow-700 border-yellow-300"
      default: return "bg-gray-100"
    }
  }

  const totalNovedades = novedades.reduce((sum, n) => sum + Number(n.monto_novedad), 0)
  const totalOriginal = order.total
  const totalEfectivo = totalOriginal - totalNovedades

  // ── Overlay manual — sin Dialog de shadcn para evitar error insertBefore en móvil ──
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full mx-4 overflow-y-auto"
        style={{ maxWidth: "672px", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold">{order.cliente} — Gestionar Novedades</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded">
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Original</p>
              <p className="font-bold">{formatCOP(totalOriginal)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Novedades</p>
              <p className="font-bold text-red-600">-{formatCOP(totalNovedades)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">A Cobrar</p>
              <p className="font-bold text-green-600">{formatCOP(totalEfectivo)}</p>
            </div>
          </div>

          {/* Lista de novedades */}
          {loading ? (
            <p className="text-center text-gray-500 py-4">Cargando...</p>
          ) : novedades.length === 0 ? (
            <div className="text-center py-6 bg-blue-50 rounded border border-blue-200">
              <AlertCircle className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <p className="text-sm text-blue-700">No hay novedades registradas</p>
              <p className="text-xs text-blue-600">Agrega una si hubo algún problema en la entrega</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium">Novedades registradas:</p>
              {novedades.map((novedad) => (
                <Card key={novedad.id} className="p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={getTipoColor(novedad.tipo_novedad)}>
                          {getTipoLabel(novedad.tipo_novedad)}
                        </Badge>
                        {novedad.validado && (
                          <Badge className="bg-green-100 text-green-700 border-green-300">
                            ✓ Validado
                          </Badge>
                        )}
                      </div>
                      <p className="font-bold text-lg">{formatCOP(novedad.monto_novedad)}</p>
                      {novedad.tipo_novedad === "fiado_parcial" && novedad.monto_pagado && (
                        <p className="text-sm text-green-600">
                          Pagó: {formatCOP(novedad.monto_pagado)} | Debe: {formatCOP(novedad.monto_novedad - novedad.monto_pagado)}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">{novedad.descripcion || "Sin descripción"}</p>
                    </div>
                    {!novedad.validado && (
                      <Button variant="ghost" size="sm" onClick={() => handleEliminarNovedad(novedad.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Formulario nueva novedad */}
          {showNuevaForm ? (
            <Card className="p-4 bg-blue-50 border-blue-200">
              <p className="font-medium mb-3">➕ Agregar Nueva Novedad</p>
              <div className="space-y-3">
                <div>
                  <Label>Tipo de Novedad</Label>
                  <Select
                    value={nuevaNovedad.tipo}
                    onValueChange={(v) => setNuevaNovedad({ ...nuevaNovedad, tipo: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agotado">⚫ Agotado</SelectItem>
                      <SelectItem value="devolucion">🔴 Devolución</SelectItem>
                      <SelectItem value="fiado_parcial">🟠 Fiado Parcial</SelectItem>
                      <SelectItem value="error_facturacion">🟡 Error Facturación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Monto Afectado</Label>
                  <Input
                    type="number"
                    value={nuevaNovedad.monto}
                    onChange={(e) => setNuevaNovedad({ ...nuevaNovedad, monto: e.target.value })}
                    placeholder="0"
                  />
                </div>

                {nuevaNovedad.tipo === "fiado_parcial" && (
                  <div>
                    <Label>¿Cuánto pagó el cliente?</Label>
                    <Input
                      type="number"
                      value={nuevaNovedad.montoPagado}
                      onChange={(e) => setNuevaNovedad({ ...nuevaNovedad, montoPagado: e.target.value })}
                      placeholder="0"
                    />
                    {nuevaNovedad.monto && nuevaNovedad.montoPagado && (
                      <p className="text-xs text-orange-600 mt-1">
                        Saldo pendiente: {formatCOP(Number(nuevaNovedad.monto) - Number(nuevaNovedad.montoPagado))}
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <Label>Motivo / Descripción</Label>
                  <Textarea
                    value={nuevaNovedad.descripcion}
                    onChange={(e) => setNuevaNovedad({ ...nuevaNovedad, descripcion: e.target.value })}
                    placeholder="Ej: Productos incompletos, color equivocado..."
                    rows={2}
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleCrearNovedad} disabled={submitting} className="flex-1">
                    {submitting ? "Guardando..." : "Guardar Novedad"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowNuevaForm(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Button onClick={() => setShowNuevaForm(true)} variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Agregar Nueva Novedad
            </Button>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t sticky bottom-0 bg-white">
          <Button onClick={onClose} className="w-full">Cerrar</Button>
        </div>
      </div>
    </div>
  )
}
