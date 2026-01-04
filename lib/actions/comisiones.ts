"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Wallet, LogOut, Download, DollarSign, TrendingUp } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  getComisionesConfig,
  updateComisionConfig,
  getComisionesPorPeriodo,
  generarReporteComisiones,
  marcarComisionesPagadas,
} from "@/lib/actions/comisiones"
import type { Comision, ComisionConfig, ComisionReporte } from "@/lib/types"
import { useToast } from "@/hooks/use-toast"

interface ComisionesViewProps {
  onLogout: () => void
  userRole: "administrador" | "coordinador" | "caja"
  userId: string
}

export function ComisionesView({ onLogout, userRole, userId }: ComisionesViewProps) {
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState<"reporte" | "config">("reporte")
  const [configs, setConfigs] = useState<ComisionConfig[]>([])
  const [reportes, setReportes] = useState<ComisionReporte[]>([])
  const [comisiones, setComisiones] = useState<Comision[]>([])
  const [selectedComisiones, setSelectedComisiones] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  
  // ✅ NUEVO: Estado para entregadores dinámicos
  const [entregadores, setEntregadores] = useState<string[]>([])

  // Filtros
  const [entregadorFilter, setEntregadorFilter] = useState("all")
  const [fechaInicio, setFechaInicio] = useState(() => {
    const date = new Date()
    date.setDate(1) // Primer día del mes
    return date.toISOString().split("T")[0]
  })
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().split("T")[0])

  useEffect(() => {
    loadConfigs()
    loadReportes()
    loadEntregadores() // ✅ NUEVO: Cargar entregadores al inicio
  }, [])

  useEffect(() => {
    loadReportes()
  }, [fechaInicio, fechaFin, entregadorFilter])

  // ✅ NUEVO: Función para cargar entregadores desde BD
  const loadEntregadores = async () => {
    try {
      const response = await fetch('/api/entregadores')
      if (!response.ok) throw new Error('Error al cargar entregadores')
      
      const data = await response.json()
      const nombresEntregadores = data.entregadores.map((e: any) => e.nombre)
      
      setEntregadores(nombresEntregadores)
      console.log('📦 [COMISIONES] Entregadores cargados:', nombresEntregadores)
    } catch (error) {
      console.error('❌ [COMISIONES] Error cargando entregadores:', error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los entregadores",
        variant: "destructive",
      })
    }
  }

  const loadConfigs = async () => {
    try {
      const data = await getComisionesConfig()
      setConfigs(data)
    } catch (error) {
      console.error("Error loading configs:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar las configuraciones",
        variant: "destructive",
      })
    }
  }

  const loadReportes = async () => {
    try {
      setLoading(true)
      const [reportesData, comisionesData] = await Promise.all([
        generarReporteComisiones(fechaInicio, fechaFin, entregadorFilter),
        getComisionesPorPeriodo(fechaInicio, fechaFin, entregadorFilter),
      ])
      setReportes(reportesData)
      setComisiones(comisionesData)
    } catch (error) {
      console.error("Error loading reportes:", error)
      toast({
        title: "Error",
        description: "No se pudieron cargar los reportes",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateConfig = async (entregador: string, porcentaje: number) => {
    try {
      await updateComisionConfig(entregador, porcentaje)
      toast({
        title: "Actualizado",
        description: `Porcentaje de comisión actualizado para ${entregador}`,
      })
      loadConfigs()
    } catch (error) {
      console.error("Error updating config:", error)
      toast({
        title: "Error",
        description: "No se pudo actualizar la configuración",
        variant: "destructive",
      })
    }
  }

  const handleMarcarPagadas = async () => {
    if (selectedComisiones.size === 0) {
      toast({
        title: "Atención",
        description: "Selecciona al menos una comisión para marcar como pagada",
      })
      return
    }

    try {
      await marcarComisionesPagadas(Array.from(selectedComisiones), userId)
      toast({
        title: "Éxito",
        description: `${selectedComisiones.size} comisión(es) marcada(s) como pagada(s)`,
      })
      setSelectedComisiones(new Set())
      loadReportes()
    } catch (error) {
      console.error("Error marking paid:", error)
      toast({
        title: "Error",
        description: "No se pudieron marcar las comisiones como pagadas",
        variant: "destructive",
      })
    }
  }

  const exportarCSV = () => {
    const headers = [
      "Entregador",
      "Fecha",
      "Entregas",
      "Devoluciones",
      "Base Comisionable",
      "% Comisión",
      "Monto Comisión",
      "Estado",
    ]
    
    const rows = comisiones.map((c) => [
      c.entregador,
      c.fecha,
      Number(c.total_entregas_efectivas || 0).toFixed(2),
      Number(c.total_devoluciones || 0).toFixed(2),
      Number(c.base_comisionable || 0).toFixed(2),
      Number(c.porcentaje_aplicado || 0).toFixed(2) + "%",
      Number(c.monto_comision || 0).toFixed(2),
      c.estado,
    ])

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `comisiones_${fechaInicio}_${fechaFin}.csv`
    a.click()
    window.URL.revokeObjectURL(url)

    toast({
      title: "Exportado",
      description: "Reporte de comisiones descargado exitosamente",
    })
  }

  const exportarPDF = () => {
    // Generar recibo de pago en formato imprimible
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      toast({
        title: "Error",
        description: "No se pudo abrir la ventana de impresión. Verifica los permisos del navegador.",
        variant: "destructive"
      })
      return
    }

    const entregadorSeleccionado = entregadorFilter !== 'all' 
      ? reportes.find(r => r.entregador === entregadorFilter)
      : null

    const datosReporte = entregadorSeleccionado || {
      entregador: "Todos los Entregadores",
      total_entregas: reportes.reduce((sum, r) => sum + r.total_entregas, 0),
      total_devoluciones: reportes.reduce((sum, r) => sum + r.total_devoluciones, 0),
      base_comisionable: reportes.reduce((sum, r) => sum + r.base_comisionable, 0),
      monto_comision: reportes.reduce((sum, r) => sum + r.monto_comision, 0),
      dias_trabajados: reportes.reduce((sum, r) => sum + r.dias_trabajados, 0),
    }

    const comisionesFiltradas = entregadorFilter !== 'all'
      ? comisiones.filter(c => c.entregador === entregadorFilter)
      : comisiones

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Recibo de Comisiones - ${datosReporte.entregador}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Arial', sans-serif; 
            padding: 40px;
            background: white;
            color: #333;
          }
          .header {
            border-bottom: 3px solid #8b5cf6;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .header h1 {
            color: #8b5cf6;
            font-size: 28px;
            margin-bottom: 5px;
          }
          .header p {
            color: #666;
            font-size: 14px;
          }
          .info-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
            padding: 20px;
            background: #f9fafb;
            border-radius: 8px;
          }
          .info-item {
            display: flex;
            flex-direction: column;
          }
          .info-label {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 5px;
          }
          .info-value {
            font-size: 16px;
            color: #111827;
            font-weight: 500;
          }
          .summary {
            background: linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%);
            color: white;
            padding: 25px;
            border-radius: 12px;
            margin-bottom: 30px;
          }
          .summary h2 {
            font-size: 16px;
            margin-bottom: 15px;
            opacity: 0.9;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 20px;
          }
          .summary-item {
            text-align: center;
          }
          .summary-label {
            font-size: 11px;
            opacity: 0.8;
            margin-bottom: 5px;
          }
          .summary-value {
            font-size: 20px;
            font-weight: bold;
          }
          .total-section {
            background: #fef3c7;
            border: 2px solid #fbbf24;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 30px;
            text-align: center;
          }
          .total-label {
            font-size: 14px;
            color: #92400e;
            margin-bottom: 10px;
          }
          .total-amount {
            font-size: 36px;
            font-weight: bold;
            color: #92400e;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
          }
          thead {
            background: #f3f4f6;
          }
          th {
            padding: 12px;
            text-align: left;
            font-size: 12px;
            font-weight: 600;
            color: #374151;
            text-transform: uppercase;
            border-bottom: 2px solid #e5e7eb;
          }
          td {
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 14px;
          }
          tr:hover {
            background: #f9fafb;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .text-green { color: #059669; }
          .text-red { color: #dc2626; }
          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
          }
          .badge-pendiente {
            background: #fef3c7;
            color: #92400e;
          }
          .badge-pagado {
            background: #d1fae5;
            color: #065f46;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 12px;
          }
          .formula {
            background: #f0fdf4;
            border-left: 4px solid #059669;
            padding: 15px;
            margin: 20px 0;
            font-size: 13px;
          }
          .formula strong {
            color: #059669;
          }
          @media print {
            body { padding: 20px; }
            .summary { break-inside: avoid; }
            table { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>RECIBO DE COMISIONES</h1>
          <p>Reporte detallado de comisiones por entregas</p>
        </div>

        <div class="info-section">
          <div class="info-item">
            <span class="info-label">Entregador</span>
            <span class="info-value">${datosReporte.entregador}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Período</span>
            <span class="info-value">${new Date(fechaInicio).toLocaleDateString('es-CO')} - ${new Date(fechaFin).toLocaleDateString('es-CO')}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Fecha de Emisión</span>
            <span class="info-value">${new Date().toLocaleDateString('es-CO', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            })}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Días Trabajados</span>
            <span class="info-value">${datosReporte.dias_trabajados || 0} días</span>
          </div>
        </div>

        <div class="formula">
          <strong>Fórmula de Cálculo:</strong> Base Comisionable = Total Entregas (antes de IVA) - Devoluciones | 
          Comisión = Base Comisionable × Porcentaje
        </div>

        <div class="summary">
          <h2>Resumen Financiero</h2>
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Total Entregas</div>
              <div class="summary-value">${formatCOP(datosReporte.total_entregas || 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Devoluciones</div>
              <div class="summary-value">-${formatCOP(datosReporte.total_devoluciones || 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Base Comisionable</div>
              <div class="summary-value">${formatCOP(datosReporte.base_comisionable || 0)}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Comisión Total</div>
              <div class="summary-value">${formatCOP(datosReporte.monto_comision || 0)}</div>
            </div>
          </div>
        </div>

        <div class="total-section">
          <div class="total-label">TOTAL A PAGAR</div>
          <div class="total-amount">${formatCOP(datosReporte.monto_comision || 0)}</div>
        </div>

        <h3 style="margin-bottom: 15px; color: #374151;">Detalle de Comisiones por Día</h3>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th class="text-right">Entregas</th>
              <th class="text-right">Devoluciones</th>
              <th class="text-right">Base</th>
              <th class="text-center">%</th>
              <th class="text-right">Comisión</th>
              <th class="text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${comisionesFiltradas.map(c => `
              <tr>
                <td>${new Date(c.fecha).toLocaleDateString('es-CO')}</td>
                <td class="text-right text-green">${formatCOP(Number(c.total_entregas_efectivas || 0))}</td>
                <td class="text-right text-red">-${formatCOP(Number(c.total_devoluciones || 0))}</td>
                <td class="text-right">${formatCOP(Number(c.base_comisionable || 0))}</td>
                <td class="text-center">${Number(c.porcentaje_aplicado || 0).toFixed(2)}%</td>
                <td class="text-right" style="font-weight: bold; color: #8b5cf6;">${formatCOP(Number(c.monto_comision || 0))}</td>
                <td class="text-center">
                  <span class="badge badge-${c.estado}">${c.estado}</span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <p>Este documento es un comprobante de comisiones generado automáticamente.</p>
          <p>Sistema de Gestión Logística - ${new Date().getFullYear()}</p>
        </div>

        <script>
          window.onload = () => {
            window.print();
          }
        </script>
      </body>
      </html>
    `

    printWindow.document.write(htmlContent)
    printWindow.document.close()
  }

  // ✅ ELIMINADA la línea hardcodeada:
  // const entregadores = ["Alfonso", "Miguel", "Carlos", "Mateo"]
  
  const totalGeneral = reportes.reduce((sum, r) => sum + r.monto_comision, 0)

  return (
    <>
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500">
                <Wallet className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold">Comisiones</h1>
                <p className="text-xs text-muted-foreground">Gestión de comisiones de entregadores</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 sm:py-8 max-w-7xl">
        <div className="space-y-4 sm:space-y-6">
          {/* Tabs */}
          <div className="flex gap-2 border-b">
            <button
              onClick={() => setActiveTab("reporte")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "reporte"
                  ? "border-purple-500 text-purple-600"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Reporte de Comisiones
            </button>
            {userRole === "administrador" && (
              <button
                onClick={() => setActiveTab("config")}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "config"
                    ? "border-purple-500 text-purple-600"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Configuración
              </button>
            )}
          </div>

          {activeTab === "reporte" && (
            <>
              {/* Filtros */}
              <Card className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                  <div className="flex-1 w-full sm:w-auto">
                    <label className="text-sm font-medium mb-2 block">Fecha Inicio</label>
                    <Input
                      type="date"
                      value={fechaInicio}
                      onChange={(e) => setFechaInicio(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="flex-1 w-full sm:w-auto">
                    <label className="text-sm font-medium mb-2 block">Fecha Fin</label>
                    <Input
                      type="date"
                      value={fechaFin}
                      onChange={(e) => setFechaFin(e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="flex-1 w-full sm:w-auto">
                    <label className="text-sm font-medium mb-2 block">Entregador</label>
                    <Select value={entregadorFilter} onValueChange={setEntregadorFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Todos" />
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
                  <Button onClick={exportarCSV} variant="outline" className="w-full sm:w-auto bg-transparent">
                    <Download className="h-4 w-4 mr-2" />
                    Exportar CSV
                  </Button>
                  <Button onClick={exportarPDF} className="w-full sm:w-auto">
                    <Download className="h-4 w-4 mr-2" />
                    Recibo PDF
                  </Button>
                </div>
              </Card>

              {/* Resumen */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {reportes.map((reporte) => (
                  <Card key={reporte.entregador} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold">{reporte.entregador}</p>
                      <TrendingUp className="h-4 w-4 text-green-500" />
                    </div>
                    <p className="text-2xl font-bold text-purple-600">{formatCOP(reporte.monto_comision)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{reporte.dias_trabajados} día(s) trabajado(s)</p>
                    <div className="mt-3 pt-3 border-t text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Entregas:</span>
                        <span className="font-medium">{formatCOP(reporte.total_entregas)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Devoluciones:</span>
                        <span className="font-medium text-red-600">-{formatCOP(reporte.total_devoluciones)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>Base:</span>
                        <span>{formatCOP(reporte.base_comisionable)}</span>
                      </div>
                    </div>
                  </Card>
                ))}

                <Card className="p-4 bg-purple-50 border-purple-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-purple-700">Total General</p>
                    <DollarSign className="h-4 w-4 text-purple-500" />
                  </div>
                  <p className="text-2xl font-bold text-purple-600">{formatCOP(totalGeneral)}</p>
                  <p className="text-xs text-purple-600 mt-1">Suma de todas las comisiones</p>
                </Card>
              </div>

              {/* Tabla detallada */}
              <Card className="p-4 sm:p-6 overflow-x-auto">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
                  <h2 className="text-lg font-semibold">Detalle de Comisiones</h2>
                  {selectedComisiones.size > 0 && (
                    <Button onClick={handleMarcarPagadas} size="sm" className="w-full sm:w-auto">
                      Marcar como Pagadas ({selectedComisiones.size})
                    </Button>
                  )}
                </div>

                <div className="min-w-full overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]"></TableHead>
                        <TableHead>Entregador</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Entregas</TableHead>
                        <TableHead className="text-right">Devoluciones</TableHead>
                        <TableHead className="text-right">Base</TableHead>
                        <TableHead className="text-right">%</TableHead>
                        <TableHead className="text-right">Comisión</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comisiones.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            No hay comisiones para el período seleccionado
                          </TableCell>
                        </TableRow>
                      ) : (
                        comisiones.map((comision) => (
                          <TableRow key={comision.id}>
                            <TableCell>
                              {comision.estado === "pendiente" && (
                                <Checkbox
                                  checked={selectedComisiones.has(comision.id)}
                                  onCheckedChange={(checked) => {
                                    const newSet = new Set(selectedComisiones)
                                    if (checked) {
                                      newSet.add(comision.id)
                                    } else {
                                      newSet.delete(comision.id)
                                    }
                                    setSelectedComisiones(newSet)
                                  }}
                                />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{comision.entregador}</TableCell>
                            <TableCell>{new Date(comision.fecha).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">{formatCOP(comision.total_entregas_efectivas)}</TableCell>
                            <TableCell className="text-right text-red-600">
                              -{formatCOP(comision.total_devoluciones)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCOP(comision.base_comisionable)}
                            </TableCell>
                            <TableCell className="text-right">{comision.porcentaje_aplicado}%</TableCell>
                            <TableCell className="text-right font-bold text-purple-600">
                              {formatCOP(comision.monto_comision)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={comision.estado === "pagado" ? "default" : "secondary"}>
                                {comision.estado}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          )}

          {activeTab === "config" && userRole === "administrador" && (
            <Card className="p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-4">Configuración de Porcentajes</h2>
              <div className="space-y-4">
                {configs.map((config) => (
                  <div
                    key={config.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-semibold">{config.entregador}</p>
                      <p className="text-sm text-muted-foreground">Porcentaje de comisión actual</p>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={config.porcentaje_comision}
                        onChange={(e) => {
                          const newConfigs = configs.map((c) =>
                            c.id === config.id ? { ...c, porcentaje_comision: Number.parseFloat(e.target.value) } : c,
                          )
                          setConfigs(newConfigs)
                        }}
                        className="w-24"
                      />
                      <span className="text-sm font-medium">%</span>
                      <Button
                        size="sm"
                        onClick={() => handleUpdateConfig(config.entregador, config.porcentaje_comision)}
                        className="w-full sm:w-auto"
                      >
                        Guardar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </main>
    </>
  )
}
