"use server"

import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { revalidatePath } from "next/cache"
import type { RouteSheet } from "@/lib/types"
import { calcularComisionPlanilla } from "./comisiones"

export async function createPlanillas(routeSheets: RouteSheet[]) {
  const sql = getDB()
  const session = await getSession()

  if (!session) throw new Error("No autenticado")

  // Insert planillas
  for (const sheet of routeSheets) {
    await sql`
      INSERT INTO planillas (
        id, fecha, tipo_ruta, entregador, total_cargue,
        total_entregado, total_fiado, total_repaso, total_devolucion,
        estado, observaciones
      ) VALUES (
        ${sheet.id}, ${sheet.fecha}, ${sheet.ruta}, ${sheet.entregador || null},
        ${sheet.totalAmount}, 0, 0, 0, 0, 'pendiente', NULL
      )
    `

    // Insert pedidos
    for (let index = 0; index < sheet.orders.length; index++) {
      const order = sheet.orders[index]
      await sql`
        INSERT INTO pedidos (
          id, planilla_id, secuencia, cliente, direccion, telefono,
          barrio, total, estado, observaciones
        ) VALUES (
          ${order.id}, ${sheet.id}, ${index + 1}, ${order.cliente},
          '', '', '', ${order.total}, 'pendiente', ${order.comentarios || null}
        )
      `

      // Insert pedido_productos
      for (const item of order.items) {
        await sql`
          INSERT INTO pedido_productos (
            pedido_id, codigo, nombre, cantidad, precio_unitario, total, devuelto
          ) VALUES (
            ${order.id}, ${item.codigo}, ${item.descripcion}, ${item.cantidad},
            ${item.valorUnidad}, ${item.subtotal}, false
          )
        `
      }
    }
  }

  revalidatePath("/")
  return { success: true }
}

export async function getPlanillas() {
  const sql = getDB()

  const planillas = await sql`
    SELECT 
      p.*,
      json_agg(
        json_build_object(
          'id', ped.id,
          'planilla_id', ped.planilla_id,
          'secuencia', ped.secuencia,
          'cliente', ped.cliente,
          'direccion', ped.direccion,
          'telefono', ped.telefono,
          'barrio', ped.barrio,
          'total', ped.total,
          'estado', ped.estado,
          'observaciones', ped.observaciones,
          'pedido_productos', (
            SELECT json_agg(
              json_build_object(
                'pedido_id', pp.pedido_id,
                'codigo', pp.codigo,
                'nombre', pp.nombre,
                'cantidad', pp.cantidad,
                'precio_unitario', pp.precio_unitario,
                'total', pp.total,
                'devuelto', pp.devuelto
              )
            )
            FROM pedido_productos pp
            WHERE pp.pedido_id = ped.id
          )
        )
      ) as pedidos
    FROM planillas p
    LEFT JOIN pedidos ped ON p.id = ped.planilla_id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `

  // Transform to RouteSheet format
  const routeSheets: RouteSheet[] = planillas.map((planilla: any) => ({
    id: planilla.id,
    ruta: planilla.tipo_ruta,
    fecha: planilla.fecha,
    entregador: planilla.entregador,
    estado: planilla.estado,
    totalOrders: planilla.pedidos?.length || 0,
    totalAmount: planilla.total_cargue || 0,
    montoCargue: planilla.total_cargue,
    montoEntregado: planilla.total_entregado,
    montoFiado: planilla.total_fiado,
    montoDevoluciones: planilla.total_devolucion,
    montoRepasos: planilla.total_repaso,
    orders: (planilla.pedidos || []).map((pedido: any) => ({
      id: pedido.id,
      cliente: pedido.cliente,
      ruta: planilla.tipo_ruta,
      fecha: planilla.fecha,
      estado: pedido.estado,
      total: pedido.total,
      comentarios: pedido.observaciones,
      entregador: planilla.entregador,
      items: (pedido.pedido_productos || []).map((producto: any) => ({
        codigo: producto.codigo,
        descripcion: producto.nombre,
        categoria: "",
        cantidad: producto.cantidad,
        valorUnidad: producto.precio_unitario,
        subtotal: producto.total,
        devuelto: producto.devuelto,
      })),
    })),
    cuentasPorCobrar: [],
  }))

  return routeSheets
}

export async function updatePlanillaEstado(planillaId: string, estado: string, userId?: string) {
  const sql = getDB()

  if (estado === "alistado" && userId) {
    await sql`
      UPDATE planillas 
      SET estado = ${estado}, 
          alistado_por = ${userId}, 
          alistado_en = NOW(),
          updated_at = NOW()
      WHERE id = ${planillaId}
    `
  } else {
    await sql`
      UPDATE planillas 
      SET estado = ${estado}, updated_at = NOW()
      WHERE id = ${planillaId}
    `
  }

  revalidatePath("/")
  return { success: true }
}

export async function updatePedidoEstado(pedidoId: string, estado: string) {
  const sql = getDB()

  await sql`
    UPDATE pedidos 
    SET estado = ${estado},
        entregado_en = ${estado === "entregado" ? new Date().toISOString() : null},
        updated_at = NOW()
    WHERE id = ${pedidoId}
  `

  revalidatePath("/")
  return { success: true }
}

export async function updateProductoDevuelto(pedidoId: string, codigo: string, devuelto: boolean) {
  const sql = getDB()

  await sql`
    UPDATE pedido_productos 
    SET devuelto = ${devuelto}
    WHERE pedido_id = ${pedidoId} AND codigo = ${codigo}
  `

  revalidatePath("/")
  return { success: true }
}

export async function updatePlanillaTotales(
  planillaId: string,
  totales: {
    total_entregado: number
    total_fiado: number
    total_repaso: number
    total_devolucion: number
  },
) {
  const sql = getDB()

  await sql`
    UPDATE planillas 
    SET total_entregado = ${totales.total_entregado},
        total_fiado = ${totales.total_fiado},
        total_repaso = ${totales.total_repaso},
        total_devolucion = ${totales.total_devolucion},
        updated_at = NOW()
    WHERE id = ${planillaId}
  `

  try {
    await calcularComisionPlanilla(planillaId)
  } catch (err) {
    console.error("Error calculating commission:", err)
  }

  revalidatePath("/")
  return { success: true }
}

export async function completarPlanilla(planillaId: string) {
  const sql = getDB()

  await sql`
    UPDATE planillas 
    SET estado = 'completado', updated_at = NOW()
    WHERE id = ${planillaId}
  `

  await calcularComisionPlanilla(planillaId)

  revalidatePath("/")
  return { success: true }
}
