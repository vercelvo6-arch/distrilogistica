// types.ts - Sistema dinámico de entregadores desde BD
export type Entregador = string // Ya no limitado a nombres específicos

export interface OrderItem {
  codigo: string
  descripcion: string
  categoria: string
  cantidad: number
  valorUnidad: number
  subtotal: number
  devuelto?: boolean
}

export interface Order {
  id: string
  cliente: string
  ruta: string
  fecha: string
  items: OrderItem[]
  total: number
  estado: "pendiente" | "entregado" | "fiado" | "repaso" | "devolucion"
  comentarios?: string
  montoPagado: number
  saldoPendiente: number
  entregador?: string | null
}

export interface RouteSheet {
  id: string
  ruta: string
  fecha: string
  orders: Order[]
  totalOrders: number
  totalAmount: number
  estado: "pendiente" | "alistando" | "alistado" | "en_ruta" | "completado"
  montoCargue: number
  montoEntregado: number
  montoFiado: number
  montoDevoluciones: number
  montoRepasos: number
  entregador?: string | null
  tipoRuta?: string
  cuentasPorCobrar: any[]
}

export interface SalesRecord {
  numeroArticulo: string
  nombreProducto: string
  cantidadComprada: number
  totalesUnidad: number
  ruta: string
  vendidoPor: string
  vendidoA: string
  fecha: string
  comentarios?: string
}

export interface Product {
  ubicacion: string
  codigo: string
  descripcion: string
  categoria: string
}

export type UserRole = "coordinador" | "alistador" | "entregador" | "caja" | "administrador"

export interface User {
  id: string
  nombre: string
  email: string
  rol: UserRole
  estado: "activo" | "inactivo"
  created_at?: string | Date
  updated_at?: string | Date
}
