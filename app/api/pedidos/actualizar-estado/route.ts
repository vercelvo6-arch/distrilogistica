import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      pedidoId,
      estado,
      observaciones,
      itemsDevueltos,
      totalEntregado,
      totalDevuelto,
      montoRecibido
    } = body

    console.log('[API actualizar-estado] Datos recibidos:', {
      pedidoId,
      estado,
      totalEntregado,
      totalDevuelto,
      montoRecibido,
      itemsDevueltos
    })

    if (!pedidoId || !estado) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const sql = getDB()

    // 1. Actualizar estado del pedido
    await sql`
      UPDATE pedidos
      SET 
        estado = ${estado},
        observaciones = ${observaciones || null},
        entregado_en = NOW(),
        updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    // 2. Si hay monto recibido parcial, actualizar productos
    if (montoRecibido !== null && montoRecibido !== undefined) {
      await sql`
        UPDATE pedido_productos
        SET 
          monto_recibido = ${montoRecibido},
          updated_at = NOW()
        WHERE pedido_id = ${pedidoId}
      `
      console.log(`[API actualizar-estado] ✓ Monto recibido actualizado: ${montoRecibido}`)
    }

    // 3. Marcar productos devueltos
    if (itemsDevueltos && itemsDevueltos.length > 0) {
      for (const codigo of itemsDevueltos) {
        await sql`
          UPDATE pedido_productos
          SET devuelto = true, updated_at = NOW()
          WHERE pedido_id = ${pedidoId}
          AND codigo = ${codigo}
        `
      }
      console.log(`[API actualizar-estado] ✓ ${itemsDevueltos.length} productos marcados como devueltos`)
    }

    // 4. Actualizar totales de la planilla
    const planillaResult = await sql`
      SELECT planilla_id FROM pedidos WHERE id = ${pedidoId}
    `

    if (planillaResult.length > 0) {
      const planillaId = planillaResult[0].planilla_id

      // Calcular nuevos totales de la planilla
      const totales = await sql`
        SELECT 
          SUM(CASE 
            WHEN p.estado = 'entregado' THEN 
              COALESCE(prod.monto_recibido, prod.total)
            ELSE 0 
          END) as total_entregado,
          SUM(CASE WHEN p.estado = 'fiado' THEN p.total ELSE 0 END) as total_fiado,
          SUM(CASE 
            WHEN p.estado = 'devolucion' THEN p.total 
            WHEN prod.devuelto = true THEN prod.total
            WHEN prod.monto_recibido IS NOT NULL THEN (prod.total - prod.monto_recibido)
            ELSE 0 
          END) as total_devolucion,
          SUM(CASE WHEN p.estado = 'repaso' THEN p.total ELSE 0 END) as total_repaso
        FROM pedidos p
        LEFT JOIN pedido_productos prod ON prod.pedido_id = p.id
        WHERE p.planilla_id = ${planillaId}
      `

      await sql`
        UPDATE planillas
        SET 
          total_entregado = ${totales[0].total_entregado || 0},
          total_fiado = ${totales[0].total_fiado || 0},
          total_devolucion = ${totales[0].total_devolucion || 0},
          total_repaso = ${totales[0].total_repaso || 0},
          updated_at = NOW()
        WHERE id = ${planillaId}
      `

      console.log('[API actualizar-estado] ✓ Totales de planilla actualizados:', totales[0])
    }

    return NextResponse.json({
      success: true,
      message: 'Pedido actualizado correctamente'
    })

  } catch (error) {
    console.error('[API actualizar-estado] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al actualizar pedido',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
