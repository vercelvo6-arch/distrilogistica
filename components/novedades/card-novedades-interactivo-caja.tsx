"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCOP } from "@/lib/format-utils"
import { useToast } from "@/hooks/use-toast"

interface CardNovedadesInteractivoProps {
  planillaId: string
  tipo: "agotado" | "devolucion" | "fiado" | "error_facturacion"
  onNovedadActualizada?: () => void
}

interface Novedad {
  id: string
  pedido_id: string
  tipo_novedad: string
  monto_novedad: number
  monto_pagado: number
  descripcion: string
  validado: boolean
  registrado_por: string
  created_at: string
  cliente: string
}

interface ResumenTipo {
  total: number
  validadas: number
  pendientes: number
  clientes: number
  cantidad: number
}

// El tipo "fiado" en UI corresponde a "fiado_parcial" en BD
const TIPOS_BD: Record<string, string[]> = {
  agotado: ["agotado"],
  devolucion: ["devolucion"],
  fiado: ["fiado_parcial", "fiado"],
  error_facturacion: ["error_facturacion"],
}

export function CardNovedadesInteractivo({
  planillaId,
  tipo,
  onNovedadActualizada,
}: CardNovedadesInteractivoProps) {
  const { toast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [resumen, setResumen] = useState<ResumenTipo | null>(null)
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [todasNovedades, setTodasNovedades] = useState<Novedad[]>([])
  const [loading, setLoading] = useState(true)

  const tiposBuscar = TIPOS_BD[tipo] || [tipo]

  useEffect(() => {
    loadResumen()
  }, [planillaId, tipo])

  async function loadResumen() {
    try {
      const response = await fetch(`/api/novedades/resumen/${planillaId}`)
      if (!response.ok) { setLoading(false); return }

      const data = await response.json()

      // El resumen puede venir indexado por "fiado" o "fiado_parcial" según el backend
      const resumenTipo = data.resumen?.[tipo] || data.resumen?.["fiado_parcial"] || null

      // Pendientes (no validadas) — filtrar por cualquiera de los tipos BD equivalentes
      const pendientes = (data.novedadesPendientes || []).filter(
        (n: Novedad) => tiposBuscar.includes(n.tipo_novedad)
      )
      setNovedades(pendientes)

      // Todas (incluyendo validadas)
      const todasRaw = data.todasNovedades || data.novedadesPendientes || []
      const todas = todasRaw.filter((n: Novedad) => tiposBuscar.includes(n.tipo_novedad))
      setTodasNovedades(todas)

      // Si el backend no da resumen para este tipo, calcularlo desde las novedades
      if (resumenTipo) {
        setResumen(resumenTipo)
      } else {
        const total = todas.reduce((s: number, n: Novedad) => {
          // Para fiado_parcial, el "total" relevante es el saldo (monto_novedad)
          return s + (Number(n.monto_novedad) || 0)
        }, 0)
        const validadasCount = todas.filter((n: Novedad) => n.validado).length
        setResumen({
          total,
          validadas: validadasCount,
          pendientes: todas.length - validadasCount,
          clientes: new Set(todas.map((n: Novedad) => n.pedido_id)).size,
          cantidad: todas.length,
        })
      }
    } catch (error) {
      console.error("[CardNovedades] Error cargando resumen:", error)
    } finally {
      setLoading(false)
    }
  }

  async function handleValidar(novedadId: string) {
    try {
      const response = await fetch("/api/novedades/validar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novedadIds: [novedadId] }),
      })
      if (!response.ok) throw new Error("Error al validar")
      toast({ title: "Validado", description: "Novedad validada exitosamente" })
      await loadResumen()
      onNovedadActualizada?.()
    } catch {
      toast({ title: "Error", description: "No se pudo validar", variant: "destructive" })
    }
  }

  // ✅ Eliminar/Revertir ahora siempre disponible — propias o del entregador,
  // validadas o no. Caja es quien valida, por lo tanto puede revertir cualquier
  // novedad de este tipo.
  async function handleEliminar(novedadId: string) {
    if (!confirm("¿Revertir esta novedad? Esto la eliminará y recalculará los totales del cuadre.")) return
    try {
      const response = await fetch("/api/novedades/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novedadId }),
      })
      if (!response.ok) throw new Error("Error al eliminar")
      toast({ title: "Revertido", description: "Novedad eliminada y totales recalculados" })
      await loadResumen()
      onNovedadActualizada?.()
    } catch {
      toast({ title: "Error", description: "No se pudo revertir", variant: "destructive" })
    }
  }

  async function handleCambiarTipo(novedadId: string, nuevoTipo: string) {
    try {
      const response = await fetch("/api/novedades/cambiar-tipo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novedadId, nuevoTipo }),
      })
      if (!response.ok) throw new Error("Error al cambiar tipo")
      toast({ title: "Tipo Cambiado", description: "Novedad reclasificada" })
      await loadResumen()
      onNovedadActualizada?.()
    } catch {
      toast({ title: "Error", description: "No se pudo cambiar el tipo", variant: "destructive" })
    }
  }

  const getTitulo = () => {
    switch (tipo) {
      case "agotado": return "AGOTADOS"
      case "devolucion": return "DEVOLUCIONES"
      case "fiado": return "FIADOS"
      case "error_facturacion": return "ERRORES FACTURACIÓN"
      default: return "NOVEDADES"
    }
  }

  const getColor = () => {
    switch (tipo) {
      case "agotado": return "bg-gray-100 border-gray-300"
      case "devolucion": return "bg-red-50 border-red-300"
      case "fiado": return "bg-orange-50 border-orange-300"
      case "error_facturacion": return "bg-yellow-50 border-yellow-300"
      default: return "bg-gray-50 border-gray-200"
    }
  }

  const getIcon = () => {
    switch (tipo) {
      case "agotado": return "⚫"
      case "devolucion": return "🔴"
      case "fiado": return "🟠"
      case "error_facturacion": return "🟡"
      default: return "📋"
    }
  }

  if (loading) return null
  if (!resumen) return null
  if (resumen.cantidad === 0) return null

  return (
    <>
      <Card
        className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${getColor()}`}
        onClick={() => setShowModal(true)}
      >
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs font-medium text-gray-600 mb-1">
              {getIcon()} {getTitulo()}
            </p>
            <p className="text-2xl font-bold">{formatCOP(resumen.total)}</p>
            <p className="text-xs text-gray-500 mt-1">
              {resumen.clientes} cliente{resumen.clientes !== 1 ? "s" : ""} · {resumen.cantidad} novedad{resumen.cantidad !== 1 ? "es" : ""}
            </p>
          </div>
          {resumen.pendientes > 0 && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">
              ⚠️ {novedades.length} pendiente{novedades.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" className="w-full mt-3">
          Ver Detalle
        </Button>
      </Card>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {getIcon()} {getTitulo()} — {resumen.cantidad} novedad{resumen.cantidad !== 1 ? "es" : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Pendientes de validar */}
            {novedades.length > 0 && (
              <>
                <p className="text-xs font-medium text-yellow-700 uppercase">Pendientes de validar</p>
                {novedades.map((novedad) => (
                  <Card key={novedad.id} className="p-4 bg-yellow-50 border-yellow-200">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold">{novedad.cliente}</p>
                        <p className="text-sm text-gray-600">{novedad.descripcion || "Sin descripción"}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {novedad.registrado_por} · {new Date(novedad.created_at).toLocaleString("es-CO")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-red-600">{formatCOP(novedad.monto_novedad)}</p>
                        {tipo === "fiado" && novedad.monto_pagado > 0 && (
                          <>
                            <p className="text-sm text-green-600">Pagó: {formatCOP(novedad.monto_pagado)}</p>
                            <p className="text-sm text-orange-600 font-medium">
                              Saldo fiado: {formatCOP(novedad.monto_novedad)}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" onClick={() => handleValidar(novedad.id)} className="flex-1">
                        ✓ Validar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleEliminar(novedad.id)}
                        className="border-red-300 text-red-600 hover:bg-red-50">
                        ↩ Revertir
                      </Button>
                      <Select onValueChange={(value) => { if (value) handleCambiarTipo(novedad.id, value) }} defaultValue="">
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="🔄 Cambiar a..." />
                        </SelectTrigger>
                        <SelectContent>
                          {tipo !== "agotado" && <SelectItem value="agotado">⚫ Agotado</SelectItem>}
                          {tipo !== "devolucion" && <SelectItem value="devolucion">🔴 Devolución</SelectItem>}
                          {tipo !== "fiado" && <SelectItem value="fiado_parcial">🟠 Fiado</SelectItem>}
                          {tipo !== "error_facturacion" && <SelectItem value="error_facturacion">🟡 Error Fact.</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>
                  </Card>
                ))}
              </>
            )}

            {/* Validadas — caja puede revertir incluso estas */}
            {todasNovedades.filter(n => n.validado).length > 0 && (
              <>
                <p className="text-xs font-medium text-green-700 uppercase mt-4">Validadas</p>
                {todasNovedades.filter(n => n.validado).map((novedad) => (
                  <Card key={novedad.id} className="p-4 bg-green-50 border-green-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{novedad.cliente}</p>
                        <p className="text-sm text-gray-600">{novedad.descripcion || "Sin descripción"}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {novedad.registrado_por} · {new Date(novedad.created_at).toLocaleString("es-CO")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{formatCOP(novedad.monto_novedad)}</p>
                        <Badge variant="outline" className="bg-green-100 text-green-700 text-xs">✓ Validada</Badge>
                      </div>
                    </div>
                    <div className="flex justify-end mt-2">
                      <Button size="sm" variant="outline" onClick={() => handleEliminar(novedad.id)}
                        className="h-7 text-xs border-red-300 text-red-600 hover:bg-red-50">
                        ↩ Revertir / Anular
                      </Button>
                    </div>
                  </Card>
                ))}
              </>
            )}

            {novedades.length === 0 && todasNovedades.filter(n => n.validado).length === 0 && (
              <p className="text-center text-gray-500 py-8">
                ✅ No hay novedades de este tipo
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
