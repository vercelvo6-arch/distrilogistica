import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

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
