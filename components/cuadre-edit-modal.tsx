"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { AlertCircle, Edit2, Loader2, Save } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"

interface CuadreEditModalProps {
  cuadreId: number
  onClose: () => void
  onSuccess: () => void
}

export function CuadreEditModal({ cuadreId, onClose, onSuccess }: CuadreEditModalProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Datos del cuadre
  const [cuadre, setCuadre] = useState<any>(null)
  
  // Campos editables
  const [efectivoRecibido, setEfectivoRecibido] = useState<number>(0)
  const [tieneConsignacion, setTieneConsignacion] = useState(false)
  const [montoConsignacion, setMontoConsignacion] = useState<number>(0)
  const [numeroConsignacion, setNumeroConsignacion] = useState("")
  const [banco, setBanco] = useState("")
  const [descuento, setDescuento] = useState<number>(0)
  const [motivoDescuento, setMotivoDescuento] = useState("")
  const [agotados, setAgotados] = useState<number>(0)
  const [fiado, setFiado] = useState<number>(0)
  const [devoluciones, setDevoluciones] = useState<number>(0)
  const [repasos, setRepasos] = useState<number>(0)
  const [erroresFacturacion, setErroresFacturacion] = useState<number>(0)
  const [observaciones, setObservaciones] = useState("")

  // Cargar datos del cuadre
  useEffect(() => {
    loadCuadre()
  }, [cuadreId])

  async function loadCuadre() {
    try {
      setLoading(true)
      const response = await fetch(`/api/cuadres-caja/${cuadreId}`)
      
      if (!response.ok) {
        throw new Error('Error al cargar cuadre')
      }

      const data = await response.json()
      const c = data.cuadre

      setCuadre(c)
      setEfectivoRecibido(Number(c.total_efectivo) || 0)
      setTieneConsignacion(c.tiene_consignacion || false)
      setMontoConsignacion(Number(c.total_consignado) || 0)
      setNumeroConsignacion(c.numero_consignacion || "")
      setBanco(c.banco || "")
      setDescuento(Number(c.descuento) || 0)
      setMotivoDescuento(c.motivo_descuento || "")
      setAgotados(Number(c.agotados) || 0)
      setFiado(Number(c.fiado) || 0)
      setDevoluciones(Number(c.devoluciones) || 0)
      setRepasos(Number(c.repasos) || 0)
      setErroresFacturacion(Number(c.errores_facturacion) || 0)
      setObservaciones(c.observaciones || "")

    } catch (err) {
      console.error('Error loading cuadre:', err)
      setError('Error al cargar el cuadre')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    try {
      setSaving(true)
      setError(null)

      const response = await fetch(`/api/cuadres-caja/${cuadreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          efectivoRecibido,
          tieneConsignacion,
          montoConsignacion: tieneConsignacion ? montoConsignacion : 0,
          numeroConsignacion: tieneConsignacion ? numeroConsignacion : null,
          banco: tieneConsignacion ? banco : null,
          descuento,
          motivoDescuento: descuento > 0 ? motivoDescuento : null,
          agotados,
          fiado,
          devoluciones,
          repasos,
          erroresFacturacion,
          observaciones
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al guardar')
      }

      const data = await response.json()
      
      // Mostrar mensaje de éxito
      alert(data.mensaje || '✅ Cuadre actualizado')
      
      onSuccess()
      onClose()

    } catch (err) {
      console.error('Error saving cuadre:', err)
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  // Calcular diferencia en tiempo real
  const totalRecibido = efectivoRecibido + (tieneConsignacion ? montoConsignacion : 0)
  const diferencia = cuadre ? Math.round((totalRecibido - Number(cuadre.total_esperado)) * 100) / 100 : 0

  if (loading) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  if (!cuadre) {
    return null
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="h-5 w-5" />
            Editar Cuadre de Caja
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Info del cuadre */}
          <div className="bg-muted p-4 rounded-lg space-y-1">
            <p className="text-sm font-medium">Entregador: {cuadre.entregador}</p>
            <p className="text-sm text-muted-foreground">
              Fecha: {new Date(cuadre.fecha_cuadre).toLocaleDateString()}
            </p>
            <p className="text-sm text-muted-foreground">
              Rutas: {cuadre.rutas_nombres?.join(', ') || 'N/A'}
            </p>
            <p className="text-sm font-medium mt-2">
              Total esperado: {formatCOP(cuadre.total_esperado)}
            </p>
          </div>

          {/* Efectivo recibido */}
          <div>
            <Label htmlFor="efectivo">Efectivo Recibido *</Label>
            <Input
              id="efectivo"
              type="number"
              value={efectivoRecibido}
              onChange={(e) => setEfectivoRecibido(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </div>

          {/* Consignación */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="consignacion"
                checked={tieneConsignacion}
                onCheckedChange={(checked) => setTieneConsignacion(checked as boolean)}
              />
              <Label htmlFor="consignacion" className="cursor-pointer">
                Tiene consignación
              </Label>
            </div>

            {tieneConsignacion && (
              <div className="grid grid-cols-3 gap-3 pl-6">
                <div>
                  <Label htmlFor="monto-consig">Monto</Label>
                  <Input
                    id="monto-consig"
                    type="number"
                    value={montoConsignacion}
                    onChange={(e) => setMontoConsignacion(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="numero-consig">Número</Label>
                  <Input
                    id="numero-consig"
                    value={numeroConsignacion}
                    onChange={(e) => setNumeroConsignacion(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="banco">Banco</Label>
                  <Input
                    id="banco"
                    value={banco}
                    onChange={(e) => setBanco(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Novedades */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="descuento">Descuento</Label>
              <Input
                id="descuento"
                type="number"
                value={descuento}
                onChange={(e) => setDescuento(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="agotados">Agotados</Label>
              <Input
                id="agotados"
                type="number"
                value={agotados}
                onChange={(e) => setAgotados(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="fiado">Fiado</Label>
              <Input
                id="fiado"
                type="number"
                value={fiado}
                onChange={(e) => setFiado(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="devoluciones">Devoluciones</Label>
              <Input
                id="devoluciones"
                type="number"
                value={devoluciones}
                onChange={(e) => setDevoluciones(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="repasos">Repasos</Label>
              <Input
                id="repasos"
                type="number"
                value={repasos}
                onChange={(e) => setRepasos(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="errores">Errores Facturación</Label>
              <Input
                id="errores"
                type="number"
                value={erroresFacturacion}
                onChange={(e) => setErroresFacturacion(Number(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Motivo descuento */}
          {descuento > 0 && (
            <div>
              <Label htmlFor="motivo">Motivo del descuento</Label>
              <Input
                id="motivo"
                value={motivoDescuento}
                onChange={(e) => setMotivoDescuento(e.target.value)}
                placeholder="Explica por qué hay descuento"
              />
            </div>
          )}

          {/* Observaciones */}
          <div>
            <Label htmlFor="obs">Observaciones</Label>
            <Textarea
              id="obs"
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Notas adicionales..."
              rows={3}
            />
          </div>

          {/* Resumen */}
          <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span>Total recibido:</span>
              <span className="font-medium">{formatCOP(totalRecibido)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Total esperado:</span>
              <span className="font-medium">{formatCOP(cuadre.total_esperado)}</span>
            </div>
            <div className={`flex justify-between font-bold ${diferencia === 0 ? 'text-green-600' : 'text-red-600'}`}>
              <span>Diferencia:</span>
              <span>{formatCOP(diferencia)}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
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
              <>
                <Save className="h-4 w-4 mr-2" />
                Guardar Cambios
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
