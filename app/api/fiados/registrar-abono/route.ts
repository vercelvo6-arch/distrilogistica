import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export async function POST(request: NextRequest) {
  try {
    console.log('[REGISTRAR ABONO] Iniciando...');
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { pedidoId, montoAbono, metodoPago, observaciones } = await request.json();
    
    if (!pedidoId || !montoAbono || montoAbono <= 0) {
      return NextResponse.json({ 
        error: "Datos inválidos. Se requiere pedidoId y montoAbono mayor a 0" 
      }, { status: 400 });
    }

    const sql = getDB();

    // 1️⃣ Obtener el pedido de cobro
    const [pedidoCobro] = await sql`
      SELECT 
        p.id,
        p.cliente,
        p.total,
        p.es_cobro
      FROM pedidos p
      WHERE p.id = ${pedidoId}
      LIMIT 1
    `;

    if (!pedidoCobro) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    if (!pedidoCobro.es_cobro) {
      return NextResponse.json({ error: "Este no es un pedido de cobro" }, { status: 400 });
    }

    console.log('[REGISTRAR ABONO] Pedido encontrado:', pedidoCobro.cliente);

    // 2️⃣ Buscar el fiado original
    const clienteSinCobro = pedidoCobro.cliente.replace(/\s*\(COBRO\)\s*/gi, '').trim();
    
    const [fiadoOriginal] = await sql`
      SELECT 
        f.id,
        f.saldo_pendiente,
        f.monto_pagado,
        f.monto_total,
        f.planilla_asignado_id
      FROM fiados f
      WHERE f.cliente ILIKE ${clienteSinCobro}
        AND f.estado IN ('pendiente', 'abono_parcial')
      ORDER BY f.created_at DESC
      LIMIT 1
    `;

    if (!fiadoOriginal) {
      return NextResponse.json({ 
        error: "No se encontró el fiado original asociado" 
      }, { status: 404 });
    }

    console.log('[REGISTRAR ABONO] Fiado encontrado:', fiadoOriginal.id);

    // 3️⃣ Validar que el abono no exceda el saldo pendiente
    console.log('[REGISTRAR ABONO] Validando monto:', {
      montoAbono,
      saldoPendiente: fiadoOriginal.saldo_pendiente,
      tipo_abono: typeof montoAbono,
      tipo_saldo: typeof fiadoOriginal.saldo_pendiente
    });

    if (Number(montoAbono) > Number(fiadoOriginal.saldo_pendiente)) {
      console.log('[REGISTRAR ABONO] ❌ Abono excede saldo');
      return NextResponse.json({ 
        error: `El abono ($${montoAbono}) no puede ser mayor al saldo pendiente ($${fiadoOriginal.saldo_pendiente})` 
      }, { status: 400 });
    }

    // 4️⃣ Calcular nuevos valores
    const nuevoMontoPagado = Number(fiadoOriginal.monto_pagado) + Number(montoAbono);
    const nuevoSaldo = Number(fiadoOriginal.saldo_pendiente) - Number(montoAbono);
    const nuevoEstado = nuevoSaldo === 0 ? 'pagado_completo' : 'abono_parcial';

    console.log('[REGISTRAR ABONO] Cálculos:', {
      abono: montoAbono,
      nuevo_pagado: nuevoMontoPagado,
      nuevo_saldo: nuevoSaldo,
      nuevo_estado: nuevoEstado
    });

    // 5️⃣ Actualizar el fiado original
    if (nuevoSaldo === 0) {
      // Pago completo
      await sql`
        UPDATE fiados
        SET
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = ${nuevoSaldo},
          estado = ${nuevoEstado},
          cobrado_por = ${session.user?.id || null},
          planilla_asignado_id = NULL,
          fecha_asignacion = NULL,
          entregador_asignado = NULL,
          fecha_pago_completo = NOW(),
          updated_at = NOW()
        WHERE id = ${fiadoOriginal.id}
      `
    } else {
      // Abono parcial
      await sql`
        UPDATE fiados
        SET
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = ${nuevoSaldo},
          estado = ${nuevoEstado},
          planilla_asignado_id = NULL,
          fecha_asignacion = NULL,
          entregador_asignado = NULL,
          updated_at = NOW()
        WHERE id = ${fiadoOriginal.id}
      `
    }

    console.log('[REGISTRAR ABONO] ✅ Fiado actualizado');

    // 6️⃣ Registrar el abono en el historial
    await sql`
      INSERT INTO abonos_fiados (
        pedido_id,
        monto_abono,
        fecha_abono,
        metodo_pago,
        observaciones,
        registrado_por,
        created_at
      ) VALUES (
        ${fiadoOriginal.id},
        ${montoAbono},
        NOW(),
        ${metodoPago || 'efectivo'},
        ${observaciones || 'Abono registrado desde cobro en planilla'},
        ${session.user?.id},
        NOW()
      )
    `;

    console.log('[REGISTRAR ABONO] ✅ Abono registrado en historial');

    return NextResponse.json({
      success: true,
      mensaje: nuevoSaldo === 0 
        ? "¡Fiado pagado completamente!" 
        : `Abono registrado. Saldo pendiente: $${nuevoSaldo}`,
      fiado_id: fiadoOriginal.id,
      monto_abonado: montoAbono,
      monto_pagado: nuevoMontoPagado,
      saldo_pendiente: nuevoSaldo,
      estado: nuevoEstado
    });

  } catch (error: any) {
    console.error('[REGISTRAR ABONO] ❌ Error:', error);
    return handleDBError(error, 'REGISTRAR_ABONO');
  }
}
