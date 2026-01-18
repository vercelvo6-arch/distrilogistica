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
        p.fecha,
        p.numero_pedido,
        p.estado,
        p.total,
        p.planilla_id,
        p.cliente_id,
        p.observaciones,
        p.created_at,
        p.updated_at,
        c.nombre as cliente_nombre,
        c.codigo as cliente_codigo,
        c.direccion as cliente_direccion,
        c.telefono as cliente_telefono
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE p.estado = 'repaso'
      ORDER BY p.created_at DESC
    `

    // Obtener los productos de cada repaso
    const repasosConProductos = await Promise.all(
      repasos.map(async (repaso) => {
        const productos = await sql`
          SELECT 
            pp.id,
            pp.producto_id,
            pp.cantidad,
            pp.precio_unitario,
            pp.subtotal,
            pr.codigo as producto_codigo,
            pr.descripcion as producto_descripcion
          FROM pedido_productos pp
          LEFT JOIN productos pr ON pp.producto_id = pr.id
          WHERE pp.pedido_id = ${repaso.id}
          ORDER BY pp.id
        `

        return {
          ...repaso,
          productos: productos.map((p) => ({
            id: p.id,
            producto_id: p.producto_id,
            codigo: p.producto_codigo,
            descripcion: p.producto_descripcion,
            cantidad: Number(p.cantidad),
            precio_unitario: Number(p.precio_unitario),
            subtotal: Number(p.subtotal)
          })),
          total: Number(repaso.total),
          cliente: {
            id: repaso.cliente_id,
            nombre: repaso.cliente_nombre,
            codigo: repaso.cliente_codigo,
            direccion: repaso.cliente_direccion,
            telefono: repaso.cliente_telefono
          }
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
