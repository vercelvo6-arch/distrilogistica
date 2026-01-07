"use server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { revalidatePath } from "next/cache"

export async function updatePlanillaEstado(planillaId: string, estado: string, userId?: string) {
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
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[updatePlanillaEstado] ❌ ERROR:", error)
    throw error
  }
}

export async function updatePedidoEstado(pedidoId: string, estado: string) {
  const sql = getDB()
  try {
    await sql`
      UPDATE pedidos 
      SET estado = ${estado},
          entregado_en = ${estado === "entregado" ? new Date().toISOString() : null},
          updated_at = NOW()
      WHERE id = ${pedidoId}
    `
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[updatePedidoEstado] ❌ ERROR:", error)
    throw error
  }
}

export async function updateProductoDevuelto(pedidoId: string, codigo: string, devuelto: boolean) {
  const sql = getDB()
  try {
    await sql`
      UPDATE pedido_productos 
      SET devuelto = ${devuelto}
      WHERE pedido_id = ${pedidoId} AND codigo = ${codigo}
    `
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
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[updatePlanillaTotales] ❌ ERROR:", error)
    throw error
  }
}

export async function completarPlanilla(planillaId: string) {
  const sql = getDB()
  try {
    await sql`
      UPDATE planillas 
      SET estado = 'completado', updated_at = NOW()
      WHERE id = ${planillaId}
    `
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[completarPlanilla] ❌ ERROR:", error)
    throw error
  }
}

// ✅ NUEVA FUNCIÓN: Actualizar estado de alistamiento por producto
export async function updateEstadoAlistamiento(
  codigo: string,
  entregador: string,
  estadoAlistamiento: 'pendiente' | 'completo' | 'incompleto' | 'no_alistado'
) {
  const sql = getDB()
  try {
    // Actualizar todos los productos con ese código para ese entregador
    await sql`
      UPDATE pedido_productos pp
      SET estado_alistamiento = ${estadoAlistamiento}
      FROM pedidos ped
      JOIN planillas pl ON ped.planilla_id = pl.id
      WHERE pp.pedido_id = ped.id
        AND pp.codigo = ${codigo}
        AND pl.entregador = ${entregador}
        AND pl.estado IN ('pendiente', 'alistando')
    `
    
    revalidatePath("/")
    return { success: true }
    
  } catch (error) {
    console.error("[updateEstadoAlistamiento] ❌ ERROR:", error)
    throw error
  }
}
