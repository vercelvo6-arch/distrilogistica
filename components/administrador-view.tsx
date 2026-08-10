"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { BarChart3, LogOut, Filter, Download, Users, LayoutDashboard, CreditCard, RefreshCw, TrendingUp, Trash2 } from "lucide-react"
import type { RouteSheet, User } from "@/lib/types"
import { formatCOP } from "@/lib/format-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { UserManagement } from "@/components/user-management"
import { ComisionesView } from "@/components/comisiones-view"
import { DashboardOverview } from "@/components/dashboard-overview"
import { FiadosView } from "@/components/fiados-view"
import { RepassosView } from "@/components/repasos-view"
import { RendimientoView } from "@/components/rendimiento-view"
import { EliminadosView } from "@/components/eliminados-view"

interface AdministradorViewProps {
  onLogout: () => void
  user: User
}

export function AdministradorView({ onLogout, user }: AdministradorViewProps) {
  const [selectedView, setSelectedView] = useState<"dashboard" | "general" | "fiados" | "repasos" | "devoluciones" | "productos-devueltos" | "usuarios" | "comisiones" | "rendimiento" | "eliminados">("dashboard")
  const [routeSheets, setRouteSheets] = useState<RouteSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [filterEntregador, setFilterEntregador] = useState<string>("all")
  const [filterRuta, setFilterRuta] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [entregado, setEntregado] = useState<number>(0)
  const [fiado, setFiado] = useState<number>(0)
  const [devoluciones, setDevoluciones] = useState<number>(0)
  const [repasos, setRepasos] = useState<number>(0)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const response = await fetch('/api/planillas', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) throw new Error('Error al cargar planillas')
      
      const data = await response.json()
      
      const planillas: RouteSheet[] = (data.planillas || []).map((p: any) => ({
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
      }))
      
      setRouteSheets(planillas)
    } catch (err) {
      console.error("Error loading planillas:", err)
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

  useEffect(() => {
    let totalEntregado = 0
    let totalFiado = 0
    let totalDevoluciones = 0
    let totalRepasos = 0

    filteredRoutes.forEach((route) => {
      route.orders.forEach((order) => {
        const orderTotal = order.items.reduce((sum, item) => {
          if (item.devuelto) {
            totalDevoluciones += item.subtotal
            return sum
          }
          return sum + item.subtotal
        }, 0)

        if (order.estado === "entregado") totalEntregado += orderTotal
        else if (order.estado === "fiado") totalFiado += orderTotal
        else if (order.estado === "devolucion") totalDevoluciones += orderTotal
        else if (order.estado === "repaso") totalRepasos += orderTotal
      })
    })

    setEntregado(totalEntregado)
    setFiado(totalFiado)
    setDevoluciones(totalDevoluciones)
    setRepasos(totalRepasos)
  }, [filteredRoutes])

  const metrics = {
    totalCargue: filteredRoutes.reduce((sum, r) => sum + r.totalAmount, 0),
    totalPedidos: filteredRoutes.reduce((sum, r) => sum + r.totalOrders, 0),
    totalRutas: filteredRoutes.length,
  }

  const allOrders = filteredRoutes.flatMap((r) => r.orders)
  const fiadosOrders = allOrders.filter((o) => o.estado === "fiado")

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Administrador</h1>
                <p className="text-xs text-muted-foreground">Panel de control</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={selectedView === "dashboard" ? "default" : "outline"}
              onClick={() => setSelectedView("dashboard")}
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
            <Button
              variant={selectedView === "usuarios" ? "default" : "outline"}
              onClick={() => setSelectedView("usuarios")}
            >
              <Users className="h-4 w-4 mr-2" />
              Usuarios
            </Button>
            <Button
              variant={selectedView === "comisiones" ? "default" : "outline"}
              onClick={() => setSelectedView("comisiones")}
            >
              Comisiones
            </Button>
            <Button
              variant={selectedView === "fiados" ? "default" : "outline"}
              onClick={() => setSelectedView("fiados")}
            >
              <CreditCard className="h-4 w-4 mr-2" />
              Fiados
            </Button>
            <Button
              variant={selectedView === "repasos" ? "default" : "outline"}
              onClick={() => setSelectedView("repasos")}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Repasos
            </Button>
            <Button
              variant={selectedView === "rendimiento" ? "default" : "outline"}
              onClick={() => setSelectedView("rendimiento")}
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Rendimiento
            </Button>
            <Link href="/pagos-anticipados">
              <Button variant="outline">
                <CreditCard className="h-4 w-4 mr-2" />
                Cuadre Administrativo
              </Button>
            </Link>
            <Button
              variant={selectedView === "eliminados" ? "default" : "outline"}
              onClick={() => setSelectedView("eliminados")}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminados
            </Button>
          </div>

          {selectedView === "dashboard" && <DashboardOverview />}
          {selectedView === "usuarios" && <UserManagement />}
          {selectedView === "comisiones" && (
            <ComisionesView onLogout={onLogout} userRole="administrador" userId={user.id} />
          )}
          {selectedView === "fiados" && (
            <FiadosView onLogout={onLogout} userRole="administrador" userId={user.id} />
          )}
          {selectedView === "repasos" && (
            <RepassosView onLogout={onLogout} userRole="administrador" />
          )}
          {selectedView === "rendimiento" && (
            <RendimientoView onLogout={onLogout} userRole="administrador" />
          )}
          {selectedView === "eliminados" && <EliminadosView />}
        </div>
      </main>
    </div>
  )
}
