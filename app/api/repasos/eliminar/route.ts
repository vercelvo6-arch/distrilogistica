import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { registrarSnapshotPedido } from '@/lib/eliminaciones-historial'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const sql = getDB()
    // Obtener todos los pedidos con estado 'repaso' con datos de la planilla origen
    const repasos = await sql`
      SELECT 
        p.id,
        p.planilla_id,
        p.cliente,
        p.direccion,
        p.telefono,
        p.barrio,
        p.secuencia,
        p.total,
        p.estado,
        p.observaciones,
        p.entregado_en,
        p.created_at,
        p.updated_at,
        p.monto_pagado,
        p.saldo_pendiente,
        pl.tipo_ruta as ruta_origen,
        pl.fecha as fecha_origen,
        pl.entregador as entregador_origen
      FROM pedidos p
      LEFT JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'repaso'
      ORDER BY p.created_at DESC
    `
    // Obtener los productos de cada repaso
    const repasosConProductos = await Promise.all(
      repasos.map(async (repaso) => {
        const productos = await sql`
          SELECT 
            id,
            pedido_id,
            codigo,
            nombre,
            cantidad,
            precio_unitario,
            total
          FROM pedido_productos
          WHERE pedido_id = ${repaso.id}
          ORDER BY id
        `
        return {
          id: repaso.id,
          cliente: repaso.cliente,
          planilla_origen_id: repaso.planilla_id,
          ruta_origen: repaso.ruta_origen || 'N/A',
          fecha_origen: repaso.fecha_origen || new Date().toISOString(),
          entregador_origen: repaso.entregador_origen || 'N/A',
          total: Number(repaso.total),
          observaciones: repaso.observaciones,
          productos: productos.map((p) => ({
            codigo: p.codigo,
            nombre: p.nombre,
            cantidad: Number(p.cantidad),
            precio_unitario: Number(p.precio_unitario),
            total: Number(p.total)
          }))
        }
      })
    )
    console.log('[API repasos GET] ✓ Repasos obtenidos:', repasosConProductos.length)
    return NextResponse.json({
      success: true,
      repasos: repasosConProductos,
      total: repasosConProductos.length
    })
  } catch (error) {
    console.error('[API repasos GET] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al obtener repasos',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  console.log('\n🗑️ [ELIMINAR REPASO] ===== INICIO =====')
  
  try {
    const session = await getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    
    if (!['administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado. Solo administradores pueden eliminar repasos.' }, { status: 403 })
    }

    const body = await request.json()
    console.log('[ELIMINAR REPASO] 📥 Datos recibidos:', body)
    
    const { pedidoId } = body

    if (!pedidoId) {
      console.error('[ELIMINAR REPASO] ❌ Validación falló')
      return NextResponse.json(
        { error: 'pedidoId es requerido' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Verificar que el pedido existe y es un repaso
    console.log('[ELIMINAR REPASO] 🔍 Buscando pedido:', pedidoId)
    
    const pedido = await sql`
      SELECT 
        p.id, 
        p.total, 
        p.estado, 
        p.planilla_id,
        p.cliente
      FROM pedidos p
      WHERE p.id = ${pedidoId} AND p.estado = 'repaso'
    `

    if (pedido.length === 0) {
      console.error('[ELIMINAR REPASO] ❌ Pedido no encontrado o no es un repaso')
      return NextResponse.json(
        { error: 'Pedido no encontrado o no es un repaso' },
        { status: 404 }
      )
    }

    console.log('[ELIMINAR REPASO] ✅ Pedido encontrado:', {
      cliente: pedido[0].cliente,
      total: pedido[0].total,
      planillaId: pedido[0].planilla_id
    })

    const totalPedido = Number(pedido[0].total)
    const planillaId = pedido[0].planilla_id

    await sql`BEGIN`
    try {
      // Respaldar el pedido + sus productos antes de borrar
      await registrarSnapshotPedido(
        sql,
        pedidoId,
        { id: session.user.id, nombre: session.user.nombre },
        'repasos/eliminar'
      )

      // Eliminar productos del pedido
      console.log('[ELIMINAR REPASO] 🗑️ Eliminando productos del pedido...')

      await sql`
        DELETE FROM pedido_productos
        WHERE pedido_id = ${pedidoId}
      `

      console.log('[ELIMINAR REPASO] ✅ Productos eliminados')

      // Eliminar el pedido
      console.log('[ELIMINAR REPASO] 🗑️ Eliminando pedido...')

      await sql`
        DELETE FROM pedidos
        WHERE id = ${pedidoId}
      `

      console.log('[ELIMINAR REPASO] ✅ Pedido eliminado')

      // Actualizar total_cargue de la planilla (RESTAR)
      if (planillaId) {
        console.log('[ELIMINAR REPASO] 📝 Actualizando cargue de planilla...')

        const planillaActual = await sql`
          SELECT total_cargue FROM planillas WHERE id = ${planillaId}
        `

        if (planillaActual.length > 0) {
          const cargueActual = Number(planillaActual[0].total_cargue) || 0
          const nuevoCargue = cargueActual - totalPedido

          console.log('[ELIMINAR REPASO]   Cargue actual:', cargueActual)
          console.log('[ELIMINAR REPASO]   - Repaso:', totalPedido)
          console.log('[ELIMINAR REPASO]   = Nuevo cargue:', nuevoCargue)

          await sql`
            UPDATE planillas
            SET
              total_cargue = ${nuevoCargue},
              updated_at = NOW()
            WHERE id = ${planillaId}
          `

          console.log('[ELIMINAR REPASO] ✅ Cargue actualizado correctamente')
        }
      }

      await sql`COMMIT`
    } catch (txError) {
      await sql`ROLLBACK`
      throw txError
    }

    const resultado = {
      success: true,
      mensaje: '✅ Repaso eliminado correctamente',
      detalles: {
        pedidoEliminado: {
          id: pedidoId,
          cliente: pedido[0].cliente,
          total: totalPedido,
        }
      }
    }

    console.log('[ELIMINAR REPASO] 🎉 ÉXITO:', resultado)
    console.log('[ELIMINAR REPASO] ===== FIN =====\n')

    return NextResponse.json(resultado)

  } catch (error) {
    console.error('[ELIMINAR REPASO] ❌ ERROR FATAL:', error)
    return NextResponse.json(
      { 
        error: 'Error al eliminar repaso',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
