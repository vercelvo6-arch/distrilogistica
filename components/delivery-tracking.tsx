"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Truck, User, CheckCircle2, XCircle, DollarSign, Clock } from "lucide-react"
import { type RouteSheet, ENTREGADORES } from "@/lib/types"
import { cn } from "@/lib/utils"

interface DeliveryTrackingProps {
  routeSheets: RouteSheet[]
  onUpdateRouteSheets: (sheets: RouteSheet[]) => void
}

type DeliveryStatus = "entregado" | "devolucion" | "abono" | "fiado"

export function DeliveryTracking({ routeSheets, onUpdateRouteSheets }: DeliveryTrackingProps) {
  const [selectedDeliveryPerson, setSelectedDeliveryPerson] = useState<string>("all")
  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, DeliveryStatus>>({})

  const assignedRoutes = routeSheets.filter((sheet) => sheet.entregador)

  const filteredRoutes =
    selectedDeliveryPerson === "all"
      ? assignedRoutes
      : assignedRoutes.filter((sheet) => sheet.entregador === selectedDeliveryPerson)

  const updateDeliveryStatus = (routeId: string, status: DeliveryStatus) => {
    setDeliveryStatuses((prev) => ({ ...prev, [routeId]: status }))

    if (status === "entregado") {
      const updated = routeSheets.map((sheet) =>
        sheet.id === routeId ? { ...sheet, estado: "completado" as const } : sheet,
      )
      onUpdateRouteSheets(updated)
    } else {
      const updated = routeSheets.map((sheet) =>
        sheet.id === routeId ? { ...sheet, estado: "en-entrega" as const } : sheet,
      )
      onUpdateRouteSheets(updated)
    }
  }

  const getStatusIcon = (status?: DeliveryStatus) => {
    if (!status) return <Clock className="h-4 w-4" />
    const icons = {
      entregado: <CheckCircle2 className="h-4 w-4 text-chart-1" />,
      devolucion: <XCircle className="h-4 w-4 text-destructive" />,
      abono: <DollarSign className="h-4 w-4 text-accent" />,
      fiado: <Clock className="h-4 w-4 text-muted-foreground" />,
    }
    return icons[status]
  }

  const getStatusLabel = (status?: DeliveryStatus) => {
    if (!status) return "Pendiente"
    const labels = {
      entregado: "Entregado",
      devolucion: "Devolución",
      abono: "Abono",
      fiado: "Fiado",
    }
    return labels[status]
  }

  const getStatusColor = (status?: DeliveryStatus) => {
    if (!status) return "bg-muted text-muted-foreground"
    const colors = {
      entregado: "bg-chart-1 text-background",
      devolucion: "bg-destructive text-destructive-foreground",
      abono: "bg-accent text-accent-foreground",
      fiado: "bg-secondary text-secondary-foreground",
    }
    return colors[status]
  }

  if (assignedRoutes.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Truck className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No hay entregas asignadas</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Asigna rutas a entregadores desde la sección de Gestión de Rutas
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Seguimiento de Entregas</CardTitle>
              <CardDescription>Actualiza el estado de cada entrega en tiempo real</CardDescription>
            </div>
            <Select value={selectedDeliveryPerson} onValueChange={setSelectedDeliveryPerson}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filtrar por entregador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los entregadores</SelectItem>
                {ENTREGADORES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredRoutes.map((sheet) => (
          <Card key={sheet.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">Ruta {sheet.ruta}</CardTitle>
                  <CardDescription className="mt-1 flex items-center gap-2">
                    <User className="h-3 w-3" />
                    {sheet.entregador}
                  </CardDescription>
                </div>
                <Badge className={cn("text-xs", getStatusColor(deliveryStatuses[sheet.id]))}>
                  {getStatusLabel(deliveryStatuses[sheet.id])}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 rounded-lg bg-muted p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Productos:</span>
                  <span className="font-medium">{sheet.productos.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-semibold">${sheet.total.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Fecha:</span>
                  <span className="font-medium">{sheet.fecha}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Actualizar Estado:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant={deliveryStatuses[sheet.id] === "entregado" ? "default" : "outline"}
                    onClick={() => updateDeliveryStatus(sheet.id, "entregado")}
                    className="gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Entregado
                  </Button>
                  <Button
                    size="sm"
                    variant={deliveryStatuses[sheet.id] === "devolucion" ? "default" : "outline"}
                    onClick={() => updateDeliveryStatus(sheet.id, "devolucion")}
                    className="gap-2"
                  >
                    <XCircle className="h-4 w-4" />
                    Devolución
                  </Button>
                  <Button
                    size="sm"
                    variant={deliveryStatuses[sheet.id] === "abono" ? "default" : "outline"}
                    onClick={() => updateDeliveryStatus(sheet.id, "abono")}
                    className="gap-2"
                  >
                    <DollarSign className="h-4 w-4" />
                    Abono
                  </Button>
                  <Button
                    size="sm"
                    variant={deliveryStatuses[sheet.id] === "fiado" ? "default" : "outline"}
                    onClick={() => updateDeliveryStatus(sheet.id, "fiado")}
                    className="gap-2"
                  >
                    <Clock className="h-4 w-4" />
                    Fiado
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
