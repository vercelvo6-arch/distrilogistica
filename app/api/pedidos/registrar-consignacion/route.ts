import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pedidos/registrar-consignacion
// El entregador registra, al momento de la entrega, que el cliente pagó por
// transferencia/consignación (banco + número + monto). No toca pedidos.estado
// (igual que Fiado/Devolución/Agotado/Descuento) — solo queda disponible para
// que caja la precargue en el modal de cuadre agrupado, igual que ya pasa hoy
// con los cobros CxC registrados en ruta.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { pedidoId, planillaId, entregador, cliente, banco, numero, monto } = body

    const bancoLimpio = String(banco || '').trim()
    const numeroLimpio = String(numero || '').trim()
    const montoNum = Number(monto)

    if (!pedidoId) {
      return NextResponse.json({ error: 'pedidoId es requerido' }, { status: 400 })
    }
    if (!bancoLimpio || !numeroLimpio) {
      return NextResponse.json({ error: 'Banco y número son requeridos' }, { status: 400 })
    }
    if (!montoNum || montoNum <= 0) {
      return NextResponse.json({ error: 'monto debe ser mayor a 0' }, { status: 400 })
    }

    const sql = getDB()

    const [registro] = await sql`
      INSERT INTO consignaciones_pedido (
        pedido_id, planilla_id, entregador, cliente, banco, numero, monto, fecha
      ) VALUES (
        ${String(pedidoId)}, ${planillaId ? String(planillaId) : null}, ${String(entregador || session.user.nombre)},
        ${cliente || null}, ${bancoLimpio}, ${numeroLimpio}, ${montoNum}, (NOW() AT TIME ZONE 'America/Bogota')::date
      )
      RETURNING *
    `

    return NextResponse.json({ success: true, consignacion: registro })
  } catch (error) {
    return handleDBError(error, 'PEDIDOS_REGISTRAR_CONSIGNACION')
  }
}
