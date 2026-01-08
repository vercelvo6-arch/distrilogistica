// /lib/actions/planillas.ts

import { sql } from '@vercel/postgres'

export async function updatePedidoEstado(pedidoId: string, estado: string) {
  try {
    console.log(`[UPDATE_PEDIDO] Iniciando actualización - Pedido: ${pedidoId}, Estado: ${estado}`)
    
    // 1. Actualizar el estado del pedido
    await sql`
      UPDATE pedidos 
      SET estado = ${estado} 
      WHERE id = ${pedidoId}
    `
    
    // 2. Obtener la planilla_id del pedido
    const pedidoResult = await sql`
      SELECT planilla_id 
      FROM pedidos 
      WHERE id = ${pedidoId}
    `
    
    if (pedidoResult.rows.length === 0) {
      throw new Error(`Pedido ${pedidoId} no encontrado`)
    }
    
    const planillaId = pedidoResult.rows[0].planilla_id
    console.log(`[UPDATE_PEDIDO] Planilla ID: ${planillaId}`)
    
    // 3. Calcular totales considerando productos devueltos
    const totalesResult = await sql`
      SELECT 
        COALESCE(
          SUM(
            CASE 
              WHEN p.estado = 'entregado' 
              THEN (
                SELECT COALESCE(SUM(pp.total), 0) 
                FROM pedido_productos pp 
                WHERE pp.pedido_id = p.id 
                AND (pp.devuelto = false OR pp.devuelto IS NULL)
              )
              ELSE 0 
            END
          ), 0
        )::numeric as total_entregado,
        
        COALESCE(
          SUM(
            CASE 
              WHEN p.estado = 'fiado' 
              THEN (
                SELECT COALESCE(SUM(pp.total), 0) 
                FROM pedido_productos pp 
                WHERE pp.pedido_id = p.id 
                AND (pp.devuelto = false OR pp.devuelto IS NULL)
              )
              ELSE 0 
            END
          ), 0
        )::numeric as total_fiado,
        
        COALESCE(
          SUM(
            CASE 
              WHEN p.estado = 'devolucion' 
              THEN (
                SELECT COALESCE(SUM(pp.total), 0) 
                FROM pedido_productos pp 
                WHERE pp.pedido_id = p.id 
                AND (pp.devuelto = false OR pp.devuelto IS NULL)
              )
              ELSE 0 
            END
          ), 0
        )::numeric as total_devolucion,
        
        COALESCE(
          SUM(
            CASE 
              WHEN p.estado = 'repaso' 
              THEN (
                SELECT COALESCE(SUM(pp.total), 0) 
                FROM pedido_productos pp 
                WHERE pp.pedido_id = p.id 
                AND (pp.devuelto = false OR pp.devuelto IS NULL)
              )
              ELSE 0 
            END
          ), 0
        )::numeric as total_repaso,
        
        COALESCE(
          (
            SELECT SUM(pp.total) 
            FROM pedido_productos pp 
            JOIN pedidos p2 ON pp.pedido_id = p2.id 
            WHERE p2.planilla_id = ${planillaId} 
            AND pp.devuelto = true
          ), 0
        )::numeric as total_productos_devueltos
        
      FROM pedidos p 
      WHERE p.planilla_id = ${planillaId}
    `
    
    const totales = totalesResult.rows[0]
    
    console.log(`[UPDATE_PEDIDO] Totales calculados:`, {
      entregado: totales.total_entregado,
      fiado: totales.total_fiado,
      devolucion: totales.total_devolucion,
      repaso: totales.total_repaso,
      productos_devueltos: totales.total_productos_devueltos
    })
    
    // 4. Actualizar los totales de la planilla
    await sql`
      UPDATE planillas 
      SET 
        total_entregado = ${totales.total_entregado},
        total_fiado = ${totales.total_fiado},
        total_devolucion = ${totales.total_devolucion + totales.total_productos_devueltos},
        total_repaso = ${totales.total_repaso},
        updated_at = NOW()
      WHERE id = ${planillaId}
    `
    
    console.log(`[UPDATE_PEDIDO] ✅ Planilla ${planillaId} actualizada correctamente`)
    
    return { success: true }
    
  } catch (error) {
    console.error('[UPDATE_PEDIDO] ❌ Error:', error)
    throw error
  }
}

// También actualiza la función de productos devueltos
export async function updateProductoDevuelto(
  pedidoId: string, 
  codigo: string, 
  devuelto: boolean
) {
  try {
    console.log(`[UPDATE_PRODUCTO_DEVUELTO] Pedido: ${pedidoId}, Código: ${codigo}, Devuelto: ${devuelto}`)
    
    // 1. Actualizar el producto
    await sql`
      UPDATE pedido_productos 
      SET devuelto = ${devuelto}
      WHERE pedido_id = ${pedidoId} 
      AND codigo = ${codigo}
    `
    
    // 2. Obtener el estado del pedido y su planilla
    const pedidoResult = await sql`
      SELECT planilla_id, estado 
      FROM pedidos 
      WHERE id = ${pedidoId}
    `
    
    if (pedidoResult.rows.length === 0) {
      throw new Error(`Pedido ${pedidoId} no encontrado`)
    }
    
    const { planilla_id, estado } = pedidoResult.rows[0]
    
    // 3. Recalcular totales de la planilla
    const totalesResult = await sql`
      SELECT 
        COALESCE(
          SUM(
            CASE 
              WHEN p.estado = 'entregado' 
              THEN (
                SELECT COALESCE(SUM(pp.total), 0) 
                FROM pedido_productos pp 
                WHERE pp.pedido_id = p.id 
                AND (pp.devuelto = false OR pp.devuelto IS NULL)
              )
              ELSE 0 
            END
          ), 0
        )::numeric as total_entregado,
        
        COALESCE(
          SUM(
            CASE 
              WHEN p.estado = 'fiado' 
              THEN (
                SELECT COALESCE(SUM(pp.total), 0) 
                FROM pedido_productos pp 
                WHERE pp.pedido_id = p.id 
                AND (pp.devuelto = false OR pp.devuelto IS NULL)
              )
              ELSE 0 
            END
          ), 0
        )::numeric as total_fiado,
        
        COALESCE(
          SUM(
            CASE 
              WHEN p.estado = 'devolucion' 
              THEN (
                SELECT COALESCE(SUM(pp.total), 0) 
                FROM pedido_productos pp 
                WHERE pp.pedido_id = p.id 
                AND (pp.devuelto = false OR pp.devuelto IS NULL)
              )
              ELSE 0 
            END
          ), 0
        )::numeric as total_devolucion,
        
        COALESCE(
          SUM(
            CASE 
              WHEN p.estado = 'repaso' 
              THEN (
                SELECT COALESCE(SUM(pp.total), 0) 
                FROM pedido_productos pp 
                WHERE pp.pedido_id = p.id 
                AND (pp.devuelto = false OR pp.devuelto IS NULL)
              )
              ELSE 0 
            END
          ), 0
        )::numeric as total_repaso,
        
        COALESCE(
          (
            SELECT SUM(pp.total) 
            FROM pedido_productos pp 
            JOIN pedidos p2 ON pp.pedido_id = p2.id 
            WHERE p2.planilla_id = ${planilla_id} 
            AND pp.devuelto = true
          ), 0
        )::numeric as total_productos_devueltos
        
      FROM pedidos p 
      WHERE p.planilla_id = ${planilla_id}
    `
    
    const totales = totalesResult.rows[0]
    
    console.log(`[UPDATE_PRODUCTO_DEVUELTO] Totales recalculados:`, totales)
    
    // 4. Actualizar planilla
    await sql`
      UPDATE planillas 
      SET 
        total_entregado = ${totales.total_entregado},
        total_fiado = ${totales.total_fiado},
        total_devolucion = ${totales.total_devolucion + totales.total_productos_devueltos},
        total_repaso = ${totales.total_repaso},
        updated_at = NOW()
      WHERE id = ${planilla_id}
    `
    
    console.log(`[UPDATE_PRODUCTO_DEVUELTO] ✅ Producto actualizado correctamente`)
    
    return { success: true }
    
  } catch (error) {
    console.error('[UPDATE_PRODUCTO_DEVUELTO] ❌ Error:', error)
    throw error
  }
}

// Función auxiliar para verificar totales (útil para debugging)
export async function verificarTotalesPlanilla(planillaId: string) {
  try {
    const result = await sql`
      SELECT 
        pl.id,
        pl.tipo_ruta,
        pl.total_cargue,
        pl.total_entregado,
        pl.total_fiado,
        pl.total_devolucion,
        pl.total_repaso,
        COUNT(p.id) as total_pedidos,
        COUNT(CASE WHEN p.estado = 'entregado' THEN 1 END) as pedidos_entregados,
        COUNT(CASE WHEN p.estado = 'fiado' THEN 1 END) as pedidos_fiados,
        COUNT(CASE WHEN p.estado = 'devolucion' THEN 1 END) as pedidos_devolucion,
        COUNT(CASE WHEN p.estado = 'repaso' THEN 1 END) as pedidos_repaso,
        COUNT(CASE WHEN p.estado = 'pendiente' THEN 1 END) as pedidos_pendientes
      FROM planillas pl
      LEFT JOIN pedidos p ON p.planilla_id = pl.id
      WHERE pl.id = ${planillaId}
      GROUP BY pl.id
    `
    
    console.log('[VERIFICAR_TOTALES] Estado de la planilla:', result.rows[0])
    
    return result.rows[0]
    
  } catch (error) {
    console.error('[VERIFICAR_TOTALES] Error:', error)
    throw error
  }
}
