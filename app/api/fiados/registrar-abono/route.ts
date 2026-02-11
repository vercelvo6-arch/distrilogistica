import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['caja', 'administrador', 'coordinador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const resolvedParams = await params
    const pedidoId = resolvedParams.id

    const body = await request.json()
    const { montoAbono, metodoPago, observaciones, usuarioId } = body

    if (!montoAbono || montoAbono <= 0) {
      return NextResponse.json(
        { error: 'Monto de abono inválido' },
        { status: 400 }
      )
    }

    const sql = getDB()

    console.log('[REGISTRAR ABONO] Buscando fiado:', pedidoId)

    // ✅ BUSCAR EN AMBAS TABLAS
    let pedidoEncontrado: any = null
    let origenTabla: 'pedidos' | 'fiados' = 'pedidos'

    // 1. Buscar en tabla pedidos
    const pedidosResult = await sql`
      SELECT 
        id::text as id,
        total,
        COALESCE(monto_pagado, 0) as monto_pagado,
        COALESCE(saldo_pendiente, total - COALESCE(monto_pagado, 0)) as saldo_pendiente,
        estado
      FROM pedidos
      WHERE id::text = ${pedidoId}
        AND estado IN ('fiado', 'pagado')
    `

    if (pedidosResult.length > 0) {
      pedidoEncontrado = pedidosResult[0]
      origenTabla = 'pedidos'
      console.log('[REGISTRAR ABONO] ✓ Encontrado en tabla pedidos')
    } else {
      // 2. Buscar en tabla fiados
      const fiadosResult = await sql`
        SELECT 
          COALESCE(pedido_id, id::text) as id,
          monto_total as total,
          COALESCE(monto_pagado, 0) as monto_pagado,
          COALESCE(saldo_pendiente, monto_total - COALESCE(monto_pagado, 0)) as saldo_pendiente,
          estado
        FROM fiados
        WHERE COALESCE(pedido_id, id::text) = ${pedidoId}
      `

      if (fiadosResult.length > 0) {
        pedidoEncontrado = fiadosResult[0]
        origenTabla = 'fiados'
        console.log('[REGISTRAR ABONO] ✓ Encontrado en tabla fiados')
      }
    }

    if (!pedidoEncontrado) {
      console.log('[REGISTRAR ABONO] ✗ Fiado no encontrado:', pedidoId)
      return NextResponse.json(
        { error: 'Fiado no encontrado' },
        { status: 404 }
      )
    }

    const totalPedido = Number(pedidoEncontrado.total)
    const montoPagadoActual = Number(pedidoEncontrado.monto_pagado || 0)
    const saldoActual = Number(pedidoEncontrado.saldo_pendiente || totalPedido - montoPagadoActual)

    console.log('[REGISTRAR ABONO] Estado actual:', {
      origen: origenTabla,
      total: totalPedido,
      pagado: montoPagadoActual,
      saldo: saldoActual,
      abonoNuevo: montoAbono
    })

    // Validar que el abono no exceda el saldo
    if (montoAbono > saldoActual) {
      return NextResponse.json(
        { error: `El abono ($${montoAbono.toLocaleString()}) no puede ser mayor al saldo pendiente ($${saldoActual.toLocaleString()})` },
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

    // ✅ ACTUALIZAR EN LA TABLA CORRECTA
    if (origenTabla === 'pedidos') {
      await sql`
        UPDATE pedidos
        SET 
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = ${nuevoSaldo},
          estado = ${nuevoEstado},
          updated_at = NOW()
        WHERE id::text = ${pedidoId}
      `
    } else {
      await sql`
        UPDATE fiados
        SET 
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = ${nuevoSaldo},
          estado = ${nuevoEstado},
          updated_at = NOW()
        WHERE COALESCE(pedido_id, id::text) = ${pedidoId}
      `
    }

    console.log('[REGISTRAR ABONO] ✓ Abono registrado:', {
      pedidoId,
      montoAbono,
      nuevoMontoPagado,
      nuevoSaldo,
      nuevoEstado,
      tabla: origenTabla
    })

    return NextResponse.json({
      success: true,
      mensaje: nuevoSaldo === 0 
        ? '✅ Abono registrado - Cuenta saldada completamente' 
        : '✅ Abono registrado exitosamente',
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
    return handleDBError(error, 'REGISTRAR ABONO')
  }
}
