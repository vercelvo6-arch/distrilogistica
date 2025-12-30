// types.ts - Asegúrate que estos tipos estén así

export type Entregador = "Alfonso" | "Miguel" | "Carlos" | "Mateo"
export const ENTREGADORES: Entregador[] = ["Alfonso", "Miguel", "Carlos", "Mateo"]

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
  entregador?: Entregador | null
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
  entregador?: Entregador | null
  cuentasPorCobrar: any[] // Define mejor si es necesario
}

// Los demás tipos (SalesRecord, Product, etc.) mantenlos como están
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
