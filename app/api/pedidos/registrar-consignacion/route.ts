import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'
import { buscarReferenciasUsadas } from '@/lib/validar-referencia'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pedidos/registrar-consignacion
// Dos usos:
// 1. El entregador registra, al momento de la entrega, que el cliente pagó por
//    transferencia/consignación (banco + número + monto) — requiere pedidoId.
// 2. Consignación ANTICIPADA sin pedido asociado: el entregador (o caja, en su
//    nombre) registra que consignó parte de su recaudo de ruta a la cuenta de
//    la empresa, antes de llegar a cuadrar caja — común en rutas viajeras donde
//    el cupo de consignación obliga a partir un monto grande en varias
//    transacciones. Requiere entregador explícito en vez de pedidoId.
// Ninguno toca pedidos.estado — ambos solo quedan disponibles para que caja
// los precargue en el modal de cuadre agrupado, igual que ya pasa hoy con los
// cobros CxC registrados en ruta.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { pedidoId, planillaId, entregador, cliente, banco, numero, monto, fecha } = body

    const bancoLimpio = String(banco || '').trim()
    const numeroLimpio = String(numero || '').trim()
    const montoNum = Number(monto)
    const entregadorLimpio = String(entregador || '').trim()

    if (!pedidoId && !entregadorLimpio) {
      return NextResponse.json({ error: 'pedidoId o entregador son requeridos' }, { status: 400 })
    }
    if (!bancoLimpio || !numeroLimpio) {
      return NextResponse.json({ error: 'Banco y número son requeridos' }, { status: 400 })
    }
    if (!montoNum || montoNum <= 0) {
      return NextResponse.json({ error: 'monto debe ser mayor a 0' }, { status: 400 })
    }

    // ✅ Antifraude: la misma referencia no puede reutilizarse para cobrar dos veces,
    // sin importar si la primera vez fue una consignación, un cobro CxC o un pago
    // anticipado.
    const yaUsada = await buscarReferenciasUsadas([numeroLimpio])
    if (yaUsada.length > 0) {
      return NextResponse.json(
        { error: `La referencia ${numeroLimpio} ya fue registrada antes. Verifique el comprobante.` },
        { status: 409 }
      )
    }

    const sql = getDB()

    const fechaLimpia = fecha ? String(fecha) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

    const [registro] = await sql`
      INSERT INTO consignaciones_pedido (
        pedido_id, planilla_id, entregador, cliente, banco, numero, monto, fecha,
        origen, registrado_por
      ) VALUES (
        ${pedidoId ? String(pedidoId) : null}, ${planillaId ? String(planillaId) : null},
        ${String(entregadorLimpio || session.user.nombre)},
        ${cliente || null}, ${bancoLimpio}, ${numeroLimpio}, ${montoNum},
        ${fechaLimpia}::date,
        ${pedidoId ? 'ruta' : 'anticipada'}, ${session.user.nombre}
      )
      RETURNING *
    `

    return NextResponse.json({ success: true, consignacion: registro })
  } catch (error) {
    return handleDBError(error, 'PEDIDOS_REGISTRAR_CONSIGNACION')
  }
}
