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
  cuadradoEnCaja?: boolean // ← NUEVO: Para rastrear si ya fue procesado en caja
  fechaCuadreCaja?: string // ← NUEVO: Cuándo se cuadró
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
  idVenta: string // ← NUEVO: ID de factura/venta (columna H)
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

// ==========================================
// TIPOS PARA MÓDULO DE CAJA
// ==========================================

export interface RecepcionCaja {
  id: string
  planilla_id: string
  fecha_recepcion: string
  efectivo_esperado: number
  efectivo_recibido: number
  diferencia_efectivo: number
  tiene_consignacion: boolean
  numero_consignacion?: string
  banco?: string
  monto_consignacion?: number
  fecha_consignacion?: string
  observaciones?: string
  recibido_por: string
  estado: 'cuadrado' | 'con_diferencia'
  created_at: string
  updated_at: string
  
  // Datos JOIN (cuando se consulta con planilla y usuario)
  entregador?: string
  tipo_ruta?: string
  fecha_planilla?: string
  recibido_por_nombre?: string
}

export interface RecepcionCajaForm {
  planillaId: string
  efectivoEsperado: number
  efectivoRecibido: number
  tieneConsignacion: boolean
  numeroConsignacion?: string
  banco?: string
  montoConsignacion?: number
  fechaConsignacion?: string
  observaciones?: string
}

// ==========================================
// TIPOS PARA MÓDULO DE COMISIONES
// ==========================================

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
  estado: 'pendiente' | 'pagado'
  fecha_pago?: string
  created_at: string
  updated_at: string
}

export interface ComisionConfig {
  id: string
  entregador: string
  porcentaje_comision: number
  activo: boolean
  created_at: string
  updated_at: string
}

export interface ComisionReporte {
  entregador: string
  total_entregas: number
  total_devoluciones: number
  base_comisionable: number
  porcentaje_promedio: number
  total_comision: number
  dias_trabajados: number
  comisiones_pendientes: number
  comisiones_pagadas: number
}

// ==========================================
// TIPOS PARA MÓDULO DE FIADOS (CUENTAS POR COBRAR)
// ==========================================

export interface Fiado {
  id: string
  planilla_id: string
  cliente: string
  direccion?: string
  telefono?: string
  barrio?: string
  total: number
  estado: 'fiado' | 'pagado'
  fecha_fiado: string
  fecha_pago?: string
  observaciones?: string
  created_at: string
  updated_at: string
  
  // Datos JOIN
  entregador?: string
  tipo_ruta?: string
  fecha_planilla?: string
}

export interface FiadoResumen {
  entregador: string
  total_clientes: number
  monto_total: number
  monto_pendiente: number
  monto_pagado: number
}

// ==========================================
// TIPOS PARA RESPUESTAS DE API
// ==========================================

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ==========================================
// TIPOS AUXILIARES
// ==========================================

export type EstadoPlanilla = "pendiente" | "alistando" | "alistado" | "en_ruta" | "completado"
export type EstadoPedido = "pendiente" | "entregado" | "fiado" | "repaso" | "devolucion"
export type EstadoUsuario = "activo" | "inactivo"
export type EstadoComision = "pendiente" | "pagado"
export type EstadoFiado = "fiado" | "pagado"
export type EstadoRecepcion = "cuadrado" | "con_diferencia"

export interface DateRange {
  desde: string
  hasta: string
}

export interface FilterOptions {
  entregador?: string
  ruta?: string
  estado?: string
  fechaInicio?: string
  fechaFin?: string
}
