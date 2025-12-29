"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart3, TrendingUp, Package, DollarSign } from "lucide-react"
import type { RouteSheet, SalesRecord } from "@/lib/types"

interface ReportsDashboardProps {
  routeSheets: RouteSheet[]
  salesData: SalesRecord[]
}

export function ReportsDashboard({ routeSheets, salesData }: ReportsDashboardProps) {
  const totalProducts = routeSheets.reduce(
    (sum, sheet) => sum + sheet.productos.reduce((pSum, p) => pSum + p.cantidad, 0),
    0,
  )

  const totalValue = routeSheets.reduce((sum, sheet) => sum + sheet.total, 0)

  const completedRoutes = routeSheets.filter((s) => s.estado === "completado").length

  const deliveryPersonStats = routeSheets
    .filter((s) => s.entregador)
    .reduce(
      (acc, sheet) => {
        const name = sheet.entregador!
        if (!acc[name]) {
          acc[name] = { routes: 0, total: 0 }
        }
        acc[name].routes++
        acc[name].total += sheet.total
        return acc
      },
      {} as Record<string, { routes: number; total: number }>,
    )

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Rutas</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{routeSheets.length}</div>
            <p className="text-xs text-muted-foreground">{completedRoutes} completadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
            <p className="text-xs text-muted-foreground">En todas las rutas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Ventas totales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Promedio por Ruta</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${routeSheets.length > 0 ? Math.round(totalValue / routeSheets.length).toLocaleString() : 0}
            </div>
            <p className="text-xs text-muted-foreground">Valor promedio</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Rendimiento por Entregador</CardTitle>
            <CardDescription>Rutas asignadas y valor total</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(deliveryPersonStats).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(deliveryPersonStats).map(([name, stats]) => (
                  <div key={name} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{name}</p>
                      <p className="text-sm text-muted-foreground">
                        {stats.routes} {stats.routes === 1 ? "ruta" : "rutas"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">${stats.total.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">
                        ${Math.round(stats.total / stats.routes).toLocaleString()} por ruta
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-8">No hay rutas asignadas aún</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado de Rutas</CardTitle>
            <CardDescription>Distribución por estado actual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { estado: "pendiente", label: "Pendientes" },
                { estado: "en-bodega", label: "En Bodega" },
                { estado: "enrutado", label: "Enrutadas" },
                { estado: "en-entrega", label: "En Entrega" },
                { estado: "completado", label: "Completadas" },
              ].map(({ estado, label }) => {
                const count = routeSheets.filter((s) => s.estado === estado).length
                const percentage = routeSheets.length > 0 ? Math.round((count / routeSheets.length) * 100) : 0

                return (
                  <div key={estado}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{label}</span>
                      <span className="text-muted-foreground">
                        {count} ({percentage}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
