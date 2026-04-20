import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

// =====================================================
// POST: Cambiar el tipo de una novedad (reclasificar)
// =====================================================
export async function POST(request: NextRequest) {
  try {
    console.log("[API novedades/cambiar-tipo] ===== INICIO =====");
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Solo caja puede cambiar tipos
    if (session.user?.rol === "entregador") {
      return NextResponse.json(
        { error: "Solo el usuario de caja puede cambiar el tipo de novedades" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { novedadId, nuevoTipo } = body;

    console.log("[API novedades/cambiar-tipo] Datos recibidos:", {
      novedadId,
      nuevoTipo,
    });

    if (!novedadId || !nuevoTipo) {
      return NextResponse.json(
        { error: "Se requiere novedadId y nuevoTipo" },
        { status: 400 }
      );
    }

    const tiposValidos = ["agotado", "devolucion", "fiado_parcial", "error_facturacion"];
    if (!tiposValidos.includes(nuevoTipo)) {
      return NextResponse.json(
        { error: `Tipo de novedad inválido. Debe ser: ${tiposValidos.join(", ")}` },
        { status: 400 }
      );
    }

    const sql = getDB();

    // Verificar que la novedad existe
    const [novedadExistente] = await sql`
      SELECT * FROM novedades_pedido
      WHERE id = ${novedadId}
    `;

    if (!novedadExistente) {
      return NextResponse.json({ error: "Novedad no encontrada" }, { status: 404 });
    }

    console.log("[API novedades/cambiar-tipo] Novedad actual:", {
      id: novedadExistente.id,
      tipoActual: novedadExistente.tipo_novedad,
      nuevoTipo,
    });

    // Si era fiado y se cambia a otro tipo, limpiar monto_pagado
    const montoPagado = nuevoTipo === 'fiado_parcial' ? novedadExistente.monto_pagado : 0;

    // Cambiar el tipo
    const [novedadActualizada] = await sql`
      UPDATE novedades_pedido
      SET 
        tipo_novedad = ${nuevoTipo},
        monto_pagado = ${montoPagado},
        validado = true,
        validado_por = ${session.user?.email || session.user?.id},
        validado_en = NOW(),
        updated_at = NOW()
      WHERE id = ${novedadId}
      RETURNING *
    `;

    console.log("[API novedades/cambiar-tipo] ✅ Tipo cambiado:", {
      de: novedadExistente.tipo_novedad,
      a: novedadActualizada.tipo_novedad,
    });

    return NextResponse.json({
      success: true,
      novedad: novedadActualizada,
      mensaje: `Novedad reclasificada de "${novedadExistente.tipo_novedad}" a "${nuevoTipo}"`,
    });

  } catch (error: any) {
    console.error("[API novedades/cambiar-tipo] ❌ Error:", error);
    return handleDBError(error, "NOVEDADES_CAMBIAR_TIPO");
  }
}
