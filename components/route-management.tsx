"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Package, User, ChevronDown, ChevronRight, Download } from "lucide-react"
import { type RouteSheet, ENTREGADORES, type Entregador } from "@/lib/types"
import { cn } from "@/lib/utils"

interface RouteManagementProps {
  routeSheets: RouteSheet[]
  onUpdateRouteSheets: (sheets: RouteSheet[]) => void
}

export function RouteManagement({ routeSheets, onUpdateRouteSheets }: RouteManagementProps) {
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set())

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedRoutes)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedRoutes(newExpanded)
  }

  const updateRouteStatus = (id: string, estado: RouteSheet["estado"]) => {
    const updated = routeSheets.map((sheet) => (sheet.id === id ? { ...sheet, estado } : sheet))
    onUpdateRouteSheets(updated)
  }

  const assignDeliveryPerson = (id: string, entregador: Entregador) => {
    const updated = routeSheets.map((sheet) =>
      sheet.id === id ? { ...sheet, entregador, estado: "enrutado" as const } : sheet,
    )
    onUpdateRouteSheets(updated)
  }

  const exportRouteSheet = (sheet: RouteSheet) => {
    const headers = [
      "CATEGORIA",
      "CODIGO",
      "DESCRIPCION DEL PRODUCTO",
      "Columna1",
      "N",
      "CANTIDAD",
      "DEVOLUCION (NO TOCAR)",
      "VALOR UNIDAD",
    ]
    const rows = sheet.productos.map((p) => [
      p.categoria,
      p.codigo,
      p.descripcion,
      p.columna1 || "",
      p.n || "",
      p.cantidad,
      p.devolucion,
      p.valorUnidad,
    ])

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `planilla-${sheet.ruta}-${sheet.fecha}.csv`
    a.click()
  }

  const getStatusColor = (estado: RouteSheet["estado"]) => {
    const colors = {
      pendiente: "bg-muted text-muted-foreground",
      "en-bodega": "bg-secondary text-secondary-foreground",
      enrutado: "bg-accent text-accent-foreground",
      "en-entrega": "bg-primary text-primary-foreground",
      completado: "bg-chart-1 text-background",
    }
    return colors[estado]
  }

  const getStatusLabel = (estado: RouteSheet["estado"]) => {
    const labels = {
      pendiente: "Pendiente",
      "en-bodega": "En Bodega",
      enrutado: "Enrutado",
      "en-entrega": "En Entrega",
      completado: "Completado",
    }
    return labels[estado]
  }

  if (routeSheets.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No hay rutas disponibles</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Carga los archivos diarios para generar planillas por ruta
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Rutas</CardDescription>
            <CardTitle className="text-3xl">{routeSheets.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pendientes</CardDescription>
            <CardTitle className="text-3xl">{routeSheets.filter((s) => s.estado === "pendiente").length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>En Bodega</CardDescription>
            <CardTitle className="text-3xl">{routeSheets.filter((s) => s.estado === "en-bodega").length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Enrutadas</CardDescription>
            <CardTitle className="text-3xl">
              {routeSheets.filter((s) => s.estado === "enrutado" || s.estado === "en-entrega").length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Planillas por Ruta</CardTitle>
          <CardDescription>Gestiona el alistamiento y asignación de rutas a entregadores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {routeSheets.map((sheet) => (
              <div key={sheet.id} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between p-4">
                  <div className="flex flex-1 items-center gap-4">
                    <Button variant="ghost" size="sm" onClick={() => toggleExpanded(sheet.id)} className="h-8 w-8 p-0">
                      {expandedRoutes.has(sheet.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold">Ruta {sheet.ruta}</h4>
                        <Badge className={cn("text-xs", getStatusColor(sheet.estado))}>
                          {getStatusLabel(sheet.estado)}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{sheet.productos.length} productos</span>
                        <span>Total: ${sheet.total.toLocaleString()}</span>
                        <span>Fecha: {sheet.fecha}</span>
                        {sheet.entregador && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {sheet.entregador}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {sheet.estado === "pendiente" && (
                      <Button size="sm" variant="outline" onClick={() => updateRouteStatus(sheet.id, "en-bodega")}>
                        Iniciar Alistamiento
                      </Button>
                    )}
                    {sheet.estado === "en-bodega" && (
                      <Select onValueChange={(value) => assignDeliveryPerson(sheet.id, value as Entregador)}>
                        <SelectTrigger className="w-[160px]">
                          <SelectValue placeholder="Asignar a..." />
                        </SelectTrigger>
                        <SelectContent>
                          {ENTREGADORES.map((name) => (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => exportRouteSheet(sheet)}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {expandedRoutes.has(sheet.id) && (
                  <div className="border-t p-4">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Descripción</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Valor Unit.</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sheet.productos.map((producto, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{producto.codigo}</TableCell>
                            <TableCell>{producto.descripcion}</TableCell>
                            <TableCell>{producto.categoria}</TableCell>
                            <TableCell className="text-right">{producto.cantidad}</TableCell>
                            <TableCell className="text-right">${producto.valorUnidad.toLocaleString()}</TableCell>
                            <TableCell className="text-right font-medium">
                              ${(producto.cantidad * producto.valorUnidad).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
