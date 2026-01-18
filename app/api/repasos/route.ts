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

    // Obtener todos los pedidos con estado 'repaso'
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
        p.saldo,
        p.observaciones,
        p.entregador_en,
        p.created_at,
        p.updated_at,
        p.monto_pagado,
        p.valor_pendiente
      FROM pedidos p
      WHERE p.saldo = 'repaso'
      ORDER BY p.created_at DESC
    `

    // Obtener los productos de cada repaso
    const repasosConProductos = await Promise.all(
      repasos.map(async (repaso) => {
        const productos = await sql`
          SELECT 
            pc.id,
            pc.pedido_id,
            pc.codigo,
            pc.descripcion,
            pc.cantidad,
            pc.precio,
            pc.subtotal
          FROM productos_catalogo pc
          WHERE pc.pedido_id = ${repaso.id}
          ORDER BY pc.id
        `

        return {
          id: repaso.id,
          planilla_id: repaso.planilla_id,
          cliente: {
            nombre: repaso.cliente,
            direccion: repaso.direccion,
            telefono: repaso.telefono,
            barrio: repaso.barrio
          },
          numero_pedido: repaso.secuencia,
          total: Number(repaso.total),
          saldo: repaso.saldo,
          observaciones: repaso.observaciones,
          entregador: repaso.entregador_en,
          created_at: repaso.created_at,
          updated_at: repaso.updated_at,
          monto_pagado: Number(repaso.monto_pagado || 0),
          valor_pendiente: Number(repaso.valor_pendiente || 0),
          productos: productos.map((p) => ({
            id: p.id,
            codigo: p.codigo,
            descripcion: p.descripcion,
            cantidad: Number(p.cantidad),
            precio_unitario: Number(p.precio),
            subtotal: Number(p.subtotal)
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
