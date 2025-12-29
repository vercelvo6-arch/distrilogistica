"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { BarChart3, LogOut, Filter, Download, Users, LayoutDashboard } from "lucide-react"
import type { RouteSheet, User } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { UserManagement } from "@/components/user-management"
import { ComisionesView } from "@/components/comisiones-view"
import { DashboardOverview } from "@/components/dashboard-overview"
import { getPlanillas } from "@/lib/actions/planillas"

interface AdministradorViewProps {
  onLogout: () => void
  user: User
}

export function AdministradorView({ onLogout, user }: AdministradorViewProps) {
  const [roleView, setRoleView] = useState<"admin" | "coordinador" | "alistador" | "entregador" | "caja">("admin")
  const [filterPeriodo, setFilterPeriodo] = useState<string>("all")
  const [filterEntregador, setFilterEntregador] = useState<string>("all")
  const [filterRuta, setFilterRuta] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [selectedView, setSelectedView] = useState<
    "dashboard" | "general" | "fiados" | "devoluciones" | "productos-devueltos" | "usuarios" | "comisiones"
  >("dashboard")
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [loading, setLoading] = useState(true)

  const [entregado, setEntregado] = useState<number>(0)
  const [fiado, setFiado] = useState<number>(0)
  const [devoluciones, setDevoluciones] = useState<number>(0)
  const [repasos, setRepasos] = useState<number>(0)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const planillas = await getPlanillas()
      setRouteSheets(planillas)
    } catch (err) {
      console.error("[v0] Error loading planillas:", err)
    } finally {
      setLoading(false)
    }
  }

  const entregadores = Array.from(new Set(routeSheets.map((r) => r.entregador).filter(Boolean))) as string[]
  const rutas = Array.from(new Set(routeSheets.map((r) => r.ruta)))

  const filteredRoutes = routeSheets.filter((route) => {
    if (filterEntregador !== "all" && route.entregador !== filterEntregador) return false
    if (filterRuta !== "all" && route.ruta !== filterRuta) return false
    if (dateFrom && route.fecha < dateFrom) return false
    if (dateTo && route.fecha > dateTo) return false
    return true
  })

  const calculateMetrics = () => {
    let totalCargue = 0
    let totalPedidos = 0
    let entregado = 0
    let fiado = 0
    let devoluciones = 0
    let repasos = 0

    filteredRoutes.forEach((route) => {
      totalCargue += route.totalAmount
      totalPedidos += route.totalOrders

      route.orders.forEach((order) => {
        const orderTotal = order.items.reduce((sum, item) => {
          if (item.devuelto) {
            devoluciones += item.subtotal
            return sum
          }
          return sum + item.subtotal
        }, 0)

        if (order.estado === "entregado") entregado += orderTotal
        else if (order.estado === "fiado") fiado += orderTotal
        else if (order.estado === "devolucion") devoluciones += orderTotal
        else if (order.estado === "repaso") repasos += orderTotal
      })
    })

    setEntregado(entregado)
    setFiado(fiado)
    setDevoluciones(devoluciones)
    setRepasos(repasos)

    return {
      totalCargue,
      totalPedidos,
      totalRutas: filteredRoutes.length,
    }
  }

  const metrics = calculateMetrics()

  const allOrders = filteredRoutes.flatMap((r) => r.orders)

  const fiadosOrders = allOrders.filter((o) => o.estado === "fiado")
  const fiadosByCliente = fiadosOrders.reduce(
    (acc, order) => {
      const cliente = order.cliente
      if (!acc[cliente]) {
        acc[cliente] = {
          cliente,
          totalFiado: 0,
          pedidos: 0,
          ultimaFecha: order.fechaEntrega || order.fecha,
        }
      }
      const orderTotal = order.items.reduce((sum, item) => {
        if (item.devuelto) return sum
        return sum + item.subtotal
      }, 0)
      acc[cliente].totalFiado += orderTotal
      acc[cliente].pedidos += 1
      return acc
    },
    {} as Record<string, { cliente: string; totalFiado: number; pedidos: number; ultimaFecha: string }>,
  )

  const productosDevueltos = allOrders.flatMap((order) =>
    order.items
      .filter((item) => item.devuelto)
      .map((item) => ({
        ...item,
        cliente: order.cliente,
        fecha: order.fechaEntrega || order.fecha,
        ruta: order.ruta,
      })),
  )

  const productosDevueltosAgrupados = productosDevueltos.reduce(
    (acc, item) => {
      const codigo = item.codigo
      if (!acc[codigo]) {
        acc[codigo] = {
          codigo: item.codigo,
          descripcion: item.descripcion,
          categoria: item.categoria,
          cantidadDevuelta: 0,
          valorTotal: 0,
          ocurrencias: 0,
        }
      }
      acc[codigo].cantidadDevuelta += item.cantidad
      acc[codigo].valorTotal += item.subtotal
      acc[codigo].ocurrencias += 1
      return acc
    },
    {} as Record<
      string,
      {
        codigo: string
        descripcion: string
        categoria: string
        cantidadDevuelta: number
        valorTotal: number
        ocurrencias: number
      }
    >,
  )

  const devolucionesGenerales = allOrders.filter((o) => o.estado === "devolucion")

  const exportToCSV = () => {
    let csvContent = ""
    let filename = ""

    if (selectedView === "general") {
      csvContent =
        "Fecha,Entregador,Ruta,Pedidos,Cargue,Entregado,Fiado,Devoluciones,Repasos\n" +
        filteredRoutes
          .map(
            (r) =>
              `${r.fecha},${r.entregador},${r.ruta},${r.totalOrders},${r.totalAmount},${r.montoEntregado},${r.montoFiado},${r.montoDevoluciones},${r.montoRepasos}`,
          )
          .join("\n")
      filename = "reporte-general.csv"
    } else if (selectedView === "fiados") {
      csvContent =
        "Cliente,Total Fiado,Pedidos,Última Fecha\n" +
        Object.values(fiadosByCliente)
          .map((f) => `${f.cliente},${f.totalFiado},${f.pedidos},${f.ultimaFecha}`)
          .join("\n")
      filename = "cuentas-por-cobrar.csv"
    } else if (selectedView === "productos-devueltos") {
      csvContent =
        "Código,Descripción,Categoría,Cantidad Devuelta,Valor Total,Ocurrencias\n" +
        Object.values(productosDevueltosAgrupados)
          .map(
            (p) => `${p.codigo},${p.descripcion},${p.categoria},${p.cantidadDevuelta},${p.valorTotal},${p.ocurrencias}`,
          )
          .join("\n")
      filename = "productos-devueltos.csv"
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    link.href = URL.createObjectURL(blob)
    link.download = filename
    link.click()
  }

  return (
    <>
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Administrador Maestro</h1>
                <p className="text-xs text-muted-foreground">Informes y análisis avanzados</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={roleView} onValueChange={(v) => setRoleView(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Administrador
                    </div>
                  </SelectItem>
                  <SelectItem value="coordinador">
                    <div className="flex items-center gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Coordinador
                    </div>
                  </SelectItem>
                  <SelectItem value="alistador">Alistador</SelectItem>
                  <SelectItem value="entregador">Entregador</SelectItem>
                  <SelectItem value="caja">Caja</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="space-y-6">
          <div className="flex gap-2 overflow-x-auto pb-2">
            <Button
              variant={selectedView === "dashboard" ? "default" : "outline"}
              onClick={() => setSelectedView("dashboard")}
            >
              Dashboard
            </Button>
            <Button
              variant={selectedView === "general" ? "default" : "outline"}
              onClick={() => setSelectedView("general")}
            >
              General
            </Button>
            <Button
              variant={selectedView === "fiados" ? "default" : "outline"}
              onClick={() => setSelectedView("fiados")}
            >
              Cuentas por Cobrar
            </Button>
            <Button
              variant={selectedView === "devoluciones" ? "default" : "outline"}
              onClick={() => setSelectedView("devoluciones")}
            >
              Devoluciones
            </Button>
            <Button
              variant={selectedView === "productos-devueltos" ? "default" : "outline"}
              onClick={() => setSelectedView("productos-devueltos")}
            >
              Productos Devueltos
            </Button>
            <Button
              variant={selectedView === "comisiones" ? "default" : "outline"}
              onClick={() => setSelectedView("comisiones")}
            >
              Comisiones
            </Button>
            <Button
              variant={selectedView === "usuarios" ? "default" : "outline"}
              onClick={() => setSelectedView("usuarios")}
            >
              <Users className="h-4 w-4 mr-2" />
              Usuarios
            </Button>
          </div>

          {selectedView === "dashboard" ? (
            <DashboardOverview />
          ) : selectedView === "comisiones" ? (
            <ComisionesView onLogout={onLogout} userRole="administrador" userId={user.id} />
          ) : selectedView === "usuarios" ? (
            <UserManagement />
          ) : (
            <>
              <Card className="p-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <Filter className="h-5 w-5 text-muted-foreground" />

                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      placeholder="Desde"
                      className="w-[160px]"
                    />
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      placeholder="Hasta"
                      className="w-[160px]"
                    />
                  </div>

                  <Select value={filterEntregador} onValueChange={setFilterEntregador}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Todos los entregadores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los entregadores</SelectItem>
                      {entregadores.map((e) => (
                        <SelectItem key={e} value={e}>
                          {e}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={filterRuta} onValueChange={setFilterRuta}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Todas las rutas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las rutas</SelectItem>
                      {rutas.map((r) => (
                        <SelectItem key={r} value={r}>
                          Ruta {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button onClick={exportToCSV} variant="outline" size="sm" className="ml-auto bg-transparent">
                    <Download className="h-4 w-4 mr-2" />
                    Exportar
                  </Button>
                </div>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Total Rutas</p>
                  </div>
                  <p className="text-2xl font-bold">{metrics.totalRutas}</p>
                </Card>

                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-2">Total Pedidos</p>
                  <p className="text-2xl font-bold">{metrics.totalPedidos}</p>
                </Card>

                <Card className="p-4">
                  <p className="text-sm text-muted-foreground mb-2">Total Cargue</p>
                  <p className="text-xl font-bold">{formatCOP(metrics.totalCargue)}</p>
                </Card>

                <Card className="p-4 bg-green-50 border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-green-600" />
                    <p className="text-sm text-green-700">Entregado</p>
                  </div>
                  <p className="text-xl font-bold text-green-600">{formatCOP(entregado)}</p>
                </Card>

                <Card className="p-4 bg-yellow-50 border-yellow-200">
                  <p className="text-sm text-yellow-700 mb-2">Fiado (CxC)</p>
                  <p className="text-xl font-bold text-yellow-600">{formatCOP(fiado)}</p>
                  <p className="text-xs text-yellow-600">{fiadosOrders.length} pedidos</p>
                </Card>

                <Card className="p-4 bg-red-50 border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="h-4 w-4 text-red-600" />
                    <p className="text-sm text-red-700">Devoluciones</p>
                  </div>
                  <p className="text-xl font-bold text-red-600">{formatCOP(devoluciones)}</p>
                </Card>
              </div>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Detalle de Rutas</h2>
                {filteredRoutes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay datos para el período seleccionado</p>
                ) : (
                  <div className="space-y-3">
                    {filteredRoutes.map((route) => {
                      let entregado = 0
                      let fiado = 0
                      let devoluciones = 0
                      let repasos = 0

                      route.orders.forEach((order) => {
                        const orderTotal = order.items.reduce((sum, item) => {
                          if (item.devuelto) {
                            devoluciones += item.subtotal
                            return sum
                          }
                          return sum + item.subtotal
                        }, 0)

                        if (order.estado === "entregado") entregado += orderTotal
                        else if (order.estado === "fiado") fiado += orderTotal
                        else if (order.estado === "devolucion") devoluciones += orderTotal
                        else if (order.estado === "repaso") repasos += orderTotal
                      })

                      return (
                        <div key={route.id} className="border rounded-lg p-4 hover:bg-muted/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-4">
                              <p className="font-semibold">Ruta {route.ruta}</p>
                              <p className="text-sm text-muted-foreground">{route.entregador}</p>
                              <p className="text-sm text-muted-foreground">{route.fecha}</p>
                            </div>
                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                              {route.estado}
                            </span>
                          </div>
                          <div className="grid grid-cols-6 gap-3 text-sm">
                            <div>
                              <p className="text-muted-foreground">Pedidos</p>
                              <p className="font-semibold">{route.totalOrders}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Cargue</p>
                              <p className="font-semibold">{formatCOP(route.totalAmount)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Entregado</p>
                              <p className="font-semibold text-green-600">{formatCOP(entregado)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Fiado</p>
                              <p className="font-semibold text-yellow-600">{formatCOP(fiado)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Devoluciones</p>
                              <p className="font-semibold text-red-600">{formatCOP(devoluciones)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Repasos</p>
                              <p className="font-semibold text-blue-600">{formatCOP(repasos)}</p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Cuentas por Cobrar (Fiados)</h2>
                {Object.keys(fiadosByCliente).length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay cuentas por cobrar</p>
                ) : (
                  <div className="space-y-3">
                    {Object.values(fiadosByCliente)
                      .sort((a, b) => b.totalFiado - a.totalFiado)
                      .map((fiado, idx) => (
                        <div key={idx} className="border rounded-lg p-4 hover:bg-yellow-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold">{fiado.cliente}</p>
                              <p className="text-sm text-muted-foreground">
                                {fiado.pedidos} pedido(s) · Última fecha: {fiado.ultimaFecha}
                              </p>
                            </div>
                            <p className="text-xl font-bold text-yellow-600">{formatCOP(fiado.totalFiado)}</p>
                          </div>
                        </div>
                      ))}
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-semibold">Total Cuentas por Cobrar:</p>
                        <p className="text-2xl font-bold text-yellow-600">{formatCOP(fiado)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Devoluciones Generales (Pedidos Completos)</h2>
                {devolucionesGenerales.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay devoluciones registradas</p>
                ) : (
                  <div className="space-y-3">
                    {devolucionesGenerales.map((order) => (
                      <div key={order.id} className="border rounded-lg p-4 hover:bg-red-50">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-semibold">{order.cliente}</p>
                            <p className="text-sm text-muted-foreground">
                              Ruta {order.ruta} · {order.fechaEntrega || order.fecha}
                            </p>
                          </div>
                          <p className="text-lg font-bold text-red-600">{formatCOP(order.total)}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">{order.items.length} productos</p>
                        {order.comentarios && (
                          <p className="text-sm text-muted-foreground mt-2">Comentario: {order.comentarios}</p>
                        )}
                      </div>
                    ))}
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-semibold">Total Devoluciones:</p>
                        <p className="text-2xl font-bold text-red-600">{formatCOP(devoluciones)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4">Productos Devueltos (Devoluciones Parciales)</h2>
                {Object.keys(productosDevueltosAgrupados).length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No hay productos devueltos</p>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-6 gap-4 text-sm font-semibold text-muted-foreground border-b pb-2">
                      <div>Código</div>
                      <div className="col-span-2">Descripción</div>
                      <div>Categoría</div>
                      <div className="text-right">Cantidad Dev.</div>
                      <div className="text-right">Valor Total</div>
                    </div>
                    {Object.values(productosDevueltosAgrupados)
                      .sort((a, b) => b.valorTotal - a.valorTotal)
                      .map((producto) => (
                        <div
                          key={producto.codigo}
                          className="grid grid-cols-6 gap-4 text-sm border rounded-lg p-3 hover:bg-red-50"
                        >
                          <div className="font-mono">{producto.codigo}</div>
                          <div className="col-span-2">{producto.descripcion}</div>
                          <div>
                            <span className="px-2 py-1 bg-muted rounded text-xs">{producto.categoria}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-semibold">{producto.cantidadDevuelta}</span>
                            <span className="text-muted-foreground text-xs ml-1">({producto.ocurrencias}x)</span>
                          </div>
                          <div className="text-right font-bold text-red-600">{formatCOP(producto.valorTotal)}</div>
                        </div>
                      ))}
                    <div className="border-t pt-4 mt-4">
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-semibold">
                          Total Productos Devueltos: {productosDevueltos.length} unidades
                        </p>
                        <p className="text-2xl font-bold text-red-600">
                          {formatCOP(
                            Object.values(productosDevueltosAgrupados).reduce((sum, p) => sum + p.valorTotal, 0),
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </main>
    </>
  )
}
