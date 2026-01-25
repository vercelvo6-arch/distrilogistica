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

export async function updatePedidoEstado(
  pedidoId: string, 
  estado: string,
  montoPagado?: number,
  saldoPendiente?: number
) {
  const sql = getDB()
  try {
    // Construir el objeto de actualización dinámicamente
    const updates: any = {
      estado,
      entregado_en: estado === "entregado" ? new Date().toISOString() : null,
    }
    
    // Si es fiado y se proporcionan los montos, agregarlos
    if (estado === 'fiado' && montoPagado !== undefined && saldoPendiente !== undefined) {
      updates.monto_pagado = montoPagado
      updates.saldo_pendiente = saldoPendiente
    }

    await sql`
      UPDATE pedidos 
      SET estado = ${updates.estado},
          entregado_en = ${updates.entregado_en},
          monto_pagado = ${updates.monto_pagado ?? null},
          saldo_pendiente = ${updates.saldo_pendiente ?? null},
          updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    const pedido = await sql`SELECT planilla_id FROM pedidos WHERE id = ${pedidoId}`
    
    if (pedido.length > 0) {
      const planillaId = pedido[0].planilla_id

      const totales = await sql`
        SELECT 
          COALESCE(SUM(CASE WHEN p.estado = 'entregado' THEN p.total ELSE 0 END), 0) as total_entregado,
          COALESCE(SUM(CASE WHEN p.estado = 'fiado' THEN p.total ELSE 0 END), 0) as total_fiado,
          COALESCE(SUM(CASE WHEN p.estado = 'repaso' THEN p.total ELSE 0 END), 0) as total_repaso,
          COALESCE(SUM(CASE WHEN p.estado = 'devolucion' THEN p.total ELSE 0 END), 0) as total_devolucion
        FROM pedidos p
        WHERE p.planilla_id = ${planillaId}
      `

      await sql`
        UPDATE planillas 
        SET total_entregado = ${totales[0].total_entregado},
            total_fiado = ${totales[0].total_fiado},
            total_repaso = ${totales[0].total_repaso},
            total_devolucion = ${totales[0].total_devolucion},
            updated_at = NOW()
        WHERE id = ${planillaId}
      `
    }

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

export async function updateEstadoAlistamiento(
  codigo: string,
  entregador: string,
  estadoAlistamiento: 'pendiente' | 'completo' | 'incompleto' | 'no_alistado'
) {
  const sql = getDB()
  try {
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

export async function completarPlanilla(planillaId: string) {
  const sql = getDB()
  try {
    const planilla = await sql`
      SELECT 
        p.*,
        COALESCE(cc.porcentaje_comision, 0) as porcentaje_comision
      FROM planillas p
      LEFT JOIN comisiones_config cc ON p.entregador = cc.entregador AND cc.activo = true
      WHERE p.id = ${planillaId}
    `

    if (planilla.length === 0) {
      throw new Error('Planilla no encontrada')
    }

    const p = planilla[0]
    
    if (!p.porcentaje_comision || p.porcentaje_comision === 0) {
      throw new Error(`No hay configuración de comisión activa para ${p.entregador}. Configure el porcentaje en Admin > Comisiones > Configuración`)
    }

    console.log('[completarPlanilla] 📊 Datos de planilla:', {
      id: p.id,
      entregador: p.entregador,
      tipo_ruta: p.tipo_ruta,
      fecha: p.fecha,
      porcentaje: p.porcentaje_comision
    })
    
    const pedidos = await sql`
      SELECT 
        ped.id,
        ped.estado,
        ped.total
      FROM pedidos ped
      WHERE ped.planilla_id = ${planillaId}
    `

    let totalEntregado = 0
    let totalFiado = 0
    let totalRepaso = 0
    let totalDevolucion = 0

    for (const pedido of pedidos) {
      const productos = await sql`
        SELECT 
          cantidad,
          precio_unitario,
          total,
          devuelto,
          cantidad_entregada,
          subtotal_ajustado,
          estado_producto
        FROM pedido_productos
        WHERE pedido_id = ${pedido.id}
      `

      let totalPedidoEntregado = 0
      let totalPedidoDevuelto = 0

      for (const prod of productos) {
        const estadoProd = prod.estado_producto || 'normal'
        
        // 🚫 AGOTADOS no suman ni restan (neutral)
        if (estadoProd === 'agotado') continue
        
        // ❌ DEVUELTOS van a devolución
        if (prod.devuelto) {
          totalPedidoDevuelto += Number(prod.total)
          continue
        }

        // ✅ ENTREGADOS: Usar subtotal_ajustado si existe, sino calcular con cantidad_entregada
        if (prod.subtotal_ajustado !== null && prod.subtotal_ajustado !== undefined) {
          totalPedidoEntregado += Number(prod.subtotal_ajustado)
        } else if (prod.cantidad_entregada !== null && prod.cantidad_entregada !== undefined) {
          totalPedidoEntregado += Number(prod.cantidad_entregada) * Number(prod.precio_unitario)
        } else {
          totalPedidoEntregado += Number(prod.total)
        }
      }

      // Sumar según estado del pedido
      if (pedido.estado === 'entregado') {
        totalEntregado += totalPedidoEntregado
        totalDevolucion += totalPedidoDevuelto
      } else if (pedido.estado === 'fiado') {
        totalFiado += totalPedidoEntregado
        totalDevolucion += totalPedidoDevuelto
      } else if (pedido.estado === 'repaso') {
        totalRepaso += totalPedidoEntregado
      } else if (pedido.estado === 'devolucion') {
        // Pedido completo devuelto
        totalDevolucion += totalPedidoEntregado + totalPedidoDevuelto
      }
    }

    await sql`
      UPDATE planillas 
      SET total_entregado = ${totalEntregado},
          total_fiado = ${totalFiado},
          total_repaso = ${totalRepaso},
          total_devolucion = ${totalDevolucion},
          updated_at = NOW()
      WHERE id = ${planillaId}
    `

    // Calcular comisión: (Entregado + Fiado - Devoluciones) × %
    const baseComisionable = (totalEntregado + totalFiado) - totalDevolucion
    const montoComision = baseComisionable * (Number(p.porcentaje_comision) / 100)

    console.log('[completarPlanilla] 💰 Calculando comisión:', {
      entregado: totalEntregado,
      fiado: totalFiado,
      devoluciones: totalDevolucion,
      base: baseComisionable,
      porcentaje: p.porcentaje_comision,
      comision: montoComision
    })

    await sql`
      INSERT INTO comisiones (
        planilla_id,
        entregador,
        fecha,
        total_entregas_efectivas,
        total_devoluciones,
        base_comisionable,
        porcentaje_aplicado,
        monto_comision,
        estado
      ) VALUES (
        ${planillaId},
        ${p.entregador},
        ${p.fecha},
        ${totalEntregado + totalFiado},
        ${totalDevolucion},
        ${baseComisionable},
        ${p.porcentaje_comision},
        ${montoComision},
        'pendiente'
      )
      ON CONFLICT (planilla_id) 
      DO UPDATE SET
        total_entregas_efectivas = EXCLUDED.total_entregas_efectivas,
        total_devoluciones = EXCLUDED.total_devoluciones,
        base_comisionable = EXCLUDED.base_comisionable,
        porcentaje_aplicado = EXCLUDED.porcentaje_aplicado,
        monto_comision = EXCLUDED.monto_comision,
        updated_at = NOW()
    `

    await sql`
      UPDATE planillas 
      SET estado = 'completado',
          completado_en = NOW(),
          updated_at = NOW()
      WHERE id = ${planillaId}
    `

    console.log('[completarPlanilla] ✅ Comisión guardada:', montoComision)

    revalidatePath("/")
    return { success: true, comision: montoComision }
    
  } catch (error: any) {
    console.error("[completarPlanilla] ❌ ERROR:", error)
    throw new Error(error.message || "Error al completar la planilla")
  }
}

export async function updateCantidadEntregada(
  pedidoId: string, 
  codigo: string, 
  cantidadEntregada: number
) {
  const sql = getDB()
  try {
    // Obtener cantidad original y precio
    const producto = await sql`
      SELECT cantidad, precio_unitario 
      FROM pedido_productos 
      WHERE pedido_id = ${pedidoId} AND codigo = ${codigo}
    `
    
    if (producto.length === 0) {
      throw new Error('Producto no encontrado')
    }

    const cantidadOriginal = Number(producto[0].cantidad)
    const precioUnitario = Number(producto[0].precio_unitario)
    
    // Calcular nuevo subtotal
    const nuevoSubtotal = cantidadEntregada * precioUnitario
    
    // Determinar estado del producto
    let estadoProducto = 'normal'
    if (cantidadEntregada === 0) {
      estadoProducto = 'agotado'
    } else if (cantidadEntregada < cantidadOriginal) {
      estadoProducto = 'parcial'
    }

    // Actualizar producto
    await sql`
      UPDATE pedido_productos 
      SET cantidad_entregada = ${cantidadEntregada},
          subtotal_ajustado = ${nuevoSubtotal},
          estado_producto = ${estadoProducto},
          devuelto = false
      WHERE pedido_id = ${pedidoId} AND codigo = ${codigo}
    `

    // Recalcular totales del pedido
    const pedido = await sql`SELECT planilla_id FROM pedidos WHERE id = ${pedidoId}`
    
    if (pedido.length > 0) {
      const planillaId = pedido[0].planilla_id

      // Recalcular totales de la planilla
      const totales = await sql`
        SELECT 
          COALESCE(SUM(CASE WHEN p.estado = 'entregado' THEN p.total ELSE 0 END), 0) as total_entregado,
          COALESCE(SUM(CASE WHEN p.estado = 'fiado' THEN p.total ELSE 0 END), 0) as total_fiado,
          COALESCE(SUM(CASE WHEN p.estado = 'repaso' THEN p.total ELSE 0 END), 0) as total_repaso,
          COALESCE(SUM(CASE WHEN p.estado = 'devolucion' THEN p.total ELSE 0 END), 0) as total_devolucion
        FROM pedidos p
        WHERE p.planilla_id = ${planillaId}
      `

      await sql`
        UPDATE planillas 
        SET total_entregado = ${totales[0].total_entregado},
            total_fiado = ${totales[0].total_fiado},
            total_repaso = ${totales[0].total_repaso},
            total_devolucion = ${totales[0].total_devolucion},
            updated_at = NOW()
        WHERE id = ${planillaId}
      `
    }

    revalidatePath("/")
    return { success: true, nuevoSubtotal, estadoProducto }
    
  } catch (error) {
    console.error("[updateCantidadEntregada] ❌ ERROR:", error)
    throw error
  }
}

export async function updateSubtotalAjustado(pedidoId: string, codigo: string, subtotalAjustado: number) {
  const sql = getDB()
  try {
    await sql`
      UPDATE pedido_productos 
      SET subtotal_ajustado = ${subtotalAjustado},
          updated_at = NOW()
      WHERE pedido_id = ${pedidoId} AND codigo = ${codigo}
    `

    revalidatePath("/")
    return { success: true, subtotalAjustado }
    
  } catch (error) {
    console.error("[updateSubtotalAjustado] ❌ ERROR:", error)
    throw error
  }
}

export async function updateDescuentoPedido(pedidoId: string, descuento: number) {
  const sql = getDB()
  try {
    await sql`
      UPDATE pedidos 
      SET descuento = ${descuento},
          updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log('[updateDescuentoPedido] ✓ Descuento actualizado:', {
      pedidoId,
      descuento
    })

    revalidatePath("/")
    return { success: true, descuento }
    
  } catch (error) {
    console.error("[updateDescuentoPedido] ❌ ERROR:", error)
    throw error
  }
}

export async function updateMotivoDescuentoPedido(pedidoId: string, motivo: string) {
  const sql = getDB()
  try {
    await sql`
      UPDATE pedidos 
      SET motivo_descuento = ${motivo},
          updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log('[updateMotivoDescuentoPedido] ✓ Motivo actualizado:', {
      pedidoId,
      motivo
    })

    revalidatePath("/")
    return { success: true, motivo }
    
  } catch (error) {
    console.error("[updateMotivoDescuentoPedido] ❌ ERROR:", error)
    throw error
  }
}
export async function updateMotivoAjuste(
  pedidoId: string,
  codigoProducto: string,
  motivoAjuste: string | null
) {
  const sql = getDB()
  try {
    await sql`
      UPDATE pedido_productos
      SET motivo_ajuste = ${motivoAjuste},
          updated_at = NOW()
      WHERE pedido_id = ${pedidoId}
        AND codigo = ${codigoProducto}
    `

    console.log('[updateMotivoAjuste] ✓ Motivo de ajuste actualizado:', {
      pedidoId,
      codigoProducto,
      motivoAjuste
    })

    revalidatePath("/")
    return { success: true, motivoAjuste }
    
  } catch (error) {
    console.error("[updateMotivoAjuste] ❌ ERROR:", error)
    throw error
  }
}
