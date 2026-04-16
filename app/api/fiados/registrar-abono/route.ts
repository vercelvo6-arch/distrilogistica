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
    
    console.log('[REGISTRAR ABONO] Datos recibidos:', {
      pedidoId,
      montoAbono,
      metodoPago
    });

    if (!pedidoId || !montoAbono || montoAbono <= 0) {
      return NextResponse.json({ 
        error: "Datos inválidos. Se requiere pedidoId y montoAbono mayor a 0" 
      }, { status: 400 });
    }

    const sql = getDB();

    // =============================================
    // PASO 1: Obtener el pedido de cobro
    // =============================================
    const [pedidoCobro] = await sql`
      SELECT 
        p.id,
        p.cliente,
        p.total,
        p.es_cobro,
        p.planilla_id
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

    console.log('[REGISTRAR ABONO] Pedido encontrado:', {
      cliente: pedidoCobro.cliente,
      total: pedidoCobro.total,
      planilla: pedidoCobro.planilla_id
    });

    // =============================================
    // PASO 2: Buscar el fiado original
    // =============================================
    const clienteSinCobro = pedidoCobro.cliente.replace(/\s*\(COBRO\)\s*/gi, '').trim();
    
    const [fiadoOriginal] = await sql`
      SELECT 
        f.id,
        f.pedido_id,
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

    console.log('[REGISTRAR ABONO] Fiado encontrado:', {
      id: fiadoOriginal.id,
      saldo_pendiente: fiadoOriginal.saldo_pendiente,
      planilla_asignado: fiadoOriginal.planilla_asignado_id
    });

    // =============================================
    // PASO 3: Validar monto del abono
    // =============================================
    const montoAbonoNum = Number(montoAbono);
    const saldoPendienteNum = Number(fiadoOriginal.saldo_pendiente);
    
    console.log('[REGISTRAR ABONO] Validando monto:', {
      montoAbono: montoAbonoNum,
      saldoPendiente: saldoPendienteNum
    });

    if (montoAbonoNum > saldoPendienteNum) {
      console.log('[REGISTRAR ABONO] ❌ Abono excede saldo');
      return NextResponse.json({ 
        error: `El abono ($${montoAbonoNum.toLocaleString()}) no puede ser mayor al saldo pendiente ($${saldoPendienteNum.toLocaleString()})` 
      }, { status: 400 });
    }

    // =============================================
    // PASO 4: Calcular nuevos valores
    // =============================================
    const nuevoMontoPagado = Number(fiadoOriginal.monto_pagado) + montoAbonoNum;
    const nuevoSaldo = saldoPendienteNum - montoAbonoNum;
    const pagoCompleto = nuevoSaldo === 0;
    const nuevoEstado = pagoCompleto ? 'pagado_completo' : 'abono_parcial';

    console.log('[REGISTRAR ABONO] Cálculos:', {
      abono: montoAbonoNum,
      nuevo_pagado: nuevoMontoPagado,
      nuevo_saldo: nuevoSaldo,
      pago_completo: pagoCompleto,
      nuevo_estado: nuevoEstado
    });

    // =============================================
    // PASO 5: Actualizar fiado según el caso
    // =============================================
    if (pagoCompleto) {
      // ✅ PAGO COMPLETO
      console.log('[REGISTRAR ABONO] 💰 Pago completo');
      
      await sql`
        UPDATE fiados
        SET
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

      // Eliminar el pedido de cobro (ya no es necesario)
      await sql`
        DELETE FROM pedido_productos WHERE pedido_id = ${pedidoId}
      `;
      
      await sql`
        DELETE FROM pedidos WHERE id = ${pedidoId}
      `;

      console.log('[REGISTRAR ABONO] ✅ Pedido de cobro eliminado');

    } else {
      // 📝 ABONO PARCIAL
      console.log('[REGISTRAR ABONO] 📝 Abono parcial - Saldo restante:', nuevoSaldo);
      
      await sql`
        UPDATE fiados
        SET
          monto_pagado = ${nuevoMontoPagado},
          saldo_pendiente = ${nuevoSaldo},
          estado = 'abono_parcial',
          planilla_asignado_id = NULL,
          fecha_asignacion = NULL,
          entregador_asignado = NULL,
          updated_at = NOW()
        WHERE id = ${fiadoOriginal.id}
      `;

      // ⚠️ CRÍTICO: Restar el SALDO PENDIENTE del total_cargue de la planilla
      if (fiadoOriginal.planilla_asignado_id) {
        console.log('[REGISTRAR ABONO] 📉 Restando saldo del cargue de planilla:', fiadoOriginal.planilla_asignado_id);
        
        await sql`
          UPDATE planillas
          SET 
            total_cargue = total_cargue - ${nuevoSaldo},
            updated_at = NOW()
          WHERE id = ${fiadoOriginal.planilla_asignado_id}
        `;

        console.log('[REGISTRAR ABONO] ✅ Cargue actualizado (restado: $', nuevoSaldo, ')');
      }

      // Eliminar el pedido de cobro (el fiado vuelve al Admin)
      await sql`
        DELETE FROM pedido_productos WHERE pedido_id = ${pedidoId}
      `;
      
      await sql`
        DELETE FROM pedidos WHERE id = ${pedidoId}
      `;

      console.log('[REGISTRAR ABONO] ✅ Pedido de cobro eliminado - Fiado regresa a Admin');
    }

    // =============================================
    // PASO 6: Registrar el abono en el historial
    // =============================================
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
        ${montoAbonoNum},
        NOW(),
        ${metodoPago || 'efectivo'},
        ${observaciones || 'Abono registrado desde cobro en planilla'},
        ${session.user?.id},
        NOW()
      )
    `;

    console.log('[REGISTRAR ABONO] ✅ Abono registrado en historial');

    // =============================================
    // RESPUESTA EXITOSA
    // =============================================
    const resultado = {
      success: true,
      mensaje: pagoCompleto 
        ? "¡Fiado pagado completamente! 🎉" 
        : `Abono registrado. Saldo pendiente: $${nuevoSaldo.toLocaleString()} - Fiado devuelto a Admin`,
      fiado_id: fiadoOriginal.id,
      monto_abonado: montoAbonoNum,
      monto_pagado: nuevoMontoPagado,
      saldo_pendiente: nuevoSaldo,
      estado: nuevoEstado,
      pago_completo: pagoCompleto
    };

    console.log('[REGISTRAR ABONO] 🎉 ÉXITO:', resultado);
    console.log('[REGISTRAR ABONO] ===== FIN =====\n');

    return NextResponse.json(resultado);

  } catch (error: any) {
    console.error('[REGISTRAR ABONO] ❌ ERROR FATAL:', error);
    return handleDBError(error, 'REGISTRAR_ABONO');
  }
}
