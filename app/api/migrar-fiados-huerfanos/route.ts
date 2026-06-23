import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { handleDBError } from '@/lib/db-helpers'

// Endpoint de uso único: migra a la tabla `fiados` todas las novedades de tipo
// fiado_parcial que quedaron huérfanas porque su planilla ya fue cuadrada
// ANTES de que existiera la lógica de migración automática en cuadres-caja.
export async function POST(request: Request) {
  const sql = getDB()
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const pendientes = await sql`
      SELECT
        n.id AS novedad_id,
        p.id AS pedido_id, p.cliente, p.direccion, p.telefono, p.observaciones,
        n.monto_novedad AS saldo_pendiente,
        COALESCE(n.monto_pagado, 0) AS monto_pagado,
        (n.monto_novedad + COALESCE(n.monto_pagado,0)) AS total,
        pl.fecha, pl.entregador, pl.tipo_ruta
      FROM novedades_pedido n
      JOIN pedidos p ON n.pedido_id = p.id
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE n.tipo_novedad = 'fiado_parcial'
        AND NOT EXISTS (SELECT 1 FROM fiados f WHERE f.pedido_id = p.id)
    `

    let migrados = 0
    const detalle: any[] = []

    for (const pedido of pendientes) {
      const saldo = Math.max(0, Number(pedido.saldo_pendiente))
      const [inserted] = await sql`
        INSERT INTO fiados (
          pedido_id, cliente, direccion, telefono,
          monto_total, monto_pagado, saldo_pendiente,
          fecha_fiado, entregador, ruta, estado, observaciones
        ) VALUES (
          ${pedido.pedido_id}, ${pedido.cliente}, ${pedido.direccion || null},
          ${pedido.telefono || null}, ${Number(pedido.total)},
          ${Number(pedido.monto_pagado)}, ${saldo},
          ${pedido.fecha}, ${pedido.entregador}, ${pedido.tipo_ruta},
          ${saldo > 0 ? 'pendiente' : 'pagado_completo'},
          ${pedido.observaciones || null}
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `
      if (inserted) {
        migrados++
        detalle.push({ cliente: pedido.cliente, monto: saldo, fiado_id: inserted.id })
        await sql`UPDATE novedades_pedido SET validado = true WHERE id = ${pedido.novedad_id}`
      }
    }

    return NextResponse.json({
      success: true,
      mensaje: `${migrados} fiados huérfanos migrados a la tabla fiados`,
      totalRevisados: pendientes.length,
      migrados,
      detalle,
    })

  } catch (error) {
    return handleDBError(error, 'MIGRAR_FIADOS_HUERFANOS')
  }
}
