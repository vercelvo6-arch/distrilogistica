"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, CheckCircle, AlertTriangle, XCircle } from "lucide-react"

export interface Faltante {
  id: number
  codigo: string
  descripcion: string
  categoria: string
  cantidad_faltante: number
  cantidad_resuelta?: number
  entregador: string
  ruta: string
  estado: string
  tipo_resolucion?: string
  observaciones?: string
}

interface SubsanarModalProps {
  faltante: Faltante | null
  onClose: () => void
  onSubmit: (data: SubsanacionData) => Promise<void>
}

export interface SubsanacionData {
  faltanteId: number
  tipoResolucion: 'completo' | 'parcial' | 'definitivo'
  cantidadResuelta?: number
  observaciones_resolucion: string
}

export function SubsanarFaltantesModal({ faltante, onClose, onSubmit }: SubsanarModalProps) {
  const [tipoResolucion, setTipoResolucion] = useState<'completo' | 'parcial' | 'definitivo'>('completo')
  const [cantidadResuelta, setCantidadResuelta] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!faltante) return null

  const handleTipoChange = (value: string) => {
    setTipoResolucion(value as 'completo' | 'parcial' | 'definitivo')
    setError(null)
    
    if (value === 'completo') {
      setCantidadResuelta(faltante.cantidad_faltante.toString())
    } else if (value === 'definitivo') {
      setCantidadResuelta('0')
    } else {
      setCantidadResuelta('')
    }
  }

  const handleSubmit = async () => {
    if (!observaciones.trim()) {
      setError('Las observaciones son obligatorias')
      return
    }

    if (tipoResolucion === 'parcial') {
      const cantidad = Number(cantidadResuelta)
      
      if (!cantidadResuelta || isNaN(cantidad) || cantidad <= 0) {
        setError('Debe especificar una cantidad válida mayor a 0')
        return
      }

      if (cantidad > faltante.cantidad_faltante) {
        setError(`La cantidad no puede ser mayor al faltante (máx: ${faltante.cantidad_faltante})`)
        return
      }

      if (cantidad === faltante.cantidad_faltante) {
        setError('Si consiguió todo, seleccione "Resuelto Completo"')
        return
      }
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const data: SubsanacionData = {
        faltanteId: faltante.id,
        tipoResolucion,
        observaciones_resolucion: observaciones.trim()
      }

      if (tipoResolucion === 'parcial') {
        data.cantidadResuelta = Number(cantidadResuelta)
      }

      await onSubmit(data)

      setTipoResolucion('completo')
      setCantidadResuelta('')
      setObservaciones('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subsanar faltante')
    } finally {
      setIsSubmitting(false)
    }
  }

  const cantidadPendiente = tipoResolucion === 'parcial' && cantidadResuelta
    ? faltante.cantidad_faltante - Number(cantidadResuelta)
    : 0

  return (
    <Dialog open={!!faltante} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Subsanar Faltante</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="font-medium text-blue-900">Producto:</p>
                <p className="text-blue-700">{faltante.descripcion}</p>
                <p className="text-xs font-mono text-blue-600 mt-1">{faltante.codigo}</p>
              </div>
              <div>
                <p className="font-medium text-blue-900">Entregador / Ruta:</p>
                <p className="text-blue-700">{faltante.entregador} / Ruta {faltante.ruta}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-300">
              <p className="text-sm">
                <span className="font-semibold text-blue-900">Cantidad faltante: </span>
                <span className="text-xl font-bold text-red-600">{faltante.cantidad_faltante}</span> unidades
              </p>
            </div>
          </div>

          <div>
            <Label className="text-base font-semibold mb-3 block">
              ¿Cómo se va a resolver este faltante?
            </Label>
            <RadioGroup value={tipoResolucion} onValueChange={handleTipoChange}>
              <div className="flex items-start space-x-3 p-4 rounded-lg border-2 hover:bg-green-50 cursor-pointer transition-colors border-green-200 bg-green-50/50">
                <RadioGroupItem value="completo" id="completo" className="mt-1" />
                <Label htmlFor="completo" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="font-semibold text-green-900">Resuelto Completo</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Se consiguieron las <strong>{faltante.cantidad_faltante} unidades</strong> completas.
                  </p>
                </Label>
              </div>

              <div className="flex items-start space-x-3 p-4 rounded-lg border-2 hover:bg-yellow-50 cursor-pointer transition-colors border-yellow-200 bg-yellow-50/50">
                <RadioGroupItem value="parcial" id="parcial" className="mt-1" />
                <Label htmlFor="parcial" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <span className="font-semibold text-yellow-900">Resuelto Parcial</span>
                  </div>
                  <p className="text-sm text-yellow-700">
                    Se consiguieron <strong>algunas unidades</strong>, pero no todas.
                  </p>
                </Label>
              </div>

              <div className="flex items-start space-x-3 p-4 rounded-lg border-2 hover:bg-red-50 cursor-pointer transition-colors border-red-200 bg-red-50/50">
                <RadioGroupItem value="definitivo" id="definitivo" className="mt-1" />
                <Label htmlFor="definitivo" className="cursor-pointer flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="font-semibold text-red-900">No Hay Producto</span>
                  </div>
                  <p className="text-sm text-red-700">
                    <strong>No se pudo conseguir el producto</strong>.
                  </p>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {tipoResolucion === 'parcial' && (
            <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
              <Label className="text-sm font-medium mb-2 block text-yellow-900">
                ¿Cuántas unidades se consiguieron?
              </Label>
              <Input
                type="number"
                min="1"
                max={faltante.cantidad_faltante - 1}
                value={cantidadResuelta}
                onChange={(e) => setCantidadResuelta(e.target.value)}
                className="text-lg font-bold border-yellow-300"
                disabled={isSubmitting}
              />
              {cantidadPendiente > 0 && (
                <p className="text-sm mt-2 text-yellow-700">
                  ✓ Se resolverán: <strong>{cantidadResuelta} unidades</strong>
                  <br />
                  ⏳ Quedarán pendientes: <strong className="text-red-600">{cantidadPendiente} unidades</strong>
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="text-sm font-medium mb-2 block">
              Observaciones <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Explique cómo se resolvió o por qué no se pudo resolver"
              className="min-h-[100px]"
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={
              tipoResolucion === 'completo' ? 'bg-green-600 hover:bg-green-700' :
              tipoResolucion === 'parcial' ? 'bg-yellow-600 hover:bg-yellow-700' :
              'bg-red-600 hover:bg-red-700'
            }
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              'Confirmar Subsanación'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
