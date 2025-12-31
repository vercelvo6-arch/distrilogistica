"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { User, Upload, FileSpreadsheet, LogOut, Truck } from "lucide-react"
import { parseNurturingCSV, parsePlanillaCSV, generateOrdersFromSales, generateRouteSheets } from "@/lib/csv-parser"
import type { RouteSheet, Entregador, User as UserType } from "@/lib/types"
import { ENTREGADORES } from "@/lib/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getDB } from "@/lib/db"

interface CoordinadorViewProps {
  onLogout: () => void
  user: UserType
}

export function CoordinadorView({ onLogout, user }: CoordinadorViewProps) {
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [nurturingFile, setNurturingFile] = useState<File | null>(null)
  const [planillaFile, setPlanillaFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPlanillas()
  }, [])

  async function loadPlanillas() {
    console.log("[COORD-LOAD] Iniciando carga de planillas...")
    try {
      const response = await fetch('/api/planillas', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      console.log("[COORD-LOAD] Response status:", response.status)
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error("[COORD-LOAD] Error response:", errorData)
        throw new Error('Error al cargar planillas')
      }
      
      const data = await response.json()
      console.log("[COORD-LOAD] Data recibida:", data)
      console.log("[COORD-LOAD] Número de planillas:", data.planillas?.length || 0)
      
      if (data.planillas && data.planillas.length > 0) {
        console.log("[COORD-LOAD] Primera planilla:", data.planillas[0])
      }
      
      // Transformar datos del API al formato RouteSheet
      const planillas: RouteSheet[] = (data.planillas || []).map((p: any) => {
        const sheet = {
          id: p.id,
          ruta: p.tipo_ruta,
          fecha: p.fecha,
          entregador: p.entregador,
          estado: p.estado,
          totalOrders: p.pedidos?.length || 0,
          totalAmount: Number(p.total_cargue) || 0,
          montoCargue: Number(p.total_cargue) || 0,
          montoEntregado: Number(p.total_entregado) || 0,
          montoFiado: Number(p.total_fiado) || 0,
          montoDevoluciones: Number(p.total_devolucion) || 0,
          montoRepasos: Number(p.total_repaso) || 0,
          orders: (p.pedidos || []).map((ped: any) => ({
            id: ped.id,
            cliente: ped.cliente,
            ruta: p.tipo_ruta,
            fecha: p.fecha,
            estado: ped.estado,
            total: Number(ped.total) || 0,
            montoPagado: 0,
            saldoPendiente: Number(ped.total) || 0,
            comentarios: ped.observaciones,
            items: (ped.productos || []).map((prod: any) => ({
              codigo: prod.codigo,
              descripcion: prod.nombre,
              categoria: '',
              cantidad: Number(prod.cantidad) || 0,
              valorUnidad: Number(prod.precio_unitario) || 0,
              subtotal: Number(prod.total) || 0,
            })),
          })),
          cuentasPorCobrar: [],
        }
        console.log("[COORD-LOAD] Planilla transformada:", sheet.id, "Ruta:", sheet.ruta, "Pedidos:", sheet.totalOrders)
        return sheet
      })
      
      console.log("[COORD-LOAD] ✓ Total planillas transformadas:", planillas.length)
      setRouteSheets(planillas)
    } catch (err) {
      console.error("[COORD-LOAD] ❌ Error loading planillas:", err)
      setError("Error al cargar planillas: " + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleNurturingUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setNurturingFile(e.target.files[0])
      setError(null)
    }
  }

  const handlePlanillaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setPlanillaFile(e.target.files[0])
      setError(null)
    }
  }

  const handleGeneratePlanillas = async () => {
    if (!nurturingFile || !planillaFile) {
      setError("Por favor cargue ambos archivos")
      return
    }

    setIsProcessing(true)
    setError(null)

    try {
      console.log("[COORD] 1. Leyendo archivos...")
      const nurturingText = await nurturingFile.text()
      const planillaText = await planillaFile.text()

      console.log("[COORD] 2. Parseando CSVs...")
      const sales = parseNurturingCSV(nurturingText)
      const products = parsePlanillaCSV(planillaText)

      if (sales.length === 0) {
        setError("No se encontraron ventas en el archivo NURTURING")
        setIsProcessing(false)
        return
      }

      if (products.length === 0) {
        setError("No se encontró inventario en el archivo PLANILLA")
        setIsProcessing(false)
        return
      }

      console.log("[COORD] 3. Generando órdenes...")
      const fecha = new Date().toISOString().split("T")[0]
      const orders = generateOrdersFromSales(sales, products, fecha)
      
      console.log("[COORD] 4. Generando planillas...")
      const sheets = generateRouteSheets(orders)
      
      console.log("[COORD] 5. Planillas generadas:", sheets.length)
      console.log("[COORD] 6. Primera planilla:", sheets[0])

      console.log("[COORD] 7. Llamando a API /planillas...")
      const response = await fetch('/api/planillas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeSheets: sheets })
      })

      console.log("[COORD] 7.1. Response status:", response.status)
      
      const result = await response.json()
      console.log("[COORD] 8. Resultado completo:", JSON.stringify(result, null, 2))

      if (!response.ok) {
        console.error("[COORD] 8.1. Response not OK:", result)
        throw new Error(result.error || 'Error al crear planillas')
      }

      if (result.errors && result.errors.length > 0) {
        console.warn("[COORD] 8.2. Hubo errores durante la inserción:", result.errors)
      }

      console.log("[COORD] 9. Esperando 2 segundos antes de recargar...")
      await new Promise(resolve => setTimeout(resolve, 2000))

      console.log("[COORD] 10. Recargando planillas...")
      await loadPlanillas()

      console.log("[COORD] 11. ✓ TODO COMPLETADO")
      setIsProcessing(false)
      
    } catch (err) {
      console.error("[COORD] ❌ ERROR en proceso:", err)
      console.error("[COORD] Stack trace:", err instanceof Error ? err.stack : 'No stack')
      console.error("[COORD] Error message:", err instanceof Error ? err.message : String(err))
      setError("Error al procesar los archivos: " + (err as Error).message)
      setIsProcessing(false)
    }
  }

  const handleAssignEntregador = async (sheetId: string, entregador: Entregador) => {
    try {
      const sql = getDB()
      await sql`UPDATE planillas SET entregador = ${entregador} WHERE id = ${sheetId}`

      const updated = routeSheets.map((s) =>
        s.id === sheetId
          ? {
              ...s,
              entregador,
              orders: s.orders.map((order) => ({ ...order, entregador })),
            }
          : s,
      )
      setRouteSheets(updated)
    } catch (err) {
      setError("Error al asignar entregador: " + (err as Error).message)
    }
  }

  const allRoutesAssigned = routeSheets.length > 0 && routeSheets.every((s) => s.entregador)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <>
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-blue-500">
                <User className="h-4 w-4 md:h-5 md:w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base md:text-xl font-bold">Coordinador Logístico</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Generación y asignación de planillas diarias
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 md:px-4 py-4 md:py-8 max-w-5xl">
        <div className="space-y-4 md:space-y-6">
          <Card className="p-4 md:p-6">
            <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4 md:h-5 md:w-5" />
              Carga de Archivos Diarios
            </h2>

            <div className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">NURTURING - Ventas del Día Anterior (CSV)</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleNurturingUpload}
                  className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {nurturingFile && <p className="text-sm text-muted-foreground mt-1">✓ {nurturingFile.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  INVENTARIO GENERAL - Catálogo de Productos (CSV)
                </label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handlePlanillaUpload}
                  className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {planillaFile && <p className="text-sm text-muted-foreground mt-1">✓ {planillaFile.name}</p>}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                onClick={handleGeneratePlanillas}
                disabled={!nurturingFile || !planillaFile || isProcessing}
                className="w-full"
                size="lg"
              >
                <FileSpreadsheet className="h-4 w-4 md:h-5 md:w-5 mr-2" />
                {isProcessing ? "Procesando..." : "Generar Planillas por Ruta"}
              </Button>
            </div>
          </Card>

          {routeSheets.length > 0 && (
            <Card className="p-4 md:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
                  <Truck className="h-4 w-4 md:h-5 md:w-5" />
                  Asignación de Entregadores ({routeSheets.length} rutas)
                </h2>
                {allRoutesAssigned && (
                  <span className="text-xs md:text-sm px-3 py-1 bg-green-100 text-green-700 rounded-full font-medium w-fit">
                    ✓ Todas las rutas asignadas
                  </span>
                )}
              </div>

              {!allRoutesAssigned && (
                <Alert className="mb-4 bg-amber-50 border-amber-200">
                  <AlertDescription className="text-sm text-amber-800">
                    Asigne un entregador a cada ruta antes de que el alistador pueda comenzar la preparación
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                {routeSheets.map((sheet) => (
                  <div
                    key={sheet.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 md:p-4 border rounded-lg bg-muted/50"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm md:text-base">Ruta {sheet.ruta}</p>
                      <p className="text-xs md:text-sm text-muted-foreground">
                        {sheet.totalOrders} pedidos · {formatCOP(sheet.totalAmount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                      <Select
                        value={sheet.entregador || ""}
                        onValueChange={(value) => handleAssignEntregador(sheet.id, value as Entregador)}
                      >
                        <SelectTrigger className="w-full sm:w-[180px]">
                          <SelectValue placeholder="Seleccionar entregador" />
                        </SelectTrigger>
                        <SelectContent>
                          {ENTREGADORES.map((entregador) => (
                            <SelectItem key={entregador} value={entregador}>
                              {entregador}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span
                        className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                          sheet.entregador ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {sheet.entregador ? "Asignado" : "Sin asignar"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {routeSheets.length === 0 && !loading && (
            <Card className="p-8 text-center">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay planillas generadas</h3>
              <p className="text-sm text-muted-foreground">
                Cargue los archivos CSV y genere las planillas para comenzar
              </p>
            </Card>
          )}
        </div>
      </main>
    </>
  )
}
