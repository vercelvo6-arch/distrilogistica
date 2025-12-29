export interface Product {
  ubicacion: string
  codigo: string
  descripcion: string
  categoria: string
}

export interface SalesRecord {
  numeroArticulo: string
  nombreProducto: string
  cantidadComprada: number
  ruta: string
  vendidoPor: string
  vendidoA: string
  totalesUnidad: number
  fecha: string
  comentarios?: string
}

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
  estado: "pendiente" | "entregado" | "devolucion" | "abono" | "fiado" | "repaso"
  entregador?: string
  comentarios?: string
  montoPagado?: number
  saldoPendiente?: number
  fechaEntrega?: string
}

export interface RouteSheet {
  id: string
  ruta: string
  fecha: string
  orders: Order[]
  totalOrders: number
  totalAmount: number
  entregador?: string
  estado: "pendiente" | "alistando" | "alistado" | "enrutado" | "en-entrega" | "completado"
  montoCargue?: number
  montoEntregado?: number
  montoFiado?: number
  montoDevoluciones?: number
  montoRepasos?: number
  cuentasPorCobrar?: PendingCollection[]
}

export interface PendingCollection {
  id: string
  cliente: string
  monto: number
  fechaOriginal: string
  diasPendiente: number
}

export type UserRole = "coordinador" | "alistador" | "entregador" | "caja" | "administrador"

export interface User {
  id: string
  nombre: string
  email: string
  password_hash?: string
  rol: UserRole | null
  entregadorName?: string
  estado: "pendiente" | "activo" | "inactivo"
  created_at?: string
  updated_at?: string
}

export interface CashierReport {
  fecha: string
  entregador: string
  totalCargue: number
  totalEntregado: number
  totalFiado: number
  totalDevoluciones: number
  totalRepasos: number
  efectivoRecibido: number
  diferencia: number
  orders: Order[]
}

export type Entregador = "Alfonso" | "Miguel" | "Carlos" | "Mateo"

export const ENTREGADORES: Entregador[] = ["Alfonso", "Miguel", "Carlos", "Mateo"]

export interface ComisionConfig {
  id: string
  entregador: string
  porcentaje_comision: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Comision {
  id: string
  entregador: string
  fecha: string
  planilla_id: string
  total_entregas_efectivas: number
  total_devoluciones: number
  base_comisionable: number
  porcentaje_aplicado: number
  monto_comision: number
  estado: "pendiente" | "pagado" | "cancelado"
  observaciones?: string
  pagado_en?: string
  pagado_por?: string
  created_at: string
  updated_at: string
}

export interface ComisionReporte {
  entregador: string
  fecha_inicio: string
  fecha_fin: string
  total_entregas: number
  total_devoluciones: number
  base_comisionable: number
  monto_comision: number
  dias_trabajados: number
  comisiones: Comision[]
}
