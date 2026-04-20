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
  planillaId: number
  tipo: "agotado" | "devolucion" | "fiado_parcial" | "error_facturacion"
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

export function CardNovedadesInteractivo({
  planillaId,
  tipo,
  onNovedadActualizada,
}: CardNovedadesInteractivoProps) {
  const { toast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [resumen, setResumen] = useState<ResumenTipo | null>(null)
  const [novedades, setNovedades] = useState<Novedad[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadResumen()
  }, [planillaId, tipo])

  async function loadResumen() {
    try {
      const response = await fetch(`/api/novedades/resumen/${planillaId}`)
      if (!response.ok) return

      const data = await response.json()
      const resumenTipo = data.resumen[tipo]
      setResumen(resumenTipo)

      // Filtrar novedades pendientes de este tipo
      const novedadesFiltradas = (data.novedadesPendientes || []).filter(
        (n: Novedad) => n.tipo_novedad === tipo
      )
      setNovedades(novedadesFiltradas)
    } catch (error) {
      console.error("Error cargando resumen:", error)
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

      toast({
        title: "Validado",
        description: "Novedad validada exitosamente",
      })

      await loadResumen()
      onNovedadActualizada?.()
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo validar la novedad",
        variant: "destructive",
      })
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

      toast({
        title: "Tipo Cambiado",
        description: "La novedad fue reclasificada exitosamente",
      })

      await loadResumen()
      onNovedadActualizada?.()
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo cambiar el tipo",
        variant: "destructive",
      })
    }
  }

  const getTitulo = () => {
    switch (tipo) {
      case "agotado": return "AGOTADOS"
      case "devolucion": return "DEVOLUCIONES"
      case "fiado_parcial": return "FIADOS"
      case "error_facturacion": return "ERRORES FACTURACIÓN"
    }
  }

  const getColor = () => {
    switch (tipo) {
      case "agotado": return "bg-gray-100 border-gray-300"
      case "devolucion": return "bg-red-50 border-red-300"
      case "fiado_parcial": return "bg-orange-50 border-orange-300"
      case "error_facturacion": return "bg-yellow-50 border-yellow-300"
    }
  }

  const getIcon = () => {
    switch (tipo) {
      case "agotado": return "⚫"
      case "devolucion": return "🔴"
      case "fiado_parcial": return "🟠"
      case "error_facturacion": return "🟡"
    }
  }

  if (loading || !resumen || resumen.total === 0) return null

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
              {getIcon()} {getTitulo()} - {novedades.length} pendiente{novedades.length !== 1 ? "s" : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {novedades.length === 0 ? (
              <p className="text-center text-gray-500 py-8">
                ✅ Todas las novedades de este tipo fueron validadas
              </p>
            ) : (
              novedades.map((novedad) => (
                <Card key={novedad.id} className="p-4 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold">{novedad.cliente}</p>
                      <p className="text-sm text-gray-600">{novedad.descripcion || "Sin descripción"}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Registró: {novedad.registrado_por} · {new Date(novedad.created_at).toLocaleString("es-CO")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">{formatCOP(novedad.monto_novedad)}</p>
                      {tipo === "fiado_parcial" && novedad.monto_pagado > 0 && (
                        <p className="text-sm text-green-600">Pagó: {formatCOP(novedad.monto_pagado)}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      onClick={() => handleValidar(novedad.id)}
                      className="flex-1"
                    >
                      ✓ Validar
                    </Button>
                    <Select
                      onValueChange={(value) => {
                        if (value) {
                          handleCambiarTipo(novedad.id, value)
                        }
                      }}
                      defaultValue=""
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="🔄 Cambiar a..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tipo !== "agotado" && <SelectItem value="agotado">⚫ Agotado</SelectItem>}
                        {tipo !== "devolucion" && <SelectItem value="devolucion">🔴 Devolución</SelectItem>}
                        {tipo !== "fiado_parcial" && <SelectItem value="fiado_parcial">🟠 Fiado</SelectItem>}
                        {tipo !== "error_facturacion" && <SelectItem value="error_facturacion">🟡 Error Fact.</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
