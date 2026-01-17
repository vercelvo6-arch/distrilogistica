import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['caja', 'administrador', 'coordinador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { pedidoId, montoAbono, metodoPago, observaciones, usuarioId } = body

    if (!pedidoId || !montoAbono || montoAbono <= 0) {
      return NextResponse.json(
        { error: 'Datos incompletos o inválidos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Verificar que el pedido existe y es fiado
    const pedido = await sql`
      SELECT id, total, monto_pagado, saldo_pendiente, estado
      FROM pedidos
      WHERE id = ${pedidoId}
    `

    if (pedido.length === 0) {
      return NextResponse.json(
        { error: 'Pedido no encontrado' },
        { status: 404 }
      )
    }

    const totalPedido = Number(pedido[0].total)
    const montoPagadoActual = Number(pedido[0].monto_pagado || 0)
    const saldoActual = Number(pedido[0].saldo_pendiente || totalPedido - montoPagadoActual)

    // Validar que el abono no exceda el saldo
    if (montoAbono > saldoActual) {
      return NextResponse.json(
        { error: `El abono (${montoAbono}) no puede ser mayor al saldo pendiente (${saldoActual})` },
        { status: 400 }
      )
    }

    // Calcular nuevos valores
    const nuevoMontoPagado = montoPagadoActual + montoAbono
    const nuevoSaldo = totalPedido - nuevoMontoPagado
    const nuevoEstado = nuevoSaldo === 0 ? 'pagado' : 'fiado'

    // Registrar el abono
    await sql`
      INSERT INTO abonos_fiados (
        pedido_id,
        monto_abono,
        metodo_pago,
        observaciones,
        registrado_por
      ) VALUES (
        ${pedidoId},
        ${montoAbono},
        ${metodoPago || 'efectivo'},
        ${observaciones || null},
        ${usuarioId || session.user.id}
      )
    `

    // Actualizar el pedido
    await sql`
      UPDATE pedidos
      SET 
        monto_pagado = ${nuevoMontoPagado},
        saldo_pendiente = ${nuevoSaldo},
        estado = ${nuevoEstado},
        updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log('[API registrar-abono] ✓ Abono registrado:', {
      pedidoId,
      montoAbono,
      nuevoMontoPagado,
      nuevoSaldo,
      nuevoEstado
    })

    return NextResponse.json({
      success: true,
      mensaje: nuevoSaldo === 0 
        ? 'Abono registrado - Cuenta saldada completamente' 
        : 'Abono registrado exitosamente',
      pedido: {
        id: pedidoId,
        total: totalPedido,
        monto_pagado: nuevoMontoPagado,
        saldo_pendiente: nuevoSaldo,
        estado: nuevoEstado
      },
      monto_pagado: nuevoMontoPagado,
      saldo_pendiente: nuevoSaldo
    })

  } catch (error) {
    console.error('[API registrar-abono] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al registrar abono',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
