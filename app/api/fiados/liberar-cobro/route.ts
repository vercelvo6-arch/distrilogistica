import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export async function POST(request: NextRequest) {
  try {
    console.log('[LIBERAR COBRO] Iniciando...');
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { cobroId } = await request.json();
    
    if (!cobroId) {
      return NextResponse.json({ error: "ID de cobro requerido" }, { status: 400 });
    }

    const sql = getDB();

    // 1️⃣ Obtener el pedido de cobro
    const [pedidoCobro] = await sql`
      SELECT 
        p.id,
        p.cliente,
        p.es_cobro
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

    console.log('[LIBERAR COBRO] Pedido encontrado:', pedidoCobro.cliente);

    // 2️⃣ Buscar el fiado original asociado
    const clienteSinCobro = pedidoCobro.cliente.replace(/\s*\(COBRO\)\s*/gi, '').trim();
    
    const [fiadoOriginal] = await sql`
      SELECT 
        f.id,
        f.cliente,
        f.saldo_pendiente,
        f.planilla_asignado_id
      FROM fiados f
      WHERE f.cliente ILIKE ${clienteSinCobro}
        AND f.estado IN ('pendiente', 'abono_parcial')
        AND f.planilla_asignado_id IS NOT NULL
      ORDER BY f.fecha_creacion DESC
      LIMIT 1
    `;

    if (!fiadoOriginal) {
      console.warn('[LIBERAR COBRO] ⚠️ No se encontró fiado asociado');
      return NextResponse.json({ 
        success: true,
        mensaje: "No se encontró fiado asociado (puede que ya fue liberado)"
      });
    }

    console.log('[LIBERAR COBRO] Fiado encontrado:', fiadoOriginal.id);

    // 3️⃣ Liberar el fiado (quitar tracking de asignación)
    await sql`
      UPDATE fiados
      SET
        planilla_asignado_id = NULL,
        fecha_asignacion = NULL,
        entregador_asignado = NULL,
        updated_at = NOW()
      WHERE id = ${fiadoOriginal.id}
    `;

    console.log('[LIBERAR COBRO] ✅ Fiado liberado y disponible para reasignación');

    return NextResponse.json({
      success: true,
      mensaje: "Fiado liberado exitosamente. Vuelve a estar disponible en Admin.",
      fiado_id: fiadoOriginal.id,
      cliente: fiadoOriginal.cliente,
      saldo_pendiente: fiadoOriginal.saldo_pendiente
    });

  } catch (error: any) {
    console.error('[LIBERAR COBRO] ❌ Error:', error);
    return handleDBError(error, 'LIBERAR_COBRO');
  }
}
