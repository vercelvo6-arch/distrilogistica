import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { formatCOP } from "@/lib/format-utils"
import { useToast } from "@/hooks/use-toast"
import { Banknote, ChevronDown, ChevronUp, Loader2 } from "lucide-react"

interface FiadoAsignado {
  id: number
  cliente: string
  direccion?: string
  telefono?: string
  monto_total: number
  monto_pagado: number
  saldo_pendiente: number
  estado: string
  entregador: string
  ruta: string
  observaciones?: string
}

interface FiadosAsignadosSectionProps {
  planillaId: string | number
  entregador?: string  // 🔥 NUEVO - para tracking
  onTotalCobrosChange: (total: number) => void // notifica al padre cuánto se cobró
}

export function FiadosAsignadosSection({ 
  planillaId, 
  entregador,  // 🔥 NUEVO
  onTotalCobrosChange 
}: FiadosAsignadosSectionProps) {
  const { toast } = useToast()
  const [fiados, setFiados] = useState<FiadoAsignado[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)
  const [abonos, setAbonos] = useState<Record<number, string>>({}) // fiadoId → monto string
  const [registrando, setRegistrando] = useState<number | null>(null)

  useEffect(() => {
    loadFiadosAsignados()
  }, [planillaId])

  // Recalcular total cobros cuando cambian abonos
  useEffect(() => {
    const total = Object.values(abonos).reduce((sum, val) => sum + (Number(val) || 0), 0)
    onTotalCobrosChange(total)
  }, [abonos, onTotalCobrosChange])

  async function loadFiadosAsignados() {
    try {
      setLoading(true)
      console.log('[FIADOS ASIGNADOS] 🔍 Cargando fiados para planilla:', planillaId)
      
      const res = await fetch(`/api/fiados?planilla_id=${planillaId}`)
      if (!res.ok) throw new Error("Error al cargar fiados asignados")
      
      const data = await res.json()
      console.log('[FIADOS ASIGNADOS] 📦 Datos recibidos:', data)
      
      const fiadosFiltrados = (data.fiados || []).filter(
        (f: FiadoAsignado) => f.estado !== "pagado_completo"
      )
      
      console.log('[FIADOS ASIGNADOS] ✅ Fiados pendientes:', fiadosFiltrados.length)
      setFiados(fiadosFiltrados)
    } catch (err) {
      console.error('[FIADOS ASIGNADOS] ❌ Error:', err)
      setFiados([])
    } finally {
      setLoading(false)
    }
  }

  async function handleRegistrarAbono(fiado: FiadoAsignado) {
    const montoStr = abonos[fiado.id] || ""
    const monto = Number(montoStr)

    console.log('[FIADOS ASIGNADOS] 💰 Registrando abono:', {
      fiado_id: fiado.id,
      cliente: fiado.cliente,
      monto,
      saldo_pendiente: fiado.saldo_pendiente
    })

    // Validaciones
    if (!monto || monto <= 0) {
      toast({ title: "Error", description: "Ingresa un monto válido", variant: "destructive" })
      return
    }

    if (monto > fiado.saldo_pendiente) {
      toast({
        title: "Error",
        description: `El abono no puede superar el saldo (${formatCOP(fiado.saldo_pendiente)})`,
        variant: "destructive",
      })
      return
    }

    try {
      setRegistrando(fiado.id)

      // 🔥 TRACKING: Incluir entregador y planilla
      const payload = {
        pedidoId: fiado.id,
        montoAbono: monto,
        metodoPago: "efectivo",
        entregadorCobro: entregador || fiado.entregador,  // 🔥 NUEVO
        planillaCobro: Number(planillaId),                // 🔥 NUEVO
        observaciones: `Cobro en ruta - planilla ${planillaId}`,
      }

      console.log('[FIADOS ASIGNADOS] 📤 Enviando payload:', payload)

      const res = await fetch("/api/fiados/registrar-abono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      
      console.log('[FIADOS ASIGNADOS] 📥 Respuesta:', data)

      if (!res.ok) {
        throw new Error(data.error || "Error al registrar abono")
      }

      // Toast de éxito
      toast({
        title: "✅ Cobro registrado",
        description: `${formatCOP(monto)} cobrado a ${fiado.cliente}. Saldo: ${formatCOP(data.fiado.saldo_pendiente)}`,
      })

      console.log('[FIADOS ASIGNADOS] ✅ Abono registrado exitosamente')

      // Actualizar estado local
      setFiados((prev) =>
        prev.map((f) =>
          f.id === fiado.id
            ? {
                ...f,
                monto_pagado: data.fiado.monto_pagado,
                saldo_pendiente: data.fiado.saldo_pendiente,
                estado: data.fiado.estado,
              }
            : f
        ).filter((f) => f.estado !== "pagado_completo")
      )

      // Limpiar campo de abono
      setAbonos((prev) => ({ ...prev, [fiado.id]: "" }))

    } catch (err) {
      console.error('[FIADOS ASIGNADOS] ❌ Error registrando abono:', err)
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Error al registrar cobro",
        variant: "destructive",
      })
    } finally {
      setRegistrando(null)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando fiados asignados...
      </div>
    )
  }

  // Sin fiados asignados
  if (fiados.length === 0) {
    console.log('[FIADOS ASIGNADOS] ℹ️ No hay fiados asignados a esta planilla')
    return null
  }

  // Calcular totales
  const totalSaldos = fiados.reduce((s, f) => s + Number(f.saldo_pendiente), 0)
  const totalAbonosIngresados = Object.values(abonos).reduce((s, v) => s + (Number(v) || 0), 0)

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header colapsable */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-amber-50 border-b border-amber-200 text-left hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 text-amber-600" />
          <span className="font-semibold text-sm text-amber-800">
            Cobros de Fiados Asignados ({fiados.length})
          </span>
          <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
            Cartera: {formatCOP(totalSaldos)}
          </Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-600" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-600" />
        )}
      </button>

      {/* Contenido expandible */}
      {expanded && (
        <div className="divide-y">
          {fiados.map((fiado) => {
            const abonoVal = abonos[fiado.id] || ""
            const abonoNum = Number(abonoVal) || 0
            const nuevoSaldo = fiado.saldo_pendiente - abonoNum
            const esPagoCompleto = abonoNum === fiado.saldo_pendiente

            return (
              <div key={fiado.id} className="p-3 bg-white">
                <div className="flex items-start justify-between gap-4">
                  {/* Información del cliente */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{fiado.cliente}</p>
                    {fiado.direccion && (
                      <p className="text-xs text-muted-foreground truncate">{fiado.direccion}</p>
                    )}
                    {fiado.telefono && (
                      <p className="text-xs text-muted-foreground">{fiado.telefono}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Deuda original: <span className="font-medium">{formatCOP(fiado.monto_total)}</span>
                      </span>
                      {fiado.monto_pagado > 0 && (
                        <span className="text-xs text-green-600">
                          Abonado: {formatCOP(fiado.monto_pagado)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Saldo + campo de abono */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                      <p className="font-bold text-amber-600 text-base">
                        {formatCOP(fiado.saldo_pendiente)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Cobrar hoy</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min={0}
                            max={fiado.saldo_pendiente}
                            value={abonoVal}
                            onChange={(e) =>
                              setAbonos((prev) => ({ ...prev, [fiado.id]: e.target.value }))
                            }
                            placeholder="0"
                            className="w-32 h-8 text-sm text-right"
                            disabled={registrando !== null}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() =>
                              setAbonos((prev) => ({
                                ...prev,
                                [fiado.id]: fiado.saldo_pendiente.toString(),
                              }))
                            }
                            disabled={registrando !== null}
                          >
                            Todo
                          </Button>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        disabled={!abonoVal || abonoNum <= 0 || registrando !== null}
                        onClick={() => handleRegistrarAbono(fiado)}
                        className="h-8 text-xs mt-4"
                      >
                        {registrando === fiado.id ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Cobrando...
                          </>
                        ) : (
                          "Cobrar"
                        )}
                      </Button>
                    </div>

                    {/* Preview del nuevo saldo */}
                    {abonoNum > 0 && abonoNum <= fiado.saldo_pendiente && (
                      <div
                        className={`text-xs px-2 py-1 rounded ${
                          esPagoCompleto
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-orange-50 text-orange-700 border border-orange-200"
                        }`}
                      >
                        {esPagoCompleto ? "✅ Saldo saldado" : `Nuevo saldo: ${formatCOP(nuevoSaldo)}`}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Footer con resumen de cobros */}
          {totalAbonosIngresados > 0 && (
            <div className="p-3 bg-amber-50 flex items-center justify-between border-t border-amber-200">
              <span className="text-sm font-medium text-amber-800">
                Total a cobrar hoy:
              </span>
              <span className="font-bold text-amber-700 text-base">
                {formatCOP(totalAbonosIngresados)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
