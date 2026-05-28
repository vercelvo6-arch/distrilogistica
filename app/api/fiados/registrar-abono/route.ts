import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export async function POST(request: NextRequest) {
  try {
    console.log('[REGISTRAR ABONO] ===== INICIO =====');
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { pedidoId, montoAbono, metodoPago, observaciones } = await request.json();
    
    console.log('[REGISTRAR ABONO] Datos recibidos:', { pedidoId, montoAbono, metodoPago });

    if (!pedidoId || !montoAbono || montoAbono <= 0) {
      return NextResponse.json({ 
        error: "Datos inválidos. Se requiere pedidoId y montoAbono mayor a 0" 
      }, { status: 400 });
    }

    const sql = getDB();
    const pedidoIdStr = String(pedidoId);

    // =============================================
    // DETECTAR TIPO DE ID
    //
    // Hay 3 casos posibles:
    // 1. fiado_tabla_id (numérico): viene de tabla fiados directamente → flujo directo
    // 2. UUID (con guiones, NO empieza con PED): pedido_id de tabla fiados → flujo directo  
    // 3. PED... (empieza con PED): id de tabla pedidos → buscar fiado asociado por pedido_id
    // =============================================

    const esIdNumerico = !isNaN(Number(pedidoIdStr)) && Number(pedidoIdStr) > 0;
    const esUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pedidoIdStr);
    const esPedidoPED = pedidoIdStr.startsWith('PED');

    console.log('[REGISTRAR ABONO] Tipo de ID:', { esIdNumerico, esUUID, esPedidoPED, pedidoIdStr });

    // =============================================
    // CASO A: ID numérico o UUID → buscar en tabla fiados directamente
    // =============================================
    if (esIdNumerico || esUUID) {
      console.log('[REGISTRAR ABONO] Flujo A: tabla fiados directo, id:', pedidoIdStr);

      let fiado: any = null;

      if (esIdNumerico) {
        const result = await sql`
          SELECT * FROM fiados 
          WHERE id = ${Number(pedidoIdStr)}
            AND (eliminado IS NULL OR eliminado = false)
          LIMIT 1
        `;
        fiado = result[0] || null;
      }

      if (!fiado) {
        // Buscar por pedido_id (UUID como string)
        const result = await sql`
          SELECT * FROM fiados 
          WHERE pedido_id = ${pedidoIdStr}
            AND (eliminado IS NULL OR eliminado = false)
          LIMIT 1
        `;
        fiado = result[0] || null;
      }

      if (!fiado && esUUID) {
        // Buscar por id como UUID
        const result = await sql`
          SELECT * FROM fiados 
          WHERE id::text = ${pedidoIdStr}
            AND (eliminado IS NULL OR eliminado = false)
          LIMIT 1
        `;
        fiado = result[0] || null;
      }

      if (!fiado) {
        console.log('[REGISTRAR ABONO] ❌ Fiado no encontrado:', pedidoIdStr);
        return NextResponse.json({ error: "Fiado no encontrado" }, { status: 404 });
      }

      return await registrarAbonoDirecto({ sql, fiado, montoAbono, metodoPago, observaciones, session });
    }

    // =============================================
    // CASO B: ID tipo PED... → puede ser pedido normal con fiado o pedido de cobro
    // =============================================
    if (esPedidoPED) {
      console.log('[REGISTRAR ABONO] Flujo B: id tipo PED, buscando pedido:', pedidoIdStr);

      const [pedido] = await sql`
        SELECT p.id, p.cliente, p.total, p.es_cobro, p.planilla_id, p.monto_pagado, p.saldo_pendiente
        FROM pedidos p
        WHERE p.id = ${pedidoIdStr}
        LIMIT 1
      `;

      if (!pedido) {
        return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
      }

      // Sub-caso B1: es un pedido de cobro asignado desde fiados
      if (pedido.es_cobro) {
        console.log('[REGISTRAR ABONO] Sub-caso B1: pedido de cobro, buscando fiado original');
        return await registrarAbonoPedidoCobro({ sql, pedido, pedidoId: pedidoIdStr, montoAbono, metodoPago, observaciones, session });
      }

      // Sub-caso B2: es un pedido normal con estado='fiado' — buscar en tabla fiados por pedido_id
      console.log('[REGISTRAR ABONO] Sub-caso B2: pedido normal con fiado, buscando en tabla fiados');

      let fiado: any = null;

      // Primero buscar en tabla fiados por pedido_id
      const resultFiado = await sql`
        SELECT * FROM fiados 
        WHERE pedido_id = ${pedidoIdStr}
          AND (eliminado IS NULL OR eliminado = false)
        LIMIT 1
      `;
      fiado = resultFiado[0] || null;

      if (fiado) {
        console.log('[REGISTRAR ABONO] ✅ Fiado encontrado en tabla fiados por pedido_id');
        return await registrarAbonoDirecto({ sql, fiado, montoAbono, metodoPago, observaciones, session });
      }

      // Si no está en tabla fiados, registrar abono directamente sobre el pedido
      console.log('[REGISTRAR ABONO] Registrando abono directamente sobre pedido (sin tabla fiados)');
      return await registrarAbonoSobrePedido({ sql, pedido, pedidoIdStr, montoAbono, metodoPago, observaciones, session });
    }

    return NextResponse.json({ error: "Formato de ID no reconocido" }, { status: 400 });

  } catch (error: any) {
    console.error('[REGISTRAR ABONO] ❌ ERROR FATAL:', error);
    return handleDBError(error, 'REGISTRAR_ABONO');
  }
}

// ─────────────────────────────────────────────
// Helper A: abono directo sobre tabla fiados
// ─────────────────────────────────────────────
async function registrarAbonoDirecto({ sql, fiado, montoAbono, metodoPago, observaciones, session }: any) {
  const montoAbonoNum = Number(montoAbono);
  const saldoPendienteNum = Number(fiado.saldo_pendiente);
  const montoPagadoActual = Number(fiado.monto_pagado || 0);

  if (montoAbonoNum > saldoPendienteNum) {
    return NextResponse.json({ 
      error: `El abono ($${montoAbonoNum.toLocaleString()}) no puede ser mayor al saldo pendiente ($${saldoPendienteNum.toLocaleString()})` 
    }, { status: 400 });
  }

  const nuevoMontoPagado = montoPagadoActual + montoAbonoNum;
  const nuevoSaldo = saldoPendienteNum - montoAbonoNum;
  const pagoCompleto = nuevoSaldo <= 0;

  if (pagoCompleto) {
    await sql`
      UPDATE fiados SET
        monto_pagado = ${nuevoMontoPagado},
        saldo_pendiente = 0,
        estado = 'pagado_completo',
        cobrado_por = ${session.user?.id || null},
        fecha_pago_completo = NOW(),
        updated_at = NOW()
      WHERE id = ${fiado.id}
    `;
  } else {
    await sql`
      UPDATE fiados SET
        monto_pagado = ${nuevoMontoPagado},
        saldo_pendiente = ${nuevoSaldo},
        estado = 'abono_parcial',
        updated_at = NOW()
      WHERE id = ${fiado.id}
    `;
  }

  await sql`
    INSERT INTO abonos_fiados (
      pedido_id, monto_abono, fecha_abono, metodo_pago, observaciones, registrado_por, created_at
    ) VALUES (
      ${fiado.id},
      ${montoAbonoNum},
      NOW(),
      ${metodoPago || 'efectivo'},
      ${observaciones || 'Abono registrado desde admin'},
      ${session.user?.id},
      NOW()
    )
  `;

  console.log('[REGISTRAR ABONO] ✅ Abono directo registrado sobre fiado:', fiado.id);

  return NextResponse.json({
    success: true,
    mensaje: pagoCompleto ? "¡Fiado pagado completamente! 🎉" : `Abono registrado. Saldo pendiente: $${nuevoSaldo.toLocaleString()}`,
    fiado_id: fiado.id,
    monto_abonado: montoAbonoNum,
    monto_pagado: nuevoMontoPagado,
    saldo_pendiente: nuevoSaldo,
    estado: pagoCompleto ? 'pagado_completo' : 'abono_parcial',
    pago_completo: pagoCompleto
  });
}

// ─────────────────────────────────────────────
// Helper B1: abono sobre pedido de cobro asignado
// ─────────────────────────────────────────────
async function registrarAbonoPedidoCobro({ sql, pedido, pedidoId, montoAbono, metodoPago, observaciones, session }: any) {
  const clienteSinCobro = pedido.cliente.replace(/\s*\(COBRO\)\s*/gi, '').trim();

  const [fiadoOriginal] = await sql`
    SELECT f.id, f.pedido_id, f.saldo_pendiente, f.monto_pagado, f.monto_total, f.planilla_asignado_id
    FROM fiados f
    WHERE f.cliente ILIKE ${clienteSinCobro}
      AND f.estado IN ('pendiente', 'abono_parcial')
    ORDER BY f.created_at DESC
    LIMIT 1
  `;

  if (!fiadoOriginal) {
    return NextResponse.json({ error: "No se encontró el fiado original asociado" }, { status: 404 });
  }

  const montoAbonoNum = Number(montoAbono);
  const saldoPendienteNum = Number(fiadoOriginal.saldo_pendiente);

  if (montoAbonoNum > saldoPendienteNum) {
    return NextResponse.json({ 
      error: `El abono ($${montoAbonoNum.toLocaleString()}) no puede ser mayor al saldo pendiente ($${saldoPendienteNum.toLocaleString()})` 
    }, { status: 400 });
  }

  const nuevoMontoPagado = Number(fiadoOriginal.monto_pagado) + montoAbonoNum;
  const nuevoSaldo = saldoPendienteNum - montoAbonoNum;
  const pagoCompleto = nuevoSaldo === 0;

  if (pagoCompleto) {
    await sql`
      UPDATE fiados SET
        monto_pagado = ${nuevoMontoPagado},
        saldo_pendiente = 0,
        estado = 'pagado_completo',
        cobrado_por = ${session.user?.id || null},
        planilla_asignado_id = NULL,
        fecha_asignacion = NULL,
        entregador_asignado = NULL,
        fecha_pago_completo = NOW(),
        updated_at = NOW()
      WHERE id = ${fiadoOriginal.id}
    `;
    await sql`DELETE FROM pedido_productos WHERE pedido_id = ${pedidoId}`;
    await sql`DELETE FROM pedidos WHERE id = ${pedidoId}`;
  } else {
    await sql`
      UPDATE fiados SET
        monto_pagado = ${nuevoMontoPagado},
        saldo_pendiente = ${nuevoSaldo},
        estado = 'abono_parcial',
        planilla_asignado_id = NULL,
        fecha_asignacion = NULL,
        entregador_asignado = NULL,
        updated_at = NOW()
      WHERE id = ${fiadoOriginal.id}
    `;

    if (fiadoOriginal.planilla_asignado_id) {
      await sql`
        UPDATE planillas SET 
          total_cargue = total_cargue - ${nuevoSaldo},
          updated_at = NOW()
        WHERE id = ${fiadoOriginal.planilla_asignado_id}
      `;
    }

    await sql`DELETE FROM pedido_productos WHERE pedido_id = ${pedidoId}`;
    await sql`DELETE FROM pedidos WHERE id = ${pedidoId}`;
  }

  await sql`
    INSERT INTO abonos_fiados (
      pedido_id, monto_abono, fecha_abono, metodo_pago, observaciones, registrado_por, created_at
    ) VALUES (
      ${fiadoOriginal.id},
      ${montoAbonoNum},
      NOW(),
      ${metodoPago || 'efectivo'},
      ${observaciones || 'Abono registrado desde cobro en planilla'},
      ${session.user?.id},
      NOW()
    )
  `;

  return NextResponse.json({
    success: true,
    mensaje: pagoCompleto 
      ? "¡Fiado pagado completamente! 🎉" 
      : `Abono registrado. Saldo pendiente: $${nuevoSaldo.toLocaleString()} - Fiado devuelto a Admin`,
    fiado_id: fiadoOriginal.id,
    monto_abonado: montoAbonoNum,
    monto_pagado: nuevoMontoPagado,
    saldo_pendiente: nuevoSaldo,
    estado: pagoCompleto ? 'pagado_completo' : 'abono_parcial',
    pago_completo: pagoCompleto
  });
}

// ─────────────────────────────────────────────
// Helper B2: abono directo sobre pedido (sin tabla fiados)
// ─────────────────────────────────────────────
async function registrarAbonoSobrePedido({ sql, pedido, pedidoIdStr, montoAbono, metodoPago, observaciones, session }: any) {
  const montoAbonoNum = Number(montoAbono);
  const saldoPendienteNum = Number(pedido.saldo_pendiente || pedido.total);
  const montoPagadoActual = Number(pedido.monto_pagado || 0);

  if (montoAbonoNum > saldoPendienteNum) {
    return NextResponse.json({ 
      error: `El abono ($${montoAbonoNum.toLocaleString()}) no puede ser mayor al saldo pendiente ($${saldoPendienteNum.toLocaleString()})` 
    }, { status: 400 });
  }

  const nuevoMontoPagado = montoPagadoActual + montoAbonoNum;
  const nuevoSaldo = saldoPendienteNum - montoAbonoNum;
  const pagoCompleto = nuevoSaldo <= 0;

  await sql`
    UPDATE pedidos SET
      monto_pagado = ${nuevoMontoPagado},
      saldo_pendiente = ${nuevoSaldo},
      estado = ${pagoCompleto ? 'pagado' : 'fiado'},
      updated_at = NOW()
    WHERE id = ${pedidoIdStr}
  `;

  await sql`
    INSERT INTO abonos_fiados (
      pedido_id, monto_abono, fecha_abono, metodo_pago, observaciones, registrado_por, created_at
    ) VALUES (
      ${pedidoIdStr},
      ${montoAbonoNum},
      NOW(),
      ${metodoPago || 'efectivo'},
      ${observaciones || 'Abono registrado desde admin'},
      ${session.user?.id},
      NOW()
    )
  `;

  console.log('[REGISTRAR ABONO] ✅ Abono registrado sobre pedido:', pedidoIdStr);

  return NextResponse.json({
    success: true,
    mensaje: pagoCompleto ? "¡Fiado pagado completamente! 🎉" : `Abono registrado. Saldo pendiente: $${nuevoSaldo.toLocaleString()}`,
    fiado_id: pedidoIdStr,
    monto_abonado: montoAbonoNum,
    monto_pagado: nuevoMontoPagado,
    saldo_pendiente: nuevoSaldo,
    estado: pagoCompleto ? 'pagado_completo' : 'abono_parcial',
    pago_completo: pagoCompleto
  });
}
