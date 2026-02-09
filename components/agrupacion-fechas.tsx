"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Calendar, DollarSign, ArrowLeft, ChevronDown, ChevronUp, MapPin, Phone } from "lucide-react"
import { formatCOP } from "@/lib/format-utils"
import { useToast } from "@/hooks/use-toast"
import { Checkbox } from "@/components/ui/checkbox"
import {
  updatePedidoEstado,
  updateProductoDevuelto,
  updateCantidadEntregada,
  updateSubtotalAjustado,
} from "@/lib/actions/planillas"

interface AgrupacionFechasProps {
  onBack: () => void
  entregador: string
}

interface Cliente {
  id: string
  nombre: string
  direccion: string
  telefono: string
  barrio: string
  estado: 'pendiente' | 'entregado' | 'fiado' | 'repaso' | 'devolucion' | 'agotado'
  total: number
  observaciones: string
  productos: Producto[]
  planillaId: number
  ruta: string
}

interface Producto {
  codigo: string
  nombre: string
  cantidad: number
  precio_unitario: number
  total: number
  devuelto: boolean
  cantidad_entregada: number | null
  subtotal_ajustado: number | null
  estado_producto: string | null
}

interface PlanillaData {
  id: number
  tipo_ruta: string
  fecha: string
  total_cargue: number
  total_entregado: number
  total_fiado: number
  total_repaso: number
  total_devolucion: number
  agotados: number
  clientes: Cliente[]
}

export function AgrupacionFechas({ onBack, entregador }: AgrupacionFechasProps) {
  const { toast } = useToast()
  const [planillas, setPlanillas] = useState<PlanillaData[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedClientes, setExpandedClientes] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadPlanillas()
  }, [])

  async function loadPlanillas() {
    try {
      const response = await fetch('/api/planillas', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) throw new Error('Error al cargar planillas')
      
      const data = await response.json()
      
      // Filtrar solo las planillas del entregador que NO están cuadradas
      const misPlanillas = (data.planillas || [])
        .filter((p: any) => p.entregador === entregador && !p.cuadrado_en_caja && p.estado === 'alistado')
        .map((p: any) => ({
          id: p.id,
          tipo_ruta: p.tipo_ruta,
          fecha: p.fecha,
          total_cargue: Number(p.total_cargue) || 0,
          total_entregado: Number(p.total_entregado) || 0,
          total_fiado: Number(p.total_fiado) || 0,
          total_repaso: Number(p.total_repaso) || 0,
          total_devolucion: Number(p.total_devolucion) || 0,
          agotados: Number(p.agotados) || 0,
          clientes: (p.pedidos || []).map((ped: any) => ({
            id: ped.id,
            nombre: ped.cliente,
            direccion: ped.direccion || '',
            telefono: ped.telefono || '',
            barrio: ped.barrio || '',
            estado: ped.estado,
            total: Number(ped.total) || 0,
            observaciones: ped.observaciones || '',
            planillaId: p.id,
            ruta: p.tipo_ruta,
            productos: (ped.productos || []).map((prod: any) => ({
              codigo: prod.codigo,
              nombre: prod.nombre,
              cantidad: Number(prod.cantidad) || 0,
              precio_unitario: Number(prod.precio_unitario) || 0,
              total: Number(prod.total) || 0,
              devuelto: prod.devuelto || false,
              cantidad_entregada: prod.cantidad_entregada,
              subtotal_ajustado: prod.subtotal_ajustado,
              estado_producto: prod.estado_producto || 'normal',
            }))
          }))
        }))
      
      setPlanillas(misPlanillas)
    } catch (err) {
      console.error("[AGRUPACION] Error:", err)
      toast({
        title: "Error",
        description: "No se pudo cargar la agrupación",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClienteStatusChange = async (clienteId: string, newStatus: Cliente['estado']) => {
    try {
      // Actualizar estado local
      setPlanillas(prevPlanillas =>
        prevPlanillas.map(planilla => ({
          ...planilla,
          clientes: planilla.clientes.map(cliente =>
            cliente.id === clienteId
              ? { ...cliente, estado: newStatus }
              : cliente
          )
        }))
      )

      // Guardar en servidor
      await updatePedidoEstado(clienteId, newStatus)

      toast({
        title: "Actualizado",
        description: `Cliente marcado como ${newStatus}`,
      })

      // Recargar para actualizar totales
      await loadPlanillas()
    } catch (err) {
      console.error("[AGRUPACION] Error:", err)
      await loadPlanillas()
      toast({
        title: "Error",
        description: "No se pudo actualizar el cliente",
        variant: "destructive",
      })
    }
  }

  const handleProductoDevuelto = async (clienteId: string, codigo: string, currentDevuelto: boolean) => {
    try {
      await updateProductoDevuelto(clienteId, codigo, !currentDevuelto)
      await loadPlanillas()
      
      toast({
        title: currentDevuelto ? "Producto activado" : "Producto devuelto",
        description: `El producto ha sido marcado como ${!currentDevuelto ? "devuelto" : "activo"}`,
      })
    } catch (err) {
      console.error("[AGRUPACION] Error:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar el producto",
        variant: "destructive",
      })
    }
  }

  const handleCantidadChange = async (clienteId: string, codigo: string, cantidad: number, cantidadOriginal: number) => {
    if (cantidad < 0 || cantidad > cantidadOriginal) {
      toast({
        title: "Error",
        description: `La cantidad debe estar entre 0 y ${cantidadOriginal}`,
        variant: "destructive",
      })
      return
    }

    try {
      const result = await updateCantidadEntregada(clienteId, codigo, cantidad)
      await loadPlanillas()
      
      const estadoMsg = result.estadoProducto === 'agotado' 
        ? '🚫 Marcado como Agotado' 
        : result.estadoProducto === 'parcial'
          ? '📦 Entrega Parcial'
          : '✓ Entrega Completa'
      
      toast({
        title: "Cantidad actualizada",
        description: estadoMsg,
      })
    } catch (err) {
      console.error("[AGRUPACION] Error:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar la cantidad",
        variant: "destructive",
      })
    }
  }

  const handleSubtotalChange = async (clienteId: string, codigo: string, nuevoSubtotal: number) => {
    if (nuevoSubtotal < 0) {
      toast({
        title: "Error",
        description: "El subtotal no puede ser negativo",
        variant: "destructive",
      })
      return
    }

    try {
      await updateSubtotalAjustado(clienteId, codigo, nuevoSubtotal)
      await loadPlanillas()
      
      toast({
        title: "💰 Subtotal ajustado",
        description: "El valor ha sido actualizado manualmente",
      })
    } catch (err) {
      console.error("[AGRUPACION] Error:", err)
      toast({
        title: "Error",
        description: "No se pudo actualizar el subtotal",
        variant: "destructive",
      })
    }
  }

  const toggleCliente = (clienteId: string) => {
    const newExpanded = new Set(expandedClientes)
    if (newExpanded.has(clienteId)) {
      newExpanded.delete(clienteId)
    } else {
      newExpanded.add(clienteId)
    }
    setExpandedClientes(newExpanded)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  // CALCULAR TOTALES GENERALES
  let totalCargue = 0
  let totalEntregado = 0
  let totalFiado = 0
  let totalRepasos = 0
  let totalDevoluciones = 0
  let totalAgotados = 0

  planillas.forEach(planilla => {
    totalCargue += planilla.total_cargue

    planilla.clientes.forEach(cliente => {
      // Calcular el total efectivo del cliente
      let efectivoCliente = 0
      
      cliente.productos.forEach(prod => {
        if (prod.devuelto) return
        
        const cantEntregada = prod.cantidad_entregada !== null ? prod.cantidad_entregada : prod.cantidad
        if (cantEntregada === 0 || prod.estado_producto === 'agotado') {
          totalAgotados += prod.total
          return
        }
        
        const subtotal = prod.subtotal_ajustado !== null 
          ? prod.subtotal_ajustado 
          : cantEntregada * prod.precio_unitario
        
        efectivoCliente += subtotal
      })

      // Sumar según el estado del cliente
      if (cliente.estado === 'entregado') {
        totalEntregado += efectivoCliente
      } else if (cliente.estado === 'fiado') {
        totalFiado += efectivoCliente
      } else if (cliente.estado === 'repaso') {
        totalRepasos += efectivoCliente
      } else if (cliente.estado === 'devolucion') {
        totalDevoluciones += efectivoCliente
      }
    })
  })

  // Todos los clientes de todas las planillas
  const todosLosClientes = planillas.flatMap(p => p.clientes)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h2 className="text-xl font-bold">Mis Entregas - Totales</h2>
            <p className="text-sm text-muted-foreground">
              {planillas.length} ruta{planillas.length !== 1 ? 's' : ''} · {todosLosClientes.length} cliente{todosLosClientes.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* TOTALES GENERALES ARRIBA */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="p-3 md:p-4 text-center bg-blue-50 border-blue-200">
          <p className="text-xs text-blue-600 font-medium mb-1">Total Cargue</p>
          <p className="text-lg md:text-xl font-bold text-blue-700">{formatCOP(totalCargue)}</p>
        </Card>
        <Card className="p-3 md:p-4 text-center bg-green-50 border-green-200">
          <p className="text-xs text-green-600 font-medium mb-1">Entregado</p>
          <p className="text-lg md:text-xl font-bold text-green-700">{formatCOP(totalEntregado)}</p>
        </Card>
        <Card className="p-3 md:p-4 text-center bg-orange-50 border-orange-200">
          <p className="text-xs text-orange-600 font-medium mb-1">Fiado (CxC)</p>
          <p className="text-lg md:text-xl font-bold text-orange-700">{formatCOP(totalFiado)}</p>
        </Card>
        <Card className="p-3 md:p-4 text-center bg-red-50 border-red-200">
          <p className="text-xs text-red-600 font-medium mb-1">Devoluciones</p>
          <p className="text-lg md:text-xl font-bold text-red-700">{formatCOP(totalDevoluciones)}</p>
        </Card>
        <Card className="p-3 md:p-4 text-center bg-blue-50 border-blue-200">
          <p className="text-xs text-blue-600 font-medium mb-1">Repasos</p>
          <p className="text-lg md:text-xl font-bold text-blue-700">{formatCOP(totalRepasos)}</p>
        </Card>
        <Card className="p-3 md:p-4 text-center bg-gray-50 border-gray-200">
          <p className="text-xs text-gray-600 font-medium mb-1">Agotados</p>
          <p className="text-lg md:text-xl font-bold text-gray-700">{formatCOP(totalAgotados)}</p>
        </Card>
      </div>

      {/* LISTA DE CLIENTES */}
      {todosLosClientes.length === 0 ? (
        <Card className="p-8 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No hay entregas pendientes</h3>
          <p className="text-muted-foreground">
            Todas tus rutas han sido cuadradas
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Mis Clientes</h3>
          {todosLosClientes.map((cliente) => {
            const isExpanded = expandedClientes.has(cliente.id)
            
            // Calcular total efectivo del cliente
            let efectivoTotal = 0
            let returnedTotal = 0
            
            cliente.productos.forEach((prod) => {
              if (prod.devuelto) {
                returnedTotal += prod.total
              } else {
                const cantEntregada = prod.cantidad_entregada !== null ? prod.cantidad_entregada : prod.cantidad
                
                if (cantEntregada === 0 || prod.estado_producto === 'agotado') return
                
                const subtotal = prod.subtotal_ajustado !== null 
                  ? prod.subtotal_ajustado 
                  : cantEntregada * prod.precio_unitario
                
                efectivoTotal += subtotal
              }
            })

            return (
              <Card key={cliente.id} className="overflow-hidden">
                <div className="p-3 md:p-4 bg-muted/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h3 className="font-semibold text-sm md:text-base truncate">{cliente.nombre}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">
                          Ruta {cliente.ruta}
                        </span>
                        <span
                          className={`text-xs px-2 py-1 rounded-full shrink-0 font-medium ${
                            cliente.estado === "pendiente"
                              ? "bg-yellow-100 text-yellow-700"
                              : cliente.estado === "entregado"
                                ? "bg-green-100 text-green-700"
                                : cliente.estado === "fiado"
                                  ? "bg-orange-100 text-orange-700"
                                  : cliente.estado === "repaso"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-red-100 text-red-700"
                          }`}
                        >
                          {cliente.estado}
                        </span>
                      </div>
                      
                      <div className="space-y-1 mb-2">
                        {cliente.direccion && (
                          <div className="flex items-start gap-2 text-xs md:text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                            <span className="break-words">
                              {cliente.direccion}
                              {cliente.barrio && ` - ${cliente.barrio}`}
                            </span>
                          </div>
                        )}
                        {cliente.telefono && (
                          <div className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
                            <Phone className="h-4 w-4 shrink-0" />
                            <a 
                              href={`tel:${cliente.telefono}`}
                              className="hover:text-primary hover:underline font-medium"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {cliente.telefono}
                            </a>
                          </div>
                        )}
                      </div>

                      <p className="text-xs md:text-sm text-muted-foreground">
                        {cliente.productos.length} productos · {formatCOP(efectivoTotal)}
                        {returnedTotal > 0 && (
                          <span className="text-red-600 ml-2">· Dev: {formatCOP(returnedTotal)}</span>
                        )}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => toggleCliente(cliente.id)}>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-3 md:p-4 space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                      💡 <strong>Ajustes manuales:</strong> Edita "Cant. Entregada" para entregas parciales. Para promociones con precios especiales, ajusta el "Subtotal" directamente.
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs md:text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 w-10">Dev.</th>
                            <th className="text-left py-2">Código</th>
                            <th className="text-left py-2">Descripción</th>
                            <th className="text-right py-2">Cant. Original</th>
                            <th className="text-right py-2">Cant. Entregada</th>
                            <th className="text-right py-2">Subtotal</th>
                            <th className="text-center py-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cliente.productos.map((prod, idx) => {
                            const cantidadEntregada = prod.cantidad_entregada !== null ? prod.cantidad_entregada : prod.cantidad
                            const subtotalCalculado = cantidadEntregada * prod.precio_unitario
                            const subtotalFinal = prod.subtotal_ajustado !== null ? prod.subtotal_ajustado : subtotalCalculado
                            const estadoProducto = prod.estado_producto || 'normal'
                            const tieneAjusteManual = prod.subtotal_ajustado !== null
                            
                            return (
                              <tr
                                key={idx}
                                className={`border-b ${prod.devuelto ? "bg-red-50 line-through opacity-60" : ""}`}
                              >
                                <td className="py-2">
                                  <Checkbox
                                    checked={prod.devuelto || false}
                                    onCheckedChange={() => handleProductoDevuelto(cliente.id, prod.codigo, prod.devuelto)}
                                    disabled={cliente.estado !== "pendiente"}
                                  />
                                </td>
                                <td className="py-2 font-mono">{prod.codigo}</td>
                                <td className="py-2">{prod.nombre}</td>
                                <td className="text-right py-2">{prod.cantidad}</td>
                                <td className="text-right py-2">
                                  {cliente.estado === "pendiente" && !prod.devuelto ? (
                                    <input
                                      type="number"
                                      min="0"
                                      max={prod.cantidad}
                                      defaultValue={cantidadEntregada}
                                      onBlur={(e) => {
                                        const newCant = parseInt(e.target.value) || 0
                                        if (newCant !== cantidadEntregada) {
                                          handleCantidadChange(cliente.id, prod.codigo, newCant, prod.cantidad)
                                        }
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.currentTarget.blur()
                                        }
                                      }}
                                      className="w-16 px-2 py-1 border rounded text-center"
                                    />
                                  ) : (
                                    <span className="font-medium">{cantidadEntregada}</span>
                                  )}
                                </td>
                                <td className="text-right py-2">
                                  {cliente.estado === "pendiente" && !prod.devuelto ? (
                                    <div className="flex flex-col items-end gap-1">
                                      <input
                                        type="number"
                                        min="0"
                                        step="100"
                                        defaultValue={subtotalFinal}
                                        onBlur={(e) => {
                                          const newSubtotal = parseFloat(e.target.value) || 0
                                          if (newSubtotal !== subtotalFinal) {
                                            handleSubtotalChange(cliente.id, prod.codigo, newSubtotal)
                                          }
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.currentTarget.blur()
                                          }
                                        }}
                                        placeholder={formatCOP(subtotalFinal)}
                                        className={`w-28 px-2 py-1 border rounded text-right font-medium ${
                                          tieneAjusteManual ? 'border-orange-400 bg-orange-50' : ''
                                        }`}
                                      />
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground">{formatCOP(subtotalFinal)}</span>
                                        {tieneAjusteManual && (
                                          <span className="text-xs text-orange-600">✏️ Ajustado</span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-end">
                                      <span className="font-medium">{formatCOP(subtotalFinal)}</span>
                                      {tieneAjusteManual && (
                                        <span className="text-xs text-orange-600">✏️ Ajustado</span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="text-center py-2">
                                  {estadoProducto === 'agotado' && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                      🚫 Agotado
                                    </span>
                                  )}
                                  {estadoProducto === 'parcial' && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                                      📦 Parcial
                                    </span>
                                  )}
                                  {estadoProducto === 'normal' && !prod.devuelto && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                                      ✓ Normal
                                    </span>
                                  )}
                                  {prod.devuelto && (
                                    <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                                      ❌ Devuelto
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="font-semibold">
                            <td colSpan={5} className="text-right py-3 text-xs md:text-sm">
                              Total:
                            </td>
                            <td className="text-right py-3">{formatCOP(efectivoTotal)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleClienteStatusChange(cliente.id, "entregado")}
                        className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
                        disabled={cliente.estado !== "pendiente"}
                      >
                        Entregado
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleClienteStatusChange(cliente.id, "fiado")}
                        className="flex-1 sm:flex-none border-orange-300 text-orange-700 hover:bg-orange-50"
                        disabled={cliente.estado !== "pendiente"}
                      >
                        Fiado
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleClienteStatusChange(cliente.id, "repaso")}
                        className="flex-1 sm:flex-none border-blue-300 text-blue-700 hover:bg-blue-50"
                        disabled={cliente.estado !== "pendiente"}
                      >
                        Repaso
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleClienteStatusChange(cliente.id, "devolucion")}
                        className="flex-1 sm:flex-none"
                        disabled={cliente.estado !== "pendiente"}
                      >
                        Devolución
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
