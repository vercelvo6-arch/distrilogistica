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

    // =============================================
    // DETECTAR SI ES FIADO DIRECTO O PEDIDO DE COBRO
    // FIX: Los UUIDs contienen '-' pero son IDs de fiados directos, NO pedidos de cobro.
    // Solo son pedidos de cobro los que empiezan con 'PED'.
    // =============================================
    const esPedidoCobro = String(pedidoId).startsWith('PED')

    if (!esPedidoCobro) {
      // ── FLUJO DIRECTO: abono sobre tabla fiados ──
      console.log('[REGISTRAR ABONO] Flujo directo sobre tabla fiados, id:', pedidoId)

      const fiadoId = Number(pedidoId)
      
      let fiado: any = null

      // Buscar por id numérico si aplica
      if (!isNaN(fiadoId) && fiadoId > 0) {
        const result = await sql`
          SELECT * FROM fiados 
          WHERE id = ${fiadoId}
            AND (eliminado IS NULL OR eliminado = false)
          LIMIT 1
        `
        fiado = result[0] || null
      }

      // Si no encontró por id numérico, buscar por pedido_id (UUID o string)
      if (!fiado) {
        const result = await sql`
          SELECT * FROM fiados 
          WHERE pedido_id = ${String(pedidoId)}
            AND (eliminado IS NULL OR eliminado = false)
          LIMIT 1
        `
        fiado = result[0] || null
      }

      // También buscar directamente por id como string (por si el id de fiados es UUID)
      if (!fiado) {
        const result = await sql`
          SELECT * FROM fiados 
          WHERE id::text = ${String(pedidoId)}
            AND (eliminado IS NULL OR eliminado = false)
          LIMIT 1
        `
        fiado = result[0] || null
      }

      if (!fiado) {
        console.log('[REGISTRAR ABONO] ❌ Fiado no encontrado:', pedidoId)
        return NextResponse.json({ error: "Fiado no encontrado" }, { status: 404 })
      }

      const montoAbonoNum = Number(montoAbono)
      const saldoPendienteNum = Number(fiado.saldo_pendiente)
      const montoPagadoActual = Number(fiado.monto_pagado || 0)

      if (montoAbonoNum > saldoPendienteNum) {
        return NextResponse.json({ 
          error: `El abono ($${montoAbonoNum.toLocaleString()}) no puede ser mayor al saldo pendiente ($${saldoPendienteNum.toLocaleString()})` 
        }, { status: 400 })
      }

      const nuevoMontoPagado = montoPagadoActual + montoAbonoNum
      const nuevoSaldo = saldoPendienteNum - montoAbonoNum
      const pagoCompleto = nuevoSaldo <= 0
      const nuevoEstado = pagoCompleto ? 'pagado_completo' : 'abono_parcial'

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
        `
      } else {
        await sql`
          UPDATE fiados SET
            monto_pagado = ${nuevoMontoPagado},
            saldo_pendiente = ${nuevoSaldo},
            estado = 'abono_parcial',
            updated_at = NOW()
          WHERE id = ${fiado.id}
        `
      }

      // Registrar en historial de abonos
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
      `

      console.log('[REGISTRAR ABONO] ✅ Abono directo registrado sobre fiado:', fiado.id)

      return NextResponse.json({
        success: true,
        mensaje: pagoCompleto 
          ? "¡Fiado pagado completamente! 🎉" 
          : `Abono registrado. Saldo pendiente: $${nuevoSaldo.toLocaleString()}`,
        fiado_id: fiado.id,
        monto_abonado: montoAbonoNum,
        monto_pagado: nuevoMontoPagado,
        saldo_pendiente: nuevoSaldo,
        estado: nuevoEstado,
        pago_completo: pagoCompleto
      })
    }

    // =============================================
    // FLUJO ORIGINAL: pedido de cobro en planilla (empieza con 'PED')
    // =============================================
    const [pedidoCobro] = await sql`
      SELECT p.id, p.cliente, p.total, p.es_cobro, p.planilla_id
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

    const clienteSinCobro = pedidoCobro.cliente.replace(/\s*\(COBRO\)\s*/gi, '').trim();
    
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
    const nuevoEstado = pagoCompleto ? 'pagado_completo' : 'abono_parcial';

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
      estado: nuevoEstado,
      pago_completo: pagoCompleto
    });

  } catch (error: any) {
    console.error('[REGISTRAR ABONO] ❌ ERROR FATAL:', error);
    return handleDBError(error, 'REGISTRAR_ABONO');
  }
}
