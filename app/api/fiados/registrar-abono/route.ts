import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  console.log('\n💵 [REGISTRAR ABONO] ===== INICIO =====')
  
  try {
    const session = await getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[REGISTRAR ABONO] 📥 Body completo:', JSON.stringify(body, null, 2))
    
    const { 
      pedidoId, 
      montoAbono, 
      metodoPago, 
      observaciones,
      entregadorCobro,  // 🔥 NUEVO - quién cobró
      planillaCobro     // 🔥 NUEVO - en qué planilla se cobró
    } = body

    // ===================================================
    // VALIDACIONES BÁSICAS
    // ===================================================
    if (!pedidoId) {
      console.error('[REGISTRAR ABONO] ❌ pedidoId faltante')
      return NextResponse.json(
        { error: 'pedidoId es requerido' },
        { status: 400 }
      )
    }

    if (!montoAbono || Number(montoAbono) <= 0) {
      console.error('[REGISTRAR ABONO] ❌ montoAbono inválido:', montoAbono)
      return NextResponse.json(
        { error: 'montoAbono debe ser mayor a 0' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // ===================================================
    // BUSCAR EL FIADO
    // ===================================================
    console.log('[REGISTRAR ABONO] 🔍 Buscando fiado:', pedidoId)
    
    const fiado = await sql`
      SELECT 
        id,
        cliente,
        monto_total,
        monto_pagado,
        saldo_pendiente,
        estado,
        direccion,
        telefono,
        entregador,
        ruta
      FROM fiados
      WHERE id = ${pedidoId}
    `

    if (fiado.length === 0) {
      console.error('[REGISTRAR ABONO] ❌ Fiado no encontrado:', pedidoId)
      return NextResponse.json(
        { error: 'Fiado no encontrado' },
        { status: 404 }
      )
    }

    const fiadoData = fiado[0]
    console.log('[REGISTRAR ABONO] ✅ Fiado encontrado:', {
      cliente: fiadoData.cliente,
      saldo_pendiente: fiadoData.saldo_pendiente,
      estado: fiadoData.estado
    })

    // ===================================================
    // VALIDAR QUE NO ESTÉ YA PAGADO
    // ===================================================
    if (fiadoData.estado === 'pagado_completo') {
      console.error('[REGISTRAR ABONO] ❌ Fiado ya está pagado completamente')
      return NextResponse.json(
        { error: 'Este fiado ya fue pagado completamente' },
        { status: 400 }
      )
    }

    const saldoActual = Number(fiadoData.saldo_pendiente) || 0
    const monto = Number(montoAbono)

    // ===================================================
    // VALIDAR QUE EL ABONO NO EXCEDA EL SALDO
    // ===================================================
    if (monto > saldoActual) {
      console.error('[REGISTRAR ABONO] ❌ El abono excede el saldo pendiente:', {
        abono: monto,
        saldo: saldoActual
      })
      return NextResponse.json(
        { 
          error: `El abono (${monto}) no puede ser mayor al saldo pendiente (${saldoActual})`,
          saldo_pendiente: saldoActual,
          abono_intentado: monto
        },
        { status: 400 }
      )
    }

    // ===================================================
    // CALCULAR NUEVOS VALORES
    // ===================================================
    const montoPagadoActual = Number(fiadoData.monto_pagado) || 0
    const nuevoMontoPagado = montoPagadoActual + monto
    const nuevoSaldo = saldoActual - monto
    const nuevoEstado = nuevoSaldo === 0 ? 'pagado_completo' : 'pagado_parcial'

    console.log('[REGISTRAR ABONO] 📊 Cálculos:', {
      saldo_actual: saldoActual,
      abono: monto,
      monto_pagado_actual: montoPagadoActual,
      nuevo_monto_pagado: nuevoMontoPagado,
      nuevo_saldo: nuevoSaldo,
      nuevo_estado: nuevoEstado
    })

    // ===================================================
    // REGISTRAR ABONO EN TABLA abonos_fiados
    // 🔥 CON TRACKING DE QUIÉN COBRÓ Y EN QUÉ PLANILLA
    // ===================================================
    console.log('[REGISTRAR ABONO] 💾 Registrando abono con tracking...')
    
    const abonoRegistrado = await sql`
      INSERT INTO abonos_fiados (
        fiado_id,
        monto,
        metodo_pago,
        fecha_abono,
        entregador_cobro,
        planilla_cobro_id,
        observaciones,
        created_at
      ) VALUES (
        ${pedidoId},
        ${monto},
        ${metodoPago || 'efectivo'},
        NOW(),
        ${entregadorCobro || null},
        ${planillaCobro || null},
        ${observaciones || null},
        NOW()
      )
      RETURNING id, fecha_abono
    `

    console.log('[REGISTRAR ABONO] ✅ Abono registrado con ID:', abonoRegistrado[0].id)
    console.log('[REGISTRAR ABONO]   Entregador que cobró:', entregadorCobro || 'No especificado')
    console.log('[REGISTRAR ABONO]   Planilla donde se cobró:', planillaCobro || 'No especificada')

    // ===================================================
    // ACTUALIZAR TABLA FIADOS
    // ===================================================
    console.log('[REGISTRAR ABONO] 📝 Actualizando fiado...')
    
    await sql`
      UPDATE fiados
      SET 
        monto_pagado = ${nuevoMontoPagado},
        saldo_pendiente = ${nuevoSaldo},
        estado = ${nuevoEstado},
        ultima_actualizacion = NOW(),
        updated_at = NOW()
      WHERE id = ${pedidoId}
    `

    console.log('[REGISTRAR ABONO] ✅ Fiado actualizado:', {
      nuevo_monto_pagado: nuevoMontoPagado,
      nuevo_saldo: nuevoSaldo,
      nuevo_estado: nuevoEstado
    })

    // ===================================================
    // SI ESTÁ PAGADO COMPLETAMENTE, VERIFICAR SI HAY 
    // PEDIDO DE COBRO ASOCIADO Y MARCARLO COMO ENTREGADO
    // ===================================================
    if (nuevoEstado === 'pagado_completo') {
      console.log('[REGISTRAR ABONO] 🔍 Fiado pagado completamente, buscando pedidos de cobro asociados...')
      
      const pedidosCobro = await sql`
        SELECT id, planilla_id, estado
        FROM pedidos
        WHERE es_cobro = true
          AND (
            pedido_fiado_id = ${pedidoId}
            OR observaciones LIKE '%' || ${pedidoId} || '%'
          )
          AND estado != 'entregado'
      `

      if (pedidosCobro.length > 0) {
        console.log('[REGISTRAR ABONO] 📝 Marcando pedidos de cobro como entregados:', pedidosCobro.length)
        
        for (const pedidoCobro of pedidosCobro) {
          await sql`
            UPDATE pedidos
            SET 
              estado = 'entregado',
              fecha_entrega = NOW(),
              updated_at = NOW()
            WHERE id = ${pedidoCobro.id}
          `
          
          console.log('[REGISTRAR ABONO] ✅ Pedido de cobro marcado como entregado:', pedidoCobro.id)
        }
      } else {
        console.log('[REGISTRAR ABONO] ℹ️ No hay pedidos de cobro pendientes asociados')
      }
    }

    // ===================================================
    // RESPUESTA EXITOSA
    // ===================================================
    const mensaje = nuevoSaldo === 0 
      ? '✅ ¡Fiado pagado completamente!' 
      : `✅ Abono registrado. Saldo pendiente: $${nuevoSaldo.toLocaleString()}`

    console.log('[REGISTRAR ABONO] 🎉 ÉXITO:', mensaje)
    console.log('[REGISTRAR ABONO] ===== FIN =====\n')

    return NextResponse.json({
      success: true,
      mensaje: mensaje,
      fiado: {
        id: pedidoId,
        cliente: fiadoData.cliente,
        monto_total: Number(fiadoData.monto_total),
        monto_pagado: nuevoMontoPagado,
        saldo_pendiente: nuevoSaldo,
        estado: nuevoEstado
      },
      abono: {
        id: abonoRegistrado[0].id,
        monto: monto,
        metodo_pago: metodoPago || 'efectivo',
        fecha: abonoRegistrado[0].fecha_abono,
        entregador_cobro: entregadorCobro || null,
        planilla_cobro: planillaCobro || null
      }
    })

  } catch (error) {
    console.error('[REGISTRAR ABONO] ❌ ERROR FATAL:', error)
    console.error('[REGISTRAR ABONO] Stack trace:', error instanceof Error ? error.stack : 'No stack')
    
    return NextResponse.json(
      { 
        error: 'Error al registrar abono',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// ===================================================
// ENDPOINT GET - OBTENER HISTORIAL DE ABONOS
// ===================================================
export async function GET(request: NextRequest) {
  console.log('\n📋 [HISTORIAL ABONOS] ===== INICIO =====')
  
  try {
    const session = await getSession()
    
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const fiadoId = searchParams.get('fiado_id')

    if (!fiadoId) {
      return NextResponse.json(
        { error: 'fiado_id es requerido' },
        { status: 400 }
      )
    }

    const sql = getDB()

    console.log('[HISTORIAL ABONOS] 🔍 Buscando abonos para fiado:', fiadoId)

    const abonos = await sql`
      SELECT 
        a.id,
        a.monto,
        a.metodo_pago,
        a.fecha_abono,
        a.entregador_cobro,
        a.planilla_cobro_id,
        a.observaciones,
        a.created_at
      FROM abonos_fiados a
      WHERE a.fiado_id = ${fiadoId}
      ORDER BY a.fecha_abono DESC
    `

    console.log('[HISTORIAL ABONOS] ✅ Abonos encontrados:', abonos.length)
    console.log('[HISTORIAL ABONOS] ===== FIN =====\n')

    return NextResponse.json({
      success: true,
      fiado_id: fiadoId,
      total_abonos: abonos.length,
      abonos: abonos
    })

  } catch (error) {
    console.error('[HISTORIAL ABONOS] ❌ ERROR:', error)
    return NextResponse.json(
      { 
        error: 'Error al obtener historial de abonos',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
