"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { formatCOP } from "@/lib/format-utils"
import { Loader2 } from "lucide-react"

interface CuadreEditModalProps {
  cuadreId: number
  onClose: () => void
  onSuccess: () => void
}

export function CuadreEditModal({ cuadreId, onClose, onSuccess }: CuadreEditModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cuadre, setCuadre] = useState<any>(null)
  
  const [formData, setFormData] = useState({
    efectivoRecibido: "",
    montoConsignacion: "",
    tieneConsignacion: false,
    numeroConsignacion: "",
    banco: "",
    observaciones: "",
    descuento: "",
    motivoDescuento: "",
    agotados: "",
    fiado: "",
    devoluciones: "",
    repasos: "",
    erroresFacturacion: "",
  })

  useEffect(() => {
    if (cuadreId) {
      loadCuadre()
    }
  }, [cuadreId])

  const loadCuadre = async () => {
    try {
      setLoading(true)
      
      console.log('[CUADRE EDIT MODAL] Cargando cuadre ID:', cuadreId)
      
      const response = await fetch(`/api/cuadres-caja/${cuadreId}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al cargar cuadre')
      }
      
      const data = await response.json()
      
      console.log('[CUADRE EDIT MODAL] Cuadre cargado:', data.cuadre)
      
      setCuadre(data.cuadre)
      
      // Pre-cargar datos en el formulario
      setFormData({
        efectivoRecibido: data.cuadre.total_efectivo?.toString() || "",
        montoConsignacion: data.cuadre.total_consignado?.toString() || "",
        tieneConsignacion: data.cuadre.tiene_consignacion || false,
        numeroConsignacion: data.cuadre.numero_consignacion || "",
        banco: data.cuadre.banco || "",
        observaciones: data.cuadre.observaciones || "",
        descuento: data.cuadre.descuento?.toString() || "",
        motivoDescuento: data.cuadre.motivo_descuento || "",
        agotados: data.cuadre.agotados?.toString() || "",
        fiado: data.cuadre.fiado?.toString() || "",
        devoluciones: data.cuadre.devoluciones?.toString() || "",
        repasos: data.cuadre.repasos?.toString() || "",
        erroresFacturacion: data.cuadre.errores_facturacion?.toString() || "",
      })
      
    } catch (error) {
      console.error('[CUADRE EDIT MODAL] Error:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo cargar el cuadre",
        variant: "destructive"
      })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      
      const payload = {
        efectivoRecibido: Number(formData.efectivoRecibido) || 0,
        montoConsignacion: Number(formData.montoConsignacion) || 0,
        tieneConsignacion: formData.tieneConsignacion,
        numeroConsignacion: formData.numeroConsignacion || null,
        banco: formData.banco || null,
        observaciones: formData.observaciones || null,
        descuento: Number(formData.descuento) || 0,
        motivoDescuento: formData.motivoDescuento || null,
        agotados: Number(formData.agotados) || 0,
        fiado: Number(formData.fiado) || 0,
        devoluciones: Number(formData.devoluciones) || 0,
        repasos: Number(formData.repasos) || 0,
        erroresFacturacion: Number(formData.erroresFacturacion) || 0,
      }
      
      console.log('[CUADRE EDIT MODAL] Guardando cambios:', payload)
      
      const response = await fetch(`/api/cuadres-caja/${cuadreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al guardar cambios')
      }
      
      const data = await response.json()
      
      toast({
        title: "✅ Cambios Guardados",
        description: data.mensaje || "El cuadre ha sido actualizado correctamente"
      })
      
      onSuccess()
      
    } catch (error) {
      console.error('[CUADRE EDIT MODAL] Error al guardar:', error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudieron guardar los cambios",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!cuadre) return null

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cuadre de Caja</DialogTitle>
          <DialogDescription>
            Cuadre ID: {cuadreId} - {cuadre.entregador}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Información del cuadre */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-900">
              <strong>Fecha:</strong> {new Date(cuadre.fecha_cuadre).toLocaleDateString('es-CO')}
            </p>
            <p className="text-sm text-blue-900">
              <strong>Total Esperado:</strong> {formatCOP(cuadre.total_esperado)}
            </p>
          </div>

          {/* Novedades */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-semibold text-sm mb-3">📊 Novedades</h3>
            
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Fiados</Label>
                <Input
                  type="number"
                  value={formData.fiado}
                  onChange={(e) => setFormData({ ...formData, fiado: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Repasos</Label>
                <Input
                  type="number"
                  value={formData.repasos}
                  onChange={(e) => setFormData({ ...formData, repasos: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Devoluciones</Label>
                <Input
                  type="number"
                  value={formData.devoluciones}
                  onChange={(e) => setFormData({ ...formData, devoluciones: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Agotados</Label>
                <Input
                  type="number"
                  value={formData.agotados}
                  onChange={(e) => setFormData({ ...formData, agotados: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Errores Facturación</Label>
                <Input
                  type="number"
                  value={formData.erroresFacturacion}
                  onChange={(e) => setFormData({ ...formData, erroresFacturacion: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Descuentos</Label>
                <Input
                  type="number"
                  value={formData.descuento}
                  onChange={(e) => setFormData({ ...formData, descuento: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          {/* Efectivo */}
          <div>
            <Label>💵 Efectivo Recibido</Label>
            <Input
              type="number"
              value={formData.efectivoRecibido}
              onChange={(e) => setFormData({ ...formData, efectivoRecibido: e.target.value })}
              className="mt-1 font-bold text-lg"
            />
          </div>

          {/* Consignación */}
          <div className="flex items-center gap-2">
            <Checkbox
              checked={formData.tieneConsignacion}
              onCheckedChange={(checked) => setFormData({ ...formData, tieneConsignacion: !!checked })}
            />
            <Label>¿Tiene consignación?</Label>
          </div>

          {formData.tieneConsignacion && (
            <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-gray-50">
              <div>
                <Label className="text-xs">Número Consignación</Label>
                <Input
                  value={formData.numeroConsignacion}
                  onChange={(e) => setFormData({ ...formData, numeroConsignacion: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs">Banco</Label>
                <Input
                  value={formData.banco}
                  onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                  className="mt-1"
                />
              </div>

              <div className="col-span-2">
                <Label className="text-xs">Monto Consignación</Label>
                <Input
                  type="number"
                  value={formData.montoConsignacion}
                  onChange={(e) => setFormData({ ...formData, montoConsignacion: e.target.value })}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Observaciones */}
          <div>
            <Label>Observaciones</Label>
            <Textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Resumen */}
          <div className="border-t pt-4 bg-emerald-50 rounded-lg p-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Diferencia:</span>
              {(() => {
                const totalRecibido = Number(formData.efectivoRecibido) + Number(formData.montoConsignacion)
                const diferencia = totalRecibido - cuadre.total_esperado
                return (
                  <span className={`font-bold text-lg ${diferencia === 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {diferencia > 0 ? '+' : ''}{formatCOP(diferencia)}
                  </span>
                )
              })()}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar Cambios"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
