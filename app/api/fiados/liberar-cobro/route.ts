import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { pedidoCobroId } = await request.json()

    if (!pedidoCobroId) {
      return NextResponse.json({ error: 'pedidoCobroId es requerido' }, { status: 400 })
    }

    const sql = getDB()

    // Buscar el fiado asociado a este pedido de cobro
    // Puede estar por pedido_id o por planilla_asignado_id
    const fiados = await sql`
      SELECT id, cliente, planilla_asignado_id, estado
      FROM fiados
      WHERE (pedido_id = ${pedidoCobroId} OR planilla_asignado_id::text = ${pedidoCobroId})
        AND (eliminado IS NULL OR eliminado = false)
      LIMIT 1
    `

    if (fiados.length === 0) {
      // Intentar buscar por nombre del cliente en el pedido de cobro
      const pedido = await sql`
        SELECT cliente FROM pedidos WHERE id = ${pedidoCobroId} LIMIT 1
      `
      if (pedido.length > 0) {
        const clienteSinCobro = pedido[0].cliente.replace(/\s*\(COBRO\)\s*/gi, '').trim()
        const fiadosPorNombre = await sql`
          SELECT id FROM fiados
          WHERE cliente ILIKE ${clienteSinCobro}
            AND estado IN ('pendiente', 'abono_parcial')
            AND (eliminado IS NULL OR eliminado = false)
          ORDER BY fecha_fiado DESC
          LIMIT 1
        `
        if (fiadosPorNombre.length > 0) {
          await sql`
            UPDATE fiados
            SET planilla_asignado_id = NULL,
                fecha_asignacion = NULL,
                entregador_asignado = NULL,
                updated_at = NOW()
            WHERE id = ${fiadosPorNombre[0].id}
          `
          console.log(`[LIBERAR COBRO] ✓ Fiado ${fiadosPorNombre[0].id} liberado por nombre`)
        }
      }
    } else {
      // Liberar el fiado → vuelve al admin
      await sql`
        UPDATE fiados
        SET planilla_asignado_id = NULL,
            fecha_asignacion = NULL,
            entregador_asignado = NULL,
            updated_at = NOW()
        WHERE id = ${fiados[0].id}
      `
      console.log(`[LIBERAR COBRO] ✓ Fiado ${fiados[0].id} liberado`)
    }

    return NextResponse.json({ 
      success: true, 
      mensaje: 'Fiado liberado. Vuelve al admin pendiente de cobro.' 
    })

  } catch (error) {
    console.error('[LIBERAR COBRO] ERROR:', error)
    return NextResponse.json(
      { error: 'Error al liberar cobro', details: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
