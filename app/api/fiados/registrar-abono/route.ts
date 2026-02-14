import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

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

    console.log('[REGISTRAR ABONO] Request recibido:', { pedidoId, montoAbono, metodoPago })

    if (!pedidoId) {
      return NextResponse.json(
        { error: 'pedidoId es requerido' },
        { status: 400 }
      )
    }

    if (!montoAbono || montoAbono <= 0) {
      return NextResponse.json(
        { error: 'Monto de abono invalido' },
        { status: 400 }
      )
    }

    const sql = getDB()

    console.log('[REGISTRAR ABONO] Buscando fiado:', pedidoId)

    let pedidoEncontrado: any = null
    let origenTabla: 'pedidos' | 'fiados' = 'pedidos'

    // 1. Buscar en tabla pedidos
    const pedidosResult = await sql`
      SELECT 
        id::text as id,
        total,
        COALESCE(monto_pagado, 0) as monto_pagado,
        (total - COALESCE(monto_pagado, 0)) as saldo_pendiente,
        estado
      FROM pedidos
      WHERE id::text = ${pedidoId}
        AND estado IN ('fiado', 'pagado', 'parcial')
    `

    console.log('[REGISTRAR ABONO] Resultado busqueda en pedidos:', pedidosResult)

    if (pedidosResult.length > 0) {
      pedidoEncontrado = pedidosResult[0]
      origenTabla = 'pedidos'
      console.log('[REGISTRAR ABONO] Encontrado en tabla pedidos:', pedidoEncontrado)
    } else {
      console.log('[REGISTRAR ABONO] No encontrado en pedidos, buscando en tabla fiados...')
      
      const fiadosResult = await sql`
        SELECT 
          COALESCE(pedido_id, id::text) as id,
          monto_total as total,
          COALESCE(monto_pagado, 0) as monto_pagado,
          (monto_total - COALESCE(monto_pagado, 0)) as saldo_pendiente,
          estado
        FROM fiados
        WHERE COALESCE(pedido_id, id::text) = ${pedidoId}
      `

      console.log('[REGISTRAR ABONO] Resultado busqueda en fiados:', fiadosResult)

      if (fiadosResult.length > 0) {
        pedidoEncontrado = fiadosResult[0]
        origenTabla = 'fiados'
        console.log('[REGISTRAR ABONO] Encontrado en tabla fiados:', pedidoEncontrado)
      }
    }

    if (!pedidoEncontrado) {
      console.log('[REGISTRAR ABONO] Fiado no encontrado en ninguna tabla:', pedidoId)
      return NextResponse.json(
        { error: 'Fiado no encontrado' },
        { status: 404 }
      )
    }

    const totalPedido = Number(pedidoEncontrado.total)
    const montoPagadoActual = Number(pedidoEncontrado.monto_pagado || 0)
    const saldoActual = Number(pedidoEncontrado.saldo_pendiente)

    console.log('[REGISTRAR ABONO] Estado actual:', {
      origen: origenTabla,
      total: totalPedido,
      pagado: montoPagadoActual,
      saldo: saldoActual,
      abonoNuevo: montoAbono
    })

    if (montoAbono > saldoActual) {
      console.log('[REGISTRAR ABONO] Abono mayor al saldo')
      return NextResponse.json(
        { 
          error: `El abono no puede ser mayor al saldo pendiente`,
          detalles: {
            total: totalPedido,
            pagado: montoPagadoActual,
            saldo: saldoActual,
            abono: montoAbono
          }
        },
        { status: 400 }
      )
    }

    const nuevoMontoPagado = montoPagadoActual + montoAbono
    const nuevoSaldo = totalPedido - nuevoMontoPagado
    const nuevoEstado = nuevoSaldo === 0 ? 'pagado' : (nuevoSaldo < totalPedido ? 'parcial' : 'fiado')

    console.log('[REGISTRAR ABONO] Valores calculados:', {
      nuevoMontoPagado,
      nuevoSaldo,
      nuevoEstado
    })

    console.log('[REGISTRAR ABONO] Insertando abono en abonos_fiados...')
    await sql`
      INSERT INTO abonos_fiados (
        pedido_id,
        monto_abono,
        metodo_pago,
        observaciones,
        registrado_por,
        origen_tabla
      ) VALUES (
        ${pedidoId},
        ${montoAbono},
        ${metodoPago || 'efectivo'},
        ${observaciones || null},
        ${usuarioId || session.user.id},
        ${origenTabla}
      )
    `
    console.log('[REGISTRAR ABONO] Abono insertado en abonos_fiados')

    if (origenTabla === 'pedidos') {
      console.log('[REGISTRAR ABONO] Actualizando tabla pedidos...')
      const updatePedidos = await sql`
        UPDATE pedidos
        SET 
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = ${nuevoSaldo},
          estado = ${nuevoEstado},
          updated_at = NOW()
        WHERE id::text = ${pedidoId}
        RETURNING id
      `
      console.log('[REGISTRAR ABONO] Tabla pedidos actualizada:', updatePedidos)
    } else {
      console.log('[REGISTRAR ABONO] Actualizando tabla fiados...')
      const updateFiados = await sql`
        UPDATE fiados
        SET 
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = ${nuevoSaldo},
          estado = ${nuevoEstado === 'pagado' ? 'pagado' : 'pendiente'},
          updated_at = NOW()
        WHERE COALESCE(pedido_id, id::text) = ${pedidoId}
        RETURNING id
      `
      console.log('[REGISTRAR ABONO] Tabla fiados actualizada:', updateFiados)
    }

    console.log('[REGISTRAR ABONO] Abono registrado exitosamente')

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
        estado: nuevoEstado,
        origen: origenTabla
      },
      monto_pagado: nuevoMontoPagado,
      saldo_pendiente: nuevoSaldo
    })

  } catch (error) {
    console.error('[REGISTRAR ABONO] ERROR:', error)
    return handleDBError(error, 'REGISTRAR ABONO')
  }
}
