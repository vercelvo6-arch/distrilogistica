"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { TrendingUp, Download, Calendar, Award } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

interface RendimientoViewProps {
  onLogout: () => void
  userRole: string
}

interface RendimientoEntregador {
  entregador: string
  totalCargue: number
  totalEntregado: number
  totalDevoluciones: number
  totalRepasos: number
  porcentajeDevolucion: number
  calificaIncentivo: boolean
  montoIncentivo?: number
  totalRutas: number
  periodoInicio: string
  periodoFin: string
}

export function RendimientoView({ onLogout, userRole }: RendimientoViewProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [rendimientos, setRendimientos] = useState<RendimientoEntregador[]>([])
  const [fechaInicio, setFechaInicio] = useState("2026-01-01")
  const [fechaFin, setFechaFin] = useState("2026-01-31")
  const [umbralIncentivo, setUmbralIncentivo] = useState(5) // 5% por defecto

  useEffect(() => {
    loadRendimientos()
  }, [fechaInicio, fechaFin])

  async function loadRendimientos() {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        fechaInicio,
        fechaFin
      })

      const response = await fetch(`/api/rendimiento?${params}`)
      if (!response.ok) throw new Error("Error al cargar rendimientos")

      const data = await response.json()
      setRendimientos(data.rendimientos || [])
    } catch (err) {
      console.error("Error loading rendimientos:", err)
      toast({
        title: "Error",
        description: "No se pudieron cargar los rendimientos",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  async function guardarIncentivo(entregador: string, monto: number) {
    try {
      const response = await fetch("/api/incentivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entregador,
          monto,
          fechaInicio,
          fechaFin,
          motivo: "Bajo porcentaje de devoluciones"
        }),
      })

      if (!response.ok) throw new Error("Error al guardar incentivo")

      toast({
        title: "✅ Incentivo Guardado",
        description: `Incentivo de ${formatCOP(monto)} registrado para ${entregador}`,
      })

      await loadRendimientos()
    } catch (err) {
      console.error("Error guardando incentivo:", err)
      toast({
        title: "Error",
        description: "No se pudo guardar el incentivo",
        variant: "destructive",
      })
    }
  }

  const totales = rendimientos.reduce((acc, r) => ({
    cargue: acc.cargue + r.totalCargue,
    entregado: acc.entregado + r.totalEntregado,
    devoluciones: acc.devoluciones + r.totalDevoluciones,
    repasos: acc.repasos + r.totalRepasos,
  }), { cargue: 0, entregado: 0, devoluciones: 0, repasos: 0 })

  const porcentajeDevolucionGeneral = totales.cargue > 0 
    ? (totales.devoluciones / totales.cargue) * 100 
    : 0

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6" />
              Rendimiento e Incentivos
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Análisis de devoluciones y sistema de incentivos por entregador
            </p>
          </div>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>

        {/* Filtros */}
        <Card className="p-4 bg-muted/50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs mb-2 block">Fecha Inicio</Label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs mb-2 block">Fecha Fin</Label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs mb-2 block">Umbral Incentivo (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={umbralIncentivo}
                onChange={(e) => setUmbralIncentivo(parseFloat(e.target.value))}
                placeholder="5.0"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Devoluciones menores a este % califican
              </p>
            </div>
            <div className="flex items-end">
              <Button onClick={loadRendimientos} className="w-full">
                Actualizar
              </Button>
            </div>
          </div>
        </Card>

        {/* Resumen General */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Cargue</p>
            <p className="text-xl font-bold">{formatCOP(totales.cargue)}</p>
          </Card>
          <Card className="p-4 bg-green-50 border-green-200">
            <p className="text-xs text-green-700 mb-1">Total Entregado</p>
            <p className="text-xl font-bold text-green-600">{formatCOP(totales.entregado)}</p>
          </Card>
          <Card className="p-4 bg-red-50 border-red-200">
            <p className="text-xs text-red-700 mb-1">Total Devoluciones</p>
            <p className="text-xl font-bold text-red-600">{formatCOP(totales.devoluciones)}</p>
          </Card>
          <Card className="p-4 bg-purple-50 border-purple-200">
            <p className="text-xs text-purple-700 mb-1">% Devolución General</p>
            <p className="text-xl font-bold text-purple-600">
              {porcentajeDevolucionGeneral.toFixed(2)}%
            </p>
          </Card>
        </div>

        {/* Tabla de Rendimientos */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 text-sm font-medium">Entregador</th>
                <th className="text-right p-3 text-sm font-medium">Rutas</th>
                <th className="text-right p-3 text-sm font-medium">Cargue Total</th>
                <th className="text-right p-3 text-sm font-medium">Entregado</th>
                <th className="text-right p-3 text-sm font-medium">Devoluciones</th>
                <th className="text-right p-3 text-sm font-medium">Repasos</th>
                <th className="text-right p-3 text-sm font-medium">% Devolución</th>
                <th className="text-center p-3 text-sm font-medium">Estado</th>
                <th className="text-center p-3 text-sm font-medium">Incentivo</th>
              </tr>
            </thead>
            <tbody>
              {rendimientos.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center p-8 text-muted-foreground">
                    No hay datos para el período seleccionado
                  </td>
                </tr>
              ) : (
                rendimientos.map((r) => {
                  const califica = r.porcentajeDevolucion < umbralIncentivo
                  
                  return (
                    <tr key={r.entregador} className="border-t hover:bg-muted/50">
                      <td className="p-3 text-sm font-medium">{r.entregador}</td>
                      <td className="p-3 text-sm text-right">{r.totalRutas}</td>
                      <td className="p-3 text-sm text-right">
                        {formatCOP(r.totalCargue)}
                      </td>
                      <td className="p-3 text-sm text-right text-green-600 font-medium">
                        {formatCOP(r.totalEntregado)}
                      </td>
                      <td className="p-3 text-sm text-right text-red-600 font-medium">
                        {formatCOP(r.totalDevoluciones)}
                      </td>
                      <td className="p-3 text-sm text-right text-blue-600">
                        {formatCOP(r.totalRepasos)}
                      </td>
                      <td className="p-3 text-sm text-right">
                        <span className={`font-bold ${
                          r.porcentajeDevolucion < umbralIncentivo 
                            ? 'text-green-600' 
                            : 'text-red-600'
                        }`}>
                          {r.porcentajeDevolucion.toFixed(2)}%
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        {califica ? (
                          <Badge className="bg-green-100 text-green-800 border-green-300">
                            <Award className="h-3 w-3 mr-1" />
                            Califica
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            No califica
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {califica ? (
                          <div className="flex items-center gap-2 justify-center">
                            <Input
                              type="number"
                              placeholder="0"
                              className="w-28 h-8 text-xs"
                              defaultValue={r.montoIncentivo || ""}
                              id={`incentivo-${r.entregador}`}
                            />
                            <Button
                              size="sm"
                              onClick={() => {
                                const input = document.getElementById(
                                  `incentivo-${r.entregador}`
                                ) as HTMLInputElement
                                const monto = parseFloat(input?.value || "0")
                                if (monto > 0) {
                                  guardarIncentivo(r.entregador, monto)
                                }
                              }}
                            >
                              Guardar
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Leyenda */}
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-2">
            <Award className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">Sistema de Incentivos</p>
              <p className="text-xs text-blue-700 mt-1">
                Los entregadores con un porcentaje de devoluciones <strong>menor al {umbralIncentivo}%</strong> califican 
                para recibir un incentivo. El monto del incentivo es configurable por entregador.
              </p>
              <p className="text-xs text-blue-700 mt-2">
                <strong>Cálculo:</strong> % Devolución = (Total Devoluciones / Total Cargue) × 100
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Card>
  )
}
