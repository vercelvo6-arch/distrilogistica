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

  const [consignaciones, setConsignaciones] = useState<Array<{id: string; banco: string; numero: string; monto: string; fecha: string}>>([])

  const [formData, setFormData] = useState({
    efectivoRecibido:   "",
    montoConsignacion:  "",
    tieneConsignacion:  false,
    numeroConsignacion: "",
    banco:              "",
    observaciones:      "",
    descuento:          "",
    motivoDescuento:    "",
    agotados:           "",
    fiado:              "",
    devoluciones:       "",
    repasos:            "",
    erroresFacturacion: "",
    cobrosEfectivo:     "",
    cobrosNequi:        "",
  })

  useEffect(() => { if (cuadreId) loadCuadre() }, [cuadreId])

  const loadCuadre = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/cuadres-caja/${cuadreId}`)
      if (!response.ok) throw new Error((await response.json()).error || 'Error al cargar cuadre')
      const data = await response.json()
      setCuadre(data.cuadre)

      // ✅ El efectivo recibido se precarga SOLO desde billetes + monedas — nunca
      // desde total_efectivo, porque esa columna ya trae sumadas las consignaciones
      // (y el Nequi recibido). Sumarlas de nuevo en calcularRecibido() duplicaba el monto.
      // Fallback para cuadres antiguos (creados por el flujo individual, que nunca
      // guardó billetes/monedas por separado): billetes y monedas llegan null en ese
      // caso, así que se deriva restando las consignaciones del total_efectivo guardado.
      const billetesRaw = data.cuadre.billetes
      const monedasRaw  = data.cuadre.monedas
      const tieneDesglose = (billetesRaw !== null && billetesRaw !== undefined)
        || (monedasRaw !== null && monedasRaw !== undefined)
      const efectivoInicial = tieneDesglose
        ? (Number(billetesRaw) || 0) + (Number(monedasRaw) || 0)
        : (Number(data.cuadre.total_efectivo) || 0) - (Number(data.cuadre.total_consignado) || 0)

      setFormData({
        efectivoRecibido:   efectivoInicial.toString(),
        montoConsignacion:  data.cuadre.total_consignado?.toString()     || "0",
        tieneConsignacion:  data.cuadre.tiene_consignacion               || false,
        numeroConsignacion: data.cuadre.numero_consignacion              || "",
        banco:              data.cuadre.banco                            || "",
        observaciones:      data.cuadre.observaciones                   || "",
        descuento:          data.cuadre.descuento?.toString()            || "0",
        motivoDescuento:    data.cuadre.motivo_descuento                 || "",
        agotados:           data.cuadre.agotados?.toString()             || "0",
        fiado:              data.cuadre.fiado?.toString()                || "0",
        devoluciones:       data.cuadre.devoluciones?.toString()         || "0",
        repasos:            data.cuadre.repasos?.toString()              || "0",
        erroresFacturacion: data.cuadre.errores_facturacion?.toString()  || "0",
        cobrosEfectivo:     data.cuadre.cobros_efectivo?.toString()      || "0",
        cobrosNequi:        data.cuadre.cobros_nequi?.toString()         || "0",
      })
      // Cargar consignaciones múltiples
      const cons = data.cuadre.consignaciones
      if (Array.isArray(cons) && cons.length > 0) {
        setConsignaciones(cons.map((c: any, i: number) => ({
          id: String(i),
          banco: c.banco || "",
          numero: c.numero || "",
          monto: String(c.monto || ""),
          fecha: c.fecha || new Date().toISOString().split("T")[0],
        })))
      } else if (data.cuadre.tiene_consignacion && data.cuadre.total_consignado > 0) {
        // Fallback: una sola consignación del campo legacy
        setConsignaciones([{
          id: "0",
          banco: data.cuadre.banco || "",
          numero: data.cuadre.numero_consignacion || "",
          monto: String(data.cuadre.total_consignado || ""),
          fecha: new Date().toISOString().split("T")[0],
        }])
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Error", variant: "destructive" })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  // ── Recalcular esperado dinámicamente ──────────────────────────────────────
  const calcularEsperado = () => {
    const cargue      = Number(cuadre?.total_cargue) || 0
    const fiado       = Number(formData.fiado)              || 0
    const devoluciones= Number(formData.devoluciones)       || 0
    const agotados    = Number(formData.agotados)           || 0
    const repasos     = Number(formData.repasos)            || 0
    const errores     = Number(formData.erroresFacturacion) || 0
    const descuento   = Number(formData.descuento)          || 0
    const cobrosEfec  = Number(formData.cobrosEfectivo)     || 0
    return cargue - fiado - devoluciones - agotados - repasos - errores - descuento + cobrosEfec
  }

  const calcularRecibido = () => {
    const totalConsig = consignaciones.reduce((s, c) => s + (Number(c.monto) || 0), 0)
    return (Number(formData.efectivoRecibido) || 0) + totalConsig
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const esperado   = calcularEsperado()
      const recibido   = calcularRecibido()
      const diferencia = recibido - esperado

      const payload = {
        efectivoRecibido:   Number(formData.efectivoRecibido)   || 0,
        montoConsignacion:  Number(formData.montoConsignacion)  || 0,
        tieneConsignacion:  formData.tieneConsignacion,
        numeroConsignacion: formData.numeroConsignacion         || null,
        banco:              formData.banco                      || null,
        observaciones:      formData.observaciones              || null,
        descuento:          Number(formData.descuento)          || 0,
        motivoDescuento:    formData.motivoDescuento            || null,
        agotados:           Number(formData.agotados)           || 0,
        fiado:              Number(formData.fiado)              || 0,
        devoluciones:       Number(formData.devoluciones)       || 0,
        repasos:            Number(formData.repasos)            || 0,
        erroresFacturacion: Number(formData.erroresFacturacion) || 0,
        cobrosEfectivo:        Number(formData.cobrosEfectivo) || 0,
        cobrosNequi:           Number(formData.cobrosNequi)     || 0,
        consignacionesDetalle: consignaciones.map(c => ({
          banco: c.banco, numero: c.numero, monto: Number(c.monto) || 0, fecha: c.fecha
        })),
        totalEsperado:      esperado,
        totalEfectivo:      recibido,
        diferencia,
        estado:             diferencia === 0 ? 'cuadrado' : 'con_diferencia',
      }

      const response = await fetch(`/api/cuadres-caja/${cuadreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) throw new Error((await response.json()).error || 'Error al guardar')
      const data = await response.json()
      toast({ title: "✅ Cuadre actualizado", description: data.mensaje || "Cambios guardados" })
      onSuccess()
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Error", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, key: keyof typeof formData, color?: string) => (
    <div>
      <Label className={`text-xs ${color || ''}`}>{label}</Label>
      <Input
        type="number"
        value={formData[key] as string}
        onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
        className="mt-1"
      />
    </div>
  )

  if (loading) return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </DialogContent>
    </Dialog>
  )

  if (!cuadre) return null

  const esperado   = calcularEsperado()
  const recibido   = calcularRecibido()
  const diferencia = recibido - esperado

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Cuadre de Caja</DialogTitle>
          <DialogDescription>
            {cuadre.entregador} — {new Date(cuadre.fecha_cuadre).toLocaleDateString('es-CO')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          {/* Info */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-blue-600 font-medium">Cargue:</span> <span className="font-bold">{formatCOP(cuadre.total_cargue)}</span></div>
            <div><span className="text-blue-600 font-medium">Rutas:</span> <span>{Array.isArray(cuadre.rutas_nombres) ? cuadre.rutas_nombres.join(', ') : '—'}</span></div>
          </div>

          {/* Novedades */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h3 className="font-semibold text-sm mb-3">📊 Novedades (restan del esperado)</h3>
            <div className="grid grid-cols-3 gap-3">
              {field("Fiados", "fiado", "text-orange-600")}
              {field("Devoluciones", "devoluciones", "text-red-600")}
              {field("Agotados", "agotados", "text-gray-600")}
              {field("Repasos", "repasos", "text-blue-600")}
              {field("Errores Facturación", "erroresFacturacion", "text-yellow-700")}
              {field("Descuentos", "descuento", "text-purple-600")}
            </div>
          </div>

          {/* Cobros CxC */}
          <div className="border rounded-lg p-4 bg-purple-50">
            <h3 className="font-semibold text-sm mb-3">💳 Cobros CxC (suman al esperado)</h3>
            <div className="grid grid-cols-2 gap-3">
              {field("Cobros Efectivo", "cobrosEfectivo", "text-purple-700")}
              {field("Cobros Nequi", "cobrosNequi", "text-purple-700")}
            </div>
          </div>

          {/* Efectivo recibido */}
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold text-sm mb-3">💵 Efectivo Recibido</h3>
            {field("Efectivo (billetes + monedas)", "efectivoRecibido")}
          </div>

          {/* Consignaciones múltiples */}
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">💳 Consignaciones / Nequi</h3>
              <Button size="sm" variant="outline" type="button"
                onClick={() => setConsignaciones(prev => [...prev, {
                  id: crypto.randomUUID(), banco: "", numero: "", monto: "",
                  fecha: new Date().toISOString().split("T")[0]
                }])}>
                + Agregar
              </Button>
            </div>
            {consignaciones.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Sin consignaciones</p>
            ) : consignaciones.map((cons, idx) => (
              <div key={cons.id} className="grid grid-cols-4 gap-2 mb-2 items-end">
                <div>
                  <Label className="text-xs">Banco</Label>
                  <Input value={cons.banco} placeholder="Nequi, Bancolombia..."
                    onChange={(e) => setConsignaciones(prev => prev.map(c => c.id === cons.id ? { ...c, banco: e.target.value } : c))}
                    className="mt-1 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Número</Label>
                  <Input value={cons.numero} placeholder="Referencia"
                    onChange={(e) => setConsignaciones(prev => prev.map(c => c.id === cons.id ? { ...c, numero: e.target.value } : c))}
                    className="mt-1 h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Monto</Label>
                  <Input type="number" value={cons.monto} placeholder="0"
                    onChange={(e) => setConsignaciones(prev => prev.map(c => c.id === cons.id ? { ...c, monto: e.target.value } : c))}
                    className="mt-1 h-8 text-xs" />
                </div>
                <Button size="sm" variant="ghost" type="button" className="text-red-500 h-8"
                  onClick={() => setConsignaciones(prev => prev.filter(c => c.id !== cons.id))}>
                  ✕
                </Button>
              </div>
            ))}
            {consignaciones.length > 0 && (
              <div className="text-right text-sm font-semibold text-gray-700 mt-2 pt-2 border-t">
                Total consignado: {formatCOP(consignaciones.reduce((s, c) => s + (Number(c.monto) || 0), 0))}
              </div>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <Label className="text-sm font-medium">Observaciones</Label>
            <Textarea value={formData.observaciones}
              onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
              className="mt-1" rows={2} />
          </div>

          {/* Resumen dinámico */}
          <div className="border-t pt-4 rounded-lg bg-gray-50 p-3 space-y-2">
            <p className="text-sm font-semibold text-gray-700">Resumen recalculado:</p>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="text-center p-2 bg-blue-50 rounded">
                <p className="text-xs text-blue-600">Cargue</p>
                <p className="font-bold text-blue-700">{formatCOP(cuadre.total_cargue)}</p>
              </div>
              <div className="text-center p-2 bg-emerald-50 rounded">
                <p className="text-xs text-emerald-600">Esperado</p>
                <p className="font-bold text-emerald-700">{formatCOP(esperado)}</p>
              </div>
              <div className="text-center p-2 bg-gray-100 rounded">
                <p className="text-xs text-gray-600">Recibido</p>
                <p className="font-bold text-gray-700">{formatCOP(recibido)}</p>
              </div>
            </div>
            <div className={`text-center p-3 rounded-lg ${diferencia === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <p className="text-xs text-gray-500">Diferencia</p>
              <p className={`font-bold text-xl ${diferencia === 0 ? 'text-green-600' : 'text-red-600'}`}>
                {diferencia > 0 ? '+' : ''}{formatCOP(diferencia)}
              </p>
              <p className="text-xs mt-1 text-gray-500">{diferencia === 0 ? '✅ Cuadrado' : '⚠️ Con diferencia'}</p>
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
