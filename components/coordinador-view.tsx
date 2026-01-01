// components/coordinador-view.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { parseNurturingCSV, parsePlanillaCSV, generateOrdersFromSales, generateRouteSheets } from '@/lib/csv-parser'
import type { Entregador } from '@/lib/types'
import { formatCOP } from '@/lib/format-utils'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'

const ENTREGADORES: Entregador[] = ["Alfonso", "Miguel", "Carlos", "Mateo"]

// Tipo para planillas desde la BD
interface PlanillaDB {
  id: string
  fecha: string
  tipo_ruta: string
  entregador: string | null
  total_cargue: number
  total_entregado: number
  total_fiado: number
  total_repaso: number
  total_devolucion: number
  estado: string
  alistado_por: string | null
  alistado_en: string | null
  observaciones: string | null
  created_at: string
  updated_at: string
  pedidos: any[]
}

export function CoordinadorView() {
  const router = useRouter()
  const [planillas, setPlanillas] = useState<PlanillaDB[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filterDate, setFilterDate] = useState<string>('')
  const [showAllDates, setShowAllDates] = useState(true)
  
  const nurturingFileRef = useRef<HTMLInputElement>(null)
  const planillaFileRef = useRef<HTMLInputElement>(null)

  // Cargar planillas al montar el componente
  useEffect(() => {
    loadPlanillas()
  }, [])

  // Obtener fechas únicas de las planillas
  const uniqueDates = Array.from(
    new Set(planillas.map(p => p.fecha))
  ).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())

  // Filtrar planillas
  const filteredPlanillas = showAllDates 
    ? planillas 
    : planillas.filter(p => p.fecha === filterDate)

  // Cargar planillas existentes
  const loadPlanillas = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/planillas')
      if (!response.ok) {
        throw new Error('Error al cargar planillas')
      }
      
      const data = await response.json()
      console.log('📦 Planillas cargadas:', data.planillas)
      
      // Log de la primera planilla para debugging
      if (data.planillas && data.planillas.length > 0) {
        console.log('📋 Ejemplo de planilla:', data.planillas[0])
      }
      
      setPlanillas(data.planillas || [])
    } catch (err) {
      console.error('❌ Error cargando planillas:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // Generar planillas desde CSVs
  const handleGeneratePlanillas = async () => {
    try {
      setLoading(true)
      setError(null)
      setSuccess(null)

      const nurturingFile = nurturingFileRef.current?.files?.[0]
      const planillaFile = planillaFileRef.current?.files?.[0]

      if (!nurturingFile || !planillaFile) {
        setError('Debes seleccionar ambos archivos CSV')
        return
      }

      const nurturingText = await nurturingFile.text()
      const planillaText = await planillaFile.text()

      const sales = parseNurturingCSV(nurturingText)
      const products = parsePlanillaCSV(planillaText)

      if (sales.length === 0) {
        setError('No se encontraron ventas en el archivo NURTURING')
        return
      }

      if (products.length === 0) {
        setError('No se encontraron productos en el archivo INVENTARIO')
        return
      }

      const orders = generateOrdersFromSales(sales, products, new Date().toISOString().split('T')[0])
      const routeSheets = generateRouteSheets(orders)

      if (routeSheets.length === 0) {
        setError('No se generaron planillas. Verifica los datos.')
        return
      }

      const response = await fetch('/api/planillas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeSheets })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al guardar planillas')
      }

      setSuccess(`✅ ${result.count} planillas generadas exitosamente`)
      
      await loadPlanillas()

      if (nurturingFileRef.current) nurturingFileRef.current.value = ''
      if (planillaFileRef.current) planillaFileRef.current.value = ''

    } catch (err) {
      console.error('❌ Error generando planillas:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // Asignar entregador
  const handleAssignEntregador = async (planillaId: string, entregador: Entregador) => {
    try {
      setLoading(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/assign-entregador', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planillaId: planillaId,
          entregador: entregador
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Error al asignar entregador')
      }

      setSuccess(`✅ ${entregador} asignado correctamente a la ruta ${result.planilla.tipo_ruta}`)

      setPlanillas(prev => prev.map(p => 
        p.id === planillaId 
          ? { ...p, entregador: entregador }
          : p
      ))

    } catch (err) {
      console.error('❌ Error al asignar entregador:', err)
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  // Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' })
      router.push('/auth/login')
    } catch (err) {
      console.error('Error al cerrar sesión:', err)
    }
  }

  const getEstadoBadge = (estado: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      'pendiente': 'secondary',
      'alistando': 'default',
      'alistado': 'outline',
      'en_ruta': 'default',
      'completado': 'default'
    }
    return variants[estado] || 'default'
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Coordinador Logístico</h1>
          <p className="text-muted-foreground">Gestión de planillas y asignación de rutas</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadPlanillas} disabled={loading} variant="outline">
            {loading ? 'Cargando...' : 'Actualizar'}
          </Button>
          <Button onClick={handleLogout} variant="destructive">
            Cerrar Sesión
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
          ❌ {error}
        </div>
      )}
      
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
          {success}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Generar Planillas desde CSV</CardTitle>
          <CardDescription>
            Carga los archivos NURTURING.csv e INVENTARIO_GENERAL.csv
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                NURTURING.csv (Ventas)
              </label>
              <input
                ref={nurturingFileRef}
                type="file"
                accept=".csv"
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
                disabled={loading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                INVENTARIO_GENERAL.csv (Catálogo)
              </label>
              <input
                ref={planillaFileRef}
                type="file"
                accept=".csv"
                className="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
                disabled={loading}
              />
            </div>
          </div>
          <Button 
            onClick={handleGeneratePlanillas}
            disabled={loading}
            className="w-full"
          >
            {loading ? 'Procesando...' : '📝 Generar Planillas'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Planillas Generadas ({filteredPlanillas.length})</CardTitle>
              <CardDescription>
                Asigna entregadores a cada ruta
              </CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              {!showAllDates && (
                <select
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="border rounded px-3 py-2 text-sm"
                >
                  <option value="">Seleccionar fecha</option>
                  {uniqueDates.map(date => (
                    <option key={date} value={date}>
                      {new Date(date).toLocaleDateString('es-CO', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </option>
                  ))}
                </select>
              )}
              <Button 
                variant={showAllDates ? "default" : "outline"}
                onClick={() => {
                  setShowAllDates(!showAllDates)
                  if (!showAllDates) setFilterDate('')
                }}
              >
                {showAllDates ? "Filtrar por fecha" : "Ver todas"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredPlanillas.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {showAllDates 
                ? "No hay planillas. Genera planillas cargando los archivos CSV."
                : "No hay planillas para la fecha seleccionada."}
            </p>
          ) : (
            <div className="space-y-4">
              {filteredPlanillas.map((planilla) => {
                const numPedidos = planilla.pedidos?.length || 0
                const montoCargue = Number(planilla.total_cargue) || 0
                
                return (
                  <div
                    key={planilla.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-xl">Ruta {planilla.tipo_ruta}</h3>
                          <Badge variant={getEstadoBadge(planilla.estado)}>
                            {planilla.estado}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          📅 Fecha: {new Date(planilla.fecha).toLocaleDateString('es-CO', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          📦 {numPedidos} pedidos
                        </p>
                        <p className="text-lg font-bold text-blue-700">
                          💰 Cargue Total: {formatCOP(montoCargue)}
                        </p>
                      </div>
                      <div className="text-right space-y-2">
                        <Select
                          value={planilla.entregador || ''}
                          onValueChange={(value) => handleAssignEntregador(planilla.id, value as Entregador)}
                          disabled={loading}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Asignar entregador" />
                          </SelectTrigger>
                          <SelectContent>
                            {ENTREGADORES.map((e) => (
                              <SelectItem key={e} value={e}>
                                {e}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {planilla.entregador && (
                          <p className="text-sm font-medium text-green-700">
                            ✓ Asignado a {planilla.entregador}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
