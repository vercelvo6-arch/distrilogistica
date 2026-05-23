import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export async function POST(request: NextRequest) {
  try {
    console.log('[COBRO COMPLETADO] Iniciando...');
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { cobroId, montoAbono, metodoPago } = await request.json();
    
    if (!cobroId) {
      return NextResponse.json({ error: "ID de cobro requerido" }, { status: 400 });
    }

    const sql = getDB();

    // 1️⃣ Obtener el pedido de cobro
    const [pedidoCobro] = await sql`
      SELECT p.id, p.cliente, p.total, p.es_cobro, p.planilla_id
      FROM pedidos p
      WHERE p.id = ${cobroId}
      LIMIT 1
    `;

    if (!pedidoCobro) {
      return NextResponse.json({ error: "Pedido de cobro no encontrado" }, { status: 404 });
    }

    if (!pedidoCobro.es_cobro) {
      return NextResponse.json({ error: "Este no es un pedido de cobro" }, { status: 400 });
    }

    console.log('[COBRO COMPLETADO] Pedido encontrado:', pedidoCobro.cliente);

    // 2️⃣ Buscar el fiado original — primero por pedido_id, luego por nombre
    const clienteSinCobro = pedidoCobro.cliente.replace(/\s*\(COBRO\)\s*/gi, '').trim();
    
    // Intentar buscar por pedido_id asociado
    let fiadoOriginal: any = null

    const porPedidoId = await sql`
      SELECT f.id, f.saldo_pendiente, f.monto_pagado, f.monto_total,
             f.planilla_asignado_id, f.pedido_id
      FROM fiados f
      WHERE f.pedido_id = ${cobroId}
        AND (f.eliminado IS NULL OR f.eliminado = false)
      LIMIT 1
    `
    fiadoOriginal = porPedidoId[0] || null

    // Si no encontró por pedido_id, buscar por nombre
    if (!fiadoOriginal) {
      const porNombre = await sql`
        SELECT f.id, f.saldo_pendiente, f.monto_pagado, f.monto_total,
               f.planilla_asignado_id, f.pedido_id
        FROM fiados f
        WHERE f.cliente ILIKE ${clienteSinCobro}
          AND f.estado IN ('pendiente', 'abono_parcial')
          AND (f.eliminado IS NULL OR f.eliminado = false)
        ORDER BY f.fecha_fiado DESC
        LIMIT 1
      `
      fiadoOriginal = porNombre[0] || null
    }

    if (!fiadoOriginal) {
      return NextResponse.json({ 
        error: "No se encontró el fiado original asociado a este cobro" 
      }, { status: 404 });
    }

    console.log('[COBRO COMPLETADO] Fiado encontrado:', fiadoOriginal.id);

    // 3️⃣ Calcular montos
    const montoCobrado = montoAbono ? Number(montoAbono) : Number(pedidoCobro.total)
    const saldoActual = Number(fiadoOriginal.saldo_pendiente)
    const montoPagadoActual = Number(fiadoOriginal.monto_pagado || 0)
    const nuevoMontoPagado = montoPagadoActual + montoCobrado
    const nuevoSaldo = Math.max(0, saldoActual - montoCobrado)
    const pagoCompleto = nuevoSaldo <= 0
    const nuevoEstado = pagoCompleto ? 'pagado_completo' : 'abono_parcial'

    // 4️⃣ Actualizar el fiado original
    if (pagoCompleto) {
      await sql`
        UPDATE fiados SET
          estado = 'pagado_completo',
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = 0,
          fecha_pago_completo = NOW(),
          planilla_asignado_id = NULL,
          fecha_asignacion = NULL,
          entregador_asignado = NULL,
          updated_at = NOW()
        WHERE id = ${fiadoOriginal.id}
      `;
    } else {
      await sql`
        UPDATE fiados SET
          estado = 'abono_parcial',
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = ${nuevoSaldo},
          planilla_asignado_id = NULL,
          fecha_asignacion = NULL,
          entregador_asignado = NULL,
          updated_at = NOW()
        WHERE id = ${fiadoOriginal.id}
      `;
    }

    console.log('[COBRO COMPLETADO] ✅ Fiado actualizado, estado:', nuevoEstado);

    // 5️⃣ Registrar en historial de abonos
    // ✅ FIX: usar pedido_id no fiado_id
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
        ${montoCobrado},
        NOW(),
        ${metodoPago || 'efectivo'},
        ${pagoCompleto ? 'Pago completo registrado desde cobro en planilla' : 'Abono parcial registrado desde cobro en planilla'},
        ${session.user?.id || 'Sistema'},
        NOW()
      )
    `;

    console.log('[COBRO COMPLETADO] ✅ Abono registrado en historial');

    // 6️⃣ Eliminar el pedido de cobro de la planilla
    await sql`DELETE FROM pedido_productos WHERE pedido_id = ${cobroId}`;
    await sql`DELETE FROM pedidos WHERE id = ${cobroId}`;

    console.log('[COBRO COMPLETADO] ✅ Pedido de cobro eliminado de planilla');

    return NextResponse.json({
      success: true,
      mensaje: pagoCompleto 
        ? "¡Cobro registrado! Fiado marcado como pagado completo." 
        : `Abono registrado. Saldo pendiente: $${nuevoSaldo.toLocaleString()}`,
      fiado: {
        id: fiadoOriginal.id,
        monto_pagado: nuevoMontoPagado,
        saldo_pendiente: nuevoSaldo,
        estado: nuevoEstado,
        pago_completo: pagoCompleto
      }
    });

  } catch (error: any) {
    console.error('[COBRO COMPLETADO] ❌ Error:', error);
    return handleDBError(error, 'MARCAR_COBRO_COMPLETADO');
  }
}
