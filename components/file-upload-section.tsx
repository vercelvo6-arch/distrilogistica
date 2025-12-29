"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react"
import { parseNurturingCSV, parsePlanillaCSV, generateOrdersFromSales, generateRouteSheets } from "@/lib/csv-parser"
import type { RouteSheet, SalesRecord, Product } from "@/lib/types"

interface FileUploadSectionProps {
  onDataLoaded: (sheets: RouteSheet[], sales: SalesRecord[], catalog: Product[]) => void
}

export function FileUploadSection({ onDataLoaded }: FileUploadSectionProps) {
  const [nurturingFile, setNurturingFile] = useState<File | null>(null)
  const [inventarioFile, setInventarioFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [fecha, setFecha] = useState(new Date().toISOString().split("T")[0])

  const handleProcessFiles = async () => {
    if (!nurturingFile || !inventarioFile) {
      setMessage({ type: "error", text: "Por favor selecciona ambos archivos (NURTURING e INVENTARIO)" })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const nurturingText = await nurturingFile.text()
      const inventarioText = await inventarioFile.text()

      const salesData = parseNurturingCSV(nurturingText)
      const productCatalog = parsePlanillaCSV(inventarioText)

      if (salesData.length === 0) {
        setMessage({ type: "error", text: "No se encontraron ventas en el archivo NURTURING" })
        setLoading(false)
        return
      }

      if (productCatalog.length === 0) {
        setMessage({ type: "error", text: "No se encontraron productos en el INVENTARIO" })
        setLoading(false)
        return
      }

      const orders = generateOrdersFromSales(salesData, productCatalog, fecha)
      const routeSheets = generateRouteSheets(orders)

      onDataLoaded(routeSheets, salesData, productCatalog)
      setMessage({
        type: "success",
        text: `Procesado exitosamente: ${routeSheets.length} rutas con ${orders.length} pedidos generados`,
      })
    } catch (error) {
      setMessage({ type: "error", text: "Error al procesar los archivos. Verifica el formato." })
      console.error("[v0] Error processing files:", error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-accent" />
            Cargar Archivos Diarios
          </CardTitle>
          <CardDescription>
            Sube el NURTURING DIARIO (ventas) y el INVENTARIO GENERAL para generar los pedidos por ruta automáticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha de Procesamiento</Label>
            <Input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nurturing" className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-chart-1" />
              NURTURING DIARIO - Ventas del Día Anterior (CSV)
            </Label>
            <Input
              id="nurturing"
              type="file"
              accept=".csv"
              onChange={(e) => setNurturingFile(e.target.files?.[0] || null)}
            />
            {nurturingFile && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-chart-1" />
                {nurturingFile.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventario" className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-chart-2" />
              INVENTARIO GENERAL - Catálogo de Productos (CSV)
            </Label>
            <Input
              id="inventario"
              type="file"
              accept=".csv"
              onChange={(e) => setInventarioFile(e.target.files?.[0] || null)}
            />
            {inventarioFile && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-chart-2" />
                {inventarioFile.name}
              </p>
            )}
          </div>

          <Button
            onClick={handleProcessFiles}
            disabled={!nurturingFile || !inventarioFile || loading}
            className="w-full"
            size="lg"
          >
            {loading ? "Procesando..." : "Generar Pedidos y Planillas"}
          </Button>

          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              {message.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flujo del Proceso</CardTitle>
          <CardDescription>Cómo funciona el sistema de gestión</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4">
            <li className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chart-1 text-xs font-semibold text-background">
                1
              </div>
              <div>
                <p className="font-medium">Carga Diaria de Datos</p>
                <p className="text-sm text-muted-foreground">
                  Importa NURTURING (ventas) e INVENTARIO (catálogo de productos)
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chart-2 text-xs font-semibold text-background">
                2
              </div>
              <div>
                <p className="font-medium">Generación Automática</p>
                <p className="text-sm text-muted-foreground">
                  El sistema hace MATCH entre códigos y genera pedidos por cliente y ruta
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chart-3 text-xs font-semibold text-background">
                3
              </div>
              <div>
                <p className="font-medium">Alistamiento en Bodega</p>
                <p className="text-sm text-muted-foreground">
                  Visualiza y filtra pedidos por ruta para preparar entregas
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chart-4 text-xs font-semibold text-background">
                4
              </div>
              <div>
                <p className="font-medium">Asignación a Entregadores</p>
                <p className="text-sm text-muted-foreground">Asigna rutas a: Alfonso, Miguel, Carlos o Mateo</p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chart-5 text-xs font-semibold text-background">
                5
              </div>
              <div>
                <p className="font-medium">Seguimiento de Entregas</p>
                <p className="text-sm text-muted-foreground">Control de estados: Entregado, Devolución, Abono, Fiado</p>
              </div>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
