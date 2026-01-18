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
        id,
        planilla_id,
        cliente,
        direccion,
        telefono,
        barrio,
        secuencia,
        total,
        estado,
        observaciones,
        entregado_en,
        created_at,
        updated_at,
        monto_pagado,
        saldo_pendiente
      FROM pedidos
      WHERE estado = 'repaso'
      ORDER BY created_at DESC
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
          planilla_id: repaso.planilla_id,
          cliente: {
            nombre: repaso.cliente,
            direccion: repaso.direccion,
            telefono: repaso.telefono,
            barrio: repaso.barrio
          },
          numero_pedido: repaso.secuencia,
          total: Number(repaso.total),
          estado: repaso.estado,
          observaciones: repaso.observaciones,
          entregador: repaso.entregado_en,
          created_at: repaso.created_at,
          updated_at: repaso.updated_at,
          monto_pagado: Number(repaso.monto_pagado || 0),
          saldo_pendiente: Number(repaso.saldo_pendiente || 0),
          productos: productos.map((p) => ({
            id: p.id,
            codigo: p.codigo,
            descripcion: p.nombre,
            cantidad: Number(p.cantidad),
            precio_unitario: Number(p.precio_unitario),
            subtotal: Number(p.total)
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
