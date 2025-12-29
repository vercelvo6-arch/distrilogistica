"use client"

import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Package, Search, ChevronDown, ChevronRight, User, Download } from "lucide-react"
import { type Order, type RouteSheet, ENTREGADORES, type Entregador } from "@/lib/types"
import { cn } from "@/lib/utils"

interface OrdersViewProps {
  routeSheets: RouteSheet[]
  onUpdateRouteSheets: (sheets: RouteSheet[]) => void
}

export function OrdersView({ routeSheets, onUpdateRouteSheets }: OrdersViewProps) {
  const [selectedRoute, setSelectedRoute] = useState<string>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set())

  const allOrders = useMemo(() => {
    return routeSheets.flatMap((sheet) => sheet.orders)
  }, [routeSheets])

  const filteredOrders = useMemo(() => {
    let orders = allOrders

    if (selectedRoute !== "all") {
      orders = orders.filter((order) => order.ruta === selectedRoute)
    }

    if (searchTerm) {
      orders = orders.filter(
        (order) =>
          order.cliente.toLowerCase().includes(searchTerm.toLowerCase()) ||
          order.ruta.includes(searchTerm) ||
          order.items.some((item) => item.descripcion.toLowerCase().includes(searchTerm.toLowerCase())),
      )
    }

    return orders
  }, [allOrders, selectedRoute, searchTerm])

  const routes = useMemo(() => {
    const uniqueRoutes = new Set(allOrders.map((o) => o.ruta))
    return Array.from(uniqueRoutes).sort()
  }, [allOrders])

  const toggleExpanded = (orderId: string) => {
    const newExpanded = new Set(expandedOrders)
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId)
    } else {
      newExpanded.add(orderId)
    }
    setExpandedOrders(newExpanded)
  }

  const updateOrderStatus = (orderId: string, estado: Order["estado"]) => {
    const updated = routeSheets.map((sheet) => ({
      ...sheet,
      orders: sheet.orders.map((order) => (order.id === orderId ? { ...order, estado } : order)),
    }))
    onUpdateRouteSheets(updated)
  }

  const assignDeliveryPerson = (routeId: string, entregador: Entregador) => {
    const updated = routeSheets.map((sheet) =>
      sheet.id === routeId ? { ...sheet, entregador, estado: "enrutado" as const } : sheet,
    )
    onUpdateRouteSheets(updated)
  }

  const exportOrder = (order: Order) => {
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
    const rows = order.items.map((item) => [
      item.categoria,
      item.codigo,
      item.descripcion,
      "",
      "",
      item.cantidad,
      "",
      item.valorUnidad,
    ])

    const csv = [headers, ...rows].map((row) => row.join(";")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pedido-${order.cliente}-ruta-${order.ruta}.csv`
    a.click()
  }

  const getStatusColor = (estado: Order["estado"]) => {
    const colors = {
      pendiente: "bg-muted text-muted-foreground",
      entregado: "bg-chart-1 text-background",
      devolucion: "bg-destructive text-destructive-foreground",
      abono: "bg-chart-4 text-background",
      fiado: "bg-chart-2 text-background",
    }
    return colors[estado]
  }

  const getStatusLabel = (estado: Order["estado"]) => {
    const labels = {
      pendiente: "Pendiente",
      entregado: "Entregado",
      devolucion: "Devolución",
      abono: "Abono",
      fiado: "Fiado",
    }
    return labels[estado]
  }

  if (allOrders.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No hay pedidos disponibles</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Carga los archivos diarios para generar pedidos por ruta
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Pedidos</CardDescription>
            <CardTitle className="text-3xl">{allOrders.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Pendientes</CardDescription>
            <CardTitle className="text-3xl">{allOrders.filter((o) => o.estado === "pendiente").length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Entregados</CardDescription>
            <CardTitle className="text-3xl">{allOrders.filter((o) => o.estado === "entregado").length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Total Rutas</CardDescription>
            <CardTitle className="text-3xl">{routes.length}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Pedidos por Cliente</CardTitle>
              <CardDescription>Vista detallada de cada pedido ordenado y filtrable por ruta</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente o producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-full sm:w-[240px]"
                />
              </div>
              <Select value={selectedRoute} onValueChange={setSelectedRoute}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Filtrar por ruta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las rutas</SelectItem>
                  {routes.map((route) => (
                    <SelectItem key={route} value={route}>
                      Ruta {route}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {filteredOrders.map((order) => {
              const sheet = routeSheets.find((s) => s.orders.some((o) => o.id === order.id))

              return (
                <div key={order.id} className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between p-4">
                    <div className="flex flex-1 items-center gap-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(order.id)}
                        className="h-8 w-8 p-0"
                      >
                        {expandedOrders.has(order.id) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold">{order.cliente}</h4>
                          <Badge variant="outline" className="text-xs">
                            Ruta {order.ruta}
                          </Badge>
                          <Badge className={cn("text-xs", getStatusColor(order.estado))}>
                            {getStatusLabel(order.estado)}
                          </Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span>{order.items.length} productos</span>
                          <span>Total: ${order.total.toLocaleString()}</span>
                          <span>Fecha: {order.fecha}</span>
                          {sheet?.entregador && (
                            <span className="flex items-center gap-1 text-primary">
                              <User className="h-3 w-3" />
                              {sheet.entregador}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.estado === "pendiente" && sheet && (
                        <Select onValueChange={(value) => assignDeliveryPerson(sheet.id, value as Entregador)}>
                          <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Asignar..." />
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
                      <Button size="sm" variant="ghost" onClick={() => exportOrder(order)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {expandedOrders.has(order.id) && (
                    <div className="border-t p-4 bg-muted/30">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Código</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Categoría</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                            <TableHead className="text-right">Valor Unit.</TableHead>
                            <TableHead className="text-right">Subtotal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {order.items.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-sm">{item.codigo}</TableCell>
                              <TableCell>{item.descripcion}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {item.categoria || "Sin categoría"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{item.cantidad}</TableCell>
                              <TableCell className="text-right">${item.valorUnidad.toLocaleString()}</TableCell>
                              <TableCell className="text-right font-medium">
                                ${item.subtotal.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell colSpan={5} className="text-right font-semibold">
                              Total del Pedido:
                            </TableCell>
                            <TableCell className="text-right font-bold text-lg">
                              ${order.total.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>

                      {order.estado === "pendiente" && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => updateOrderStatus(order.id, "entregado")}>
                            Marcar como Entregado
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => updateOrderStatus(order.id, "devolucion")}>
                            Devolución
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => updateOrderStatus(order.id, "abono")}>
                            Abono
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => updateOrderStatus(order.id, "fiado")}>
                            Fiado
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {filteredOrders.length === 0 && (
              <div className="py-12 text-center">
                <Package className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No se encontraron pedidos con los filtros aplicados
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
