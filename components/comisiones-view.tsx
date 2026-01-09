"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Wallet, LogOut, Download, Calendar, Users, Edit, Save, X } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface ComisionesViewProps {
  onLogout: () => void
  userRole: string
  userId?: string
}

interface Comision {
  id: string
  planilla_id: string
  entregador: string
  fecha: string
  total_entregas_efectivas: number
  total_devoluciones: number
  base_comisionable: number
  porcentaje_aplicado: number
  porcentaje_ajustado?: number
  monto_comision: number
  monto_ajustado?: number
  estado: "pendiente" | "liquidado" | "pagado"
  nota_ajuste?: string
  ajustado_por?: string
  ajustado_en?: string
}

interface EntregadorConfig {
  entregador: string
  porcentaje_comision: number
  activo: boolean
}

export function ComisionesView({ onLogout, userRole, userId }: ComisionesViewProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"reporte" | "configuracion">("reporte")
  const [comisiones, setComisiones] = useState<Comision[]>([])
  const [configs, setConfigs] = useState<EntregadorConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedComisiones, setSelectedComisiones] = useState<Set<string>>(new Set())
  const [editingComision, setEditingComision] = useState<Comision | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    porcentaje: 0,
    monto: 0,
    nota: ""
  })

  // Filtros
  // Calcular primer y último día del mes actual
const hoy = new Date()
const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split("T")[0]
const ultimoDia = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).toISOString().split("T")[0]

const [fechaInicio, setFechaInicio] = useState(primerDia)
const [fechaFin, setFechaFin] = useState(ultimoDia)
const [entregadorFiltro, setEntregadorFiltro] = useState<string>("all")

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    if (fechaInicio && fechaFin) {
      loadComisiones()
    }
  }, [fechaInicio, fechaFin, entregadorFiltro])

  async function loadData() {
    await Promise.all([loadConfigs(), loadComisiones()])
    setLoading(false)
  }

  async function loadConfigs() {
    try {
      const response = await fetch("/api/comisiones/config")
      if (!response.ok) throw new Error("Error al cargar configuraciones")
      const data = await response.json()
      setConfigs(data.configs || [])
    } catch (err) {
      console.error("Error loading configs:", err)
      toast({
        title: "Error",
        description: "No se pudieron cargar las configuraciones",
        variant: "destructive",
      })
    }
  }

  async function loadComisiones() {
    try {
      const params = new URLSearchParams({
        fechaInicio,
        fechaFin,
        ...(entregadorFiltro !== "all" && { entregador: entregadorFiltro }),
      })

      const response = await fetch(`/api/comisiones?${params}`)
      if (!response.ok) throw new Error("Error al cargar comisiones")
      const data = await response.json()
      setComisiones(data.comisiones || [])
    } catch (err) {
      console.error("Error loading comisiones:", err)
      toast({
        title: "Error",
        description: "No se pudieron cargar las comisiones",
        variant: "destructive",
      })
    }
  }

  async function handleUpdateConfig(entregador: string, porcentaje: number) {
    try {
      const response = await fetch("/api/comisiones/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregador, porcentaje }),
      })

      if (!response.ok) throw new Error("Error al actualizar configuración")

      toast({
        title: "Configuración actualizada",
        description: `Porcentaje de ${entregador} actualizado a ${porcentaje}%`,
      })

      await loadConfigs()
    } catch (err) {
      console.error("Error updating config:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar la configuración",
        variant: "destructive",
      })
    }
  }

  function openEditDialog(comision: Comision) {
    setEditingComision(comision)
    setEditForm({
      porcentaje: comision.porcentaje_ajustado || comision.porcentaje_aplicado,
      monto: comision.monto_ajustado || comision.monto_comision,
      nota: comision.nota_ajuste || ""
    })
    setEditDialogOpen(true)
  }

  async function handleSaveEdit() {
    if (!editingComision) return

    try {
      const response = await fetch(`/api/comisiones/${editingComision.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          porcentaje_ajustado: editForm.porcentaje,
          monto_ajustado: editForm.monto,
          nota_ajuste: editForm.nota,
          ajustado_por: userId
        }),
      })

      if (!response.ok) throw new Error("Error al actualizar comisión")

      toast({
        title: "✅ Comisión ajustada",
        description: `Nuevo monto: ${formatCOP(editForm.monto)}`,
      })

      setEditDialogOpen(false)
      setEditingComision(null)
      await loadComisiones()
    } catch (err) {
      console.error("Error updating comision:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar la comisión",
        variant: "destructive",
      })
    }
  }

  function handlePorcentajeChange(valor: string) {
    const porcentaje = parseFloat(valor) || 0
    const base = editingComision?.base_comisionable || 0
    const nuevoMonto = (base * porcentaje) / 100
    setEditForm({ ...editForm, porcentaje, monto: nuevoMonto })
  }

  function handleMontoChange(valor: string) {
    const monto = parseFloat(valor) || 0
    const base = editingComision?.base_comisionable || 0
    const nuevoPorcentaje = base > 0 ? (monto / base) * 100 : 0
    setEditForm({ ...editForm, monto, porcentaje: nuevoPorcentaje })
  }

  async function handleMarcarPagadas() {
    if (selectedComisiones.size === 0) return

    try {
      const response = await fetch("/api/comisiones/marcar-pagadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comisionIds: Array.from(selectedComisiones),
          usuarioId: userId,
        }),
      })

      if (!response.ok) throw new Error("Error al marcar como pagadas")

      toast({
        title: "✅ Comisiones pagadas",
        description: `${selectedComisiones.size} comisión(es) marcadas como pagadas`,
      })

      setSelectedComisiones(new Set())
      await loadComisiones()
    } catch (err) {
      console.error("Error marking as paid:", err)
      toast({
        title: "Error",
        description: "No se pudieron marcar las comisiones como pagadas",
        variant: "destructive",
      })
    }
  }

  function toggleComision(id: string) {
    const newSet = new Set(selectedComisiones)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedComisiones(newSet)
  }

  const entregadores = comisiones.length > 0 
    ? [...new Set(comisiones.map((c) => c.entregador))]
    : []

  const totales = comisiones.reduce(
    (acc, c) => ({
      entregas: acc.entregas + Number(c.total_entregas_efectivas),
      devoluciones: acc.devoluciones + Number(c.total_devoluciones),
      base: acc.base + Number(c.base_comisionable),
      comision: acc.comision + Number(c.monto_ajustado || c.monto_comision),
    }),
    { entregas: 0, devoluciones: 0, base: 0, comision: 0 }
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <Card className="p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-6">
            <TabsTrigger value="reporte">Reporte de Comisiones</TabsTrigger>
            <TabsTrigger value="configuracion">Configuración</TabsTrigger>
          </TabsList>

          {/* REPORTE DE COMISIONES */}
          <TabsContent value="reporte" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Fecha Inicio</label>
                <Input
                  type="date"
                  value={fechaInicio}
                  onChange={(e) => setFechaInicio(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Fecha Fin</label>
                <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Entregador</label>
                <Select value={entregadorFiltro} onValueChange={setEntregadorFiltro}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {entregadores.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Exportar
                </Button>
              </div>
            </div>

            <Card className="p-6 bg-gradient-to-r from-purple-50 to-pink-50">
              <h3 className="text-sm font-medium text-purple-900 mb-2">Total General</h3>
              <p className="text-3xl font-bold text-purple-600">{formatCOP(totales.comision)}</p>
              <p className="text-sm text-purple-700 mt-2">Suma de todas las comisiones</p>
            </Card>

            {selectedComisiones.size > 0 && (
              <Card className="p-4 bg-green-50 border-green-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-green-900">
                    {selectedComisiones.size} comisión(es) seleccionadas
                  </p>
                  <Button onClick={handleMarcarPagadas} className="bg-green-600">
                    Marcar como Pagadas ({selectedComisiones.size})
                  </Button>
                </div>
              </Card>
            )}

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium w-10"></th>
                    <th className="text-left p-3 text-sm font-medium">Entregador</th>
                    <th className="text-left p-3 text-sm font-medium">Fecha</th>
                    <th className="text-right p-3 text-sm font-medium">Entregas</th>
                    <th className="text-right p-3 text-sm font-medium">Devoluciones</th>
                    <th className="text-right p-3 text-sm font-medium">Base</th>
                    <th className="text-right p-3 text-sm font-medium">%</th>
                    <th className="text-right p-3 text-sm font-medium">Comisión</th>
                    <th className="text-center p-3 text-sm font-medium">Estado</th>
                    <th className="text-center p-3 text-sm font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {comisiones.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center p-8 text-muted-foreground">
                        No hay comisiones para el período seleccionado
                      </td>
                    </tr>
                  ) : (
                    comisiones.map((c) => {
                      const montoFinal = c.monto_ajustado || c.monto_comision
                      const porcentajeFinal = c.porcentaje_ajustado || c.porcentaje_aplicado
                      const fueAjustado = !!c.monto_ajustado

                      return (
                        <tr key={c.id} className="border-t hover:bg-muted/50">
                          <td className="p-3">
                            {c.estado === "pendiente" && (
                              <Checkbox
                                checked={selectedComisiones.has(c.id)}
                                onCheckedChange={() => toggleComision(c.id)}
                              />
                            )}
                          </td>
                          <td className="p-3 text-sm font-medium">{c.entregador}</td>
                          <td className="p-3 text-sm">{new Date(c.fecha).toLocaleDateString()}</td>
                          <td className="p-3 text-sm text-right">
                            {formatCOP(c.total_entregas_efectivas)}
                          </td>
                          <td className="p-3 text-sm text-right text-red-600">
                            {formatCOP(c.total_devoluciones)}
                          </td>
                          <td className="p-3 text-sm text-right font-medium">
                            {formatCOP(c.base_comisionable)}
                          </td>
                          <td className="p-3 text-sm text-right">
                            {fueAjustado && (
                              <span className="line-through text-muted-foreground mr-1">
                                {c.porcentaje_aplicado.toFixed(2)}%
                              </span>
                            )}
                            <span className={fueAjustado ? "text-orange-600 font-semibold" : ""}>
                              {porcentajeFinal.toFixed(2)}%
                            </span>
                          </td>
                          <td className="p-3 text-sm text-right font-bold text-green-600">
                            {fueAjustado && (
                              <span className="line-through text-muted-foreground mr-1">
                                {formatCOP(c.monto_comision)}
                              </span>
                            )}
                            <span className={fueAjustado ? "text-orange-600" : ""}>
                              {formatCOP(montoFinal)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${
                                c.estado === "pendiente"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : c.estado === "liquidado"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-green-100 text-green-700"
                              }`}
                            >
                              {c.estado}
                            </span>
                            {fueAjustado && (
                              <div className="text-xs text-orange-600 mt-1">✏️ Ajustado</div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {c.estado === "pendiente" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditDialog(c)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Editar
                              </Button>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* CONFIGURACIÓN */}
          <TabsContent value="configuracion" className="space-y-4">
            <Card className="p-4 bg-blue-50 border-blue-200">
              <p className="text-sm text-blue-900">
                <strong>Nota:</strong> Los cambios en porcentajes solo afectarán comisiones futuras.
                Las comisiones ya calculadas deben editarse manualmente en el reporte.
              </p>
            </Card>

            <div className="space-y-3">
              <h3 className="text-lg font-semibold mb-4">Configuración de Porcentajes</h3>
              {configs.map((config) => (
                <Card key={config.entregador} className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">{config.entregador}</h4>
                      <p className="text-sm text-muted-foreground">
                        Porcentaje de comisión actual
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue={config.porcentaje_comision}
                        className="w-24"
                        onBlur={(e) => {
                          const valor = parseFloat(e.target.value)
                          if (valor !== config.porcentaje_comision) {
                            handleUpdateConfig(config.entregador, valor)
                          }
                        }}
                      />
                      <span className="text-sm">%</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleUpdateConfig(
                            config.entregador,
                            parseFloat(
                              (document.querySelector(
                                `input[defaultValue="${config.porcentaje_comision}"]`
                              ) as HTMLInputElement)?.value || "0"
                            )
                          )
                        }
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </Card>

      {/* DIALOG PARA EDITAR COMISIÓN */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Comisión</DialogTitle>
            <DialogDescription>
              Ajusta el porcentaje o monto de comisión para {editingComision?.entregador}
            </DialogDescription>
          </DialogHeader>

          {editingComision && (
            <div className="space-y-4 py-4">
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Base comisionable:</span>
                  <span className="font-semibold">
                    {formatCOP(editingComision.base_comisionable)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Porcentaje original:</span>
                  <span>{editingComision.porcentaje_aplicado.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Monto original:</span>
                  <span>{formatCOP(editingComision.monto_comision)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="porcentaje">Nuevo Porcentaje (%)</Label>
                <Input
                  id="porcentaje"
                  type="number"
                  step="0.01"
                  value={editForm.porcentaje}
                  onChange={(e) => handlePorcentajeChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="monto">Nuevo Monto ($)</Label>
                <Input
                  id="monto"
                  type="number"
                  step="0.01"
                  value={editForm.monto}
                  onChange={(e) => handleMontoChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nota">Nota de ajuste (opcional)</Label>
                <Textarea
                  id="nota"
                  placeholder="Ej: Acuerdo especial del día, bonificación, etc."
                  value={editForm.nota}
                  onChange={(e) => setEditForm({ ...editForm, nota: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-green-900">Nuevo monto:</span>
                  <span className="text-xl font-bold text-green-600">
                    {formatCOP(editForm.monto)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit}>
              <Save className="h-4 w-4 mr-2" />
              Guardar Ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
