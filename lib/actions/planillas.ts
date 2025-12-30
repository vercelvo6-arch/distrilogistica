"use server"

import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { revalidatePath } from "next/cache"
import type { RouteSheet } from "@/lib/types"
import { calcularComisionPlanilla } from "./comisiones"

export async function createPlanillas(routeSheets: RouteSheet[]) {
  console.log("[createPlanillas] Iniciando creación de planillas:", routeSheets.length)
  
  const sql = getDB()
  const session = await getSession()

  if (!session) {
    console.error("[createPlanillas] No hay sesión activa")
    throw new Error("No autenticado")
  }

  console.log("[createPlanillas] Usuario:", session.user.nombre, "Rol:", session.user.rol)

  try {
    // Insert planillas
    for (const sheet of routeSheets) {
      console.log(`[createPlanillas] Procesando planilla: ${sheet.id}, Ruta: ${sheet.ruta}`)
      
      // Insertar planilla principal
      await sql`
        INSERT INTO planillas (
          id, fecha, tipo_ruta, entregador, total_cargue,
          total_entregado, total_fiado, total_repaso, total_devolucion,
          estado, observaciones, created_at, updated_at
        ) VALUES (
          ${sheet.id}, 
          ${sheet.fecha}, 
          ${sheet.ruta}, 
          ${sheet.entregador || null},
          ${sheet.totalAmount}, 
          ${0}, 
          ${0}, 
          ${0}, 
          ${0}, 
          ${'pendiente'}, 
          ${null},
          NOW(),
          NOW()
        )
      `

      console.log(`[createPlanillas] ✓ Planilla ${sheet.id} insertada`)

      // Insert pedidos
      for (let index = 0; index < sheet.orders.length; index++) {
        const order = sheet.orders[index]
        
        console.log(`[createPlanillas] Insertando pedido ${order.id} (${index + 1}/${sheet.orders.length})`)
        
        await sql`
          INSERT INTO pedidos (
            id, planilla_id, secuencia, cliente, direccion, telefono,
            barrio, total, estado, observaciones, created_at, updated_at
          ) VALUES (
            ${order.id}, 
            ${sheet.id}, 
            ${index + 1}, 
            ${order.cliente},
            ${''},  -- direccion vacía por ahora
            ${''},  -- telefono vacío por ahora
            ${''},  -- barrio vacío por ahora
            ${order.total}, 
            ${'pendiente'}, 
            ${order.comentarios || null},
            NOW(),
            NOW()
          )
        `

        // Insert pedido_productos
        for (const item of order.items) {
          console.log(`[createPlanillas] Insertando producto ${item.codigo} del pedido ${order.id}`)
          
          await sql`
            INSERT INTO pedido_productos (
              pedido_id, codigo, nombre, cantidad, precio_unitario, total, devuelto
            ) VALUES (
              ${order.id}, 
              ${item.codigo}, 
              ${item.descripcion}, 
              ${item.cantidad},
              ${item.valorUnidad}, 
              ${item.subtotal}, 
              ${false}
            )
          `
        }
        
        console.log(`[createPlanillas] ✓ Pedido ${order.id} completo con ${order.items.length} productos`)
      }
      
      console.log(`[createPlanillas] ✓ Planilla ${sheet.id} completada con ${sheet.orders.length} pedidos`)
    }

    console.log("[createPlanillas] ✓ TODAS las planillas creadas exitosamente")
    revalidatePath("/")
    return { success: true, count: routeSheets.length }
    
  } catch (error) {
    console.error("[createPlanillas] ❌ ERROR:", error)
    console.error("[createPlanillas] Error stack:", error instanceof Error ? error.stack : "No stack available")
    throw new Error(`Error al crear planillas: ${error instanceof Error ? error.message : 'Error desconocido'}`)
  }
}

export async function getPlanillas() {
  console.log("[getPlanillas] Obteniendo planillas de la BD")
  const sql = getDB()

  try {
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
          ) ORDER BY ped.secuencia
        ) FILTER (WHERE ped.id IS NOT NULL) as pedidos
      FROM planillas p
      LEFT JOIN pedidos ped ON p.id = ped.planilla_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `

    console.log(`[getPlanillas] ✓ Obtenidas ${planillas.length} planillas`)

    // Transform to RouteSheet format
    const routeSheets: RouteSheet[] = planillas.map((planilla: any) => {
      const pedidos = planilla.pedidos || []
      
      return {
        id: planilla.id,
        ruta: planilla.tipo_ruta,
        fecha: planilla.fecha,
        entregador: planilla.entregador,
        estado: planilla.estado,
        totalOrders: pedidos.length,
        totalAmount: Number(planilla.total_cargue) || 0,
        montoCargue: Number(planilla.total_cargue) || 0,
        montoEntregado: Number(planilla.total_entregado) || 0,
        montoFiado: Number(planilla.total_fiado) || 0,
        montoDevoluciones: Number(planilla.total_devolucion) || 0,
        montoRepasos: Number(planilla.total_repaso) || 0,
        orders: pedidos.map((pedido: any) => ({
          id: pedido.id,
          cliente: pedido.cliente,
          ruta: planilla.tipo_ruta,
          fecha: planilla.fecha,
          estado: pedido.estado,
          total: Number(pedido.total) || 0,
          montoPagado: 0,
          saldoPendiente: Number(pedido.total) || 0,
          comentarios: pedido.observaciones,
          entregador: planilla.entregador,
          items: (pedido.pedido_productos || []).map((producto: any) => ({
            codigo: producto.codigo,
            descripcion: producto.nombre,
            categoria: "",
            cantidad: Number(producto.cantidad) || 0,
            valorUnidad: Number(producto.precio_unitario) || 0,
            subtotal: Number(producto.total) || 0,
            devuelto: producto.devuelto || false,
          })),
        })),
        cuentasPorCobrar: [],
      }
    })

    return routeSheets
    
  } catch (error) {
    console.error("[getPlanillas] ❌ ERROR:", error)
    throw error
  }
}

export async function updatePlanillaEstado(planillaId: string, estado: string, userId?: string) {
  console.log(`[updatePlanillaEstado] Planilla: ${planillaId}, Estado: ${estado}, Usuario: ${userId}`)
  const sql = getDB()

  try {
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

    console.log(`[updatePlanillaEstado] ✓ Estado actualizado`)
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[updatePlanillaEstado] ❌ ERROR:", error)
    throw error
  }
}

export async function updatePedidoEstado(pedidoId: string, estado: string) {
  console.log(`[updatePedidoEstado] Pedido: ${pedidoId}, Estado: ${estado}`)
  const sql = getDB()

  try {
    await sql`
      UPDATE pedidos 
      SET estado = ${estado},
          entregado_en = ${estado === "entregado" ? new Date().toISOString() : null},
          updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log(`[updatePedidoEstado] ✓ Estado actualizado`)
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[updatePedidoEstado] ❌ ERROR:", error)
    throw error
  }
}

export async function updateProductoDevuelto(pedidoId: string, codigo: string, devuelto: boolean) {
  console.log(`[updateProductoDevuelto] Pedido: ${pedidoId}, Producto: ${codigo}, Devuelto: ${devuelto}`)
  const sql = getDB()

  try {
    await sql`
      UPDATE pedido_productos 
      SET devuelto = ${devuelto}
      WHERE pedido_id = ${pedidoId} AND codigo = ${codigo}
    `

    console.log(`[updateProductoDevuelto] ✓ Producto actualizado`)
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[updateProductoDevuelto] ❌ ERROR:", error)
    throw error
  }
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
  console.log(`[updatePlanillaTotales] Planilla: ${planillaId}`, totales)
  const sql = getDB()

  try {
    await sql`
      UPDATE planillas 
      SET total_entregado = ${totales.total_entregado},
          total_fiado = ${totales.total_fiado},
          total_repaso = ${totales.total_repaso},
          total_devolucion = ${totales.total_devolucion},
          updated_at = NOW()
      WHERE id = ${planillaId}
    `

    console.log(`[updatePlanillaTotales] ✓ Totales actualizados`)

    try {
      await calcularComisionPlanilla(planillaId)
      console.log(`[updatePlanillaTotales] ✓ Comisión calculada`)
    } catch (err) {
      console.error("[updatePlanillaTotales] Error calculando comisión:", err)
    }

    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[updatePlanillaTotales] ❌ ERROR:", error)
    throw error
  }
}

export async function completarPlanilla(planillaId: string) {
  console.log(`[completarPlanilla] Planilla: ${planillaId}`)
  const sql = getDB()

  try {
    await sql`
      UPDATE planillas 
      SET estado = 'completado', updated_at = NOW()
      WHERE id = ${planillaId}
    `

    await calcularComisionPlanilla(planillaId)

    console.log(`[completarPlanilla] ✓ Planilla completada`)
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[completarPlanilla] ❌ ERROR:", error)
    throw error
  }
}
