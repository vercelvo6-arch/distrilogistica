import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

// =====================================================
// PUT: Editar una novedad existente
// =====================================================
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("[API novedades PUT] ===== INICIO =====");
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const novedadId = params.id;
    const body = await request.json();
    const { montoNovedad, descripcion, montoPagado } = body;

    console.log("[API novedades PUT] Editando novedad:", {
      id: novedadId,
      montoNovedad,
      descripcion,
      montoPagado,
    });

    const sql = getDB();

    // Verificar que la novedad existe
    const [novedadExistente] = await sql`
      SELECT * FROM novedades_pedido
      WHERE id = ${novedadId}
    `;

    if (!novedadExistente) {
      return NextResponse.json({ error: "Novedad no encontrada" }, { status: 404 });
    }

    // Si es entregador, solo puede editar sus propias novedades no validadas
    if (session.user?.rol === "entregador") {
      if (novedadExistente.validado) {
        return NextResponse.json(
          { error: "No puedes editar una novedad ya validada" },
          { status: 403 }
        );
      }
      if (novedadExistente.registrado_por !== session.user?.email && 
          novedadExistente.registrado_por !== session.user?.id) {
        return NextResponse.json(
          { error: "Solo puedes editar tus propias novedades" },
          { status: 403 }
        );
      }
    }

    // Actualizar la novedad
    const [novedadActualizada] = await sql`
      UPDATE novedades_pedido
      SET 
        monto_novedad = COALESCE(${montoNovedad}, monto_novedad),
        descripcion = COALESCE(${descripcion}, descripcion),
        monto_pagado = COALESCE(${montoPagado}, monto_pagado),
        updated_at = NOW()
      WHERE id = ${novedadId}
      RETURNING *
    `;

    console.log("[API novedades PUT] ✅ Novedad actualizada:", novedadActualizada);

    return NextResponse.json({
      success: true,
      novedad: novedadActualizada,
      mensaje: "Novedad actualizada exitosamente",
    });

  } catch (error: any) {
    console.error("[API novedades PUT] ❌ Error:", error);
    return handleDBError(error, "NOVEDADES_PUT");
  }
}

// =====================================================
// DELETE: Eliminar una novedad
// =====================================================
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log("[API novedades DELETE] ===== INICIO =====");
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const novedadId = params.id;
    console.log("[API novedades DELETE] Eliminando novedad:", novedadId);

    const sql = getDB();

    // Verificar que la novedad existe
    const [novedadExistente] = await sql`
      SELECT * FROM novedades_pedido
      WHERE id = ${novedadId}
    `;

    if (!novedadExistente) {
      return NextResponse.json({ error: "Novedad no encontrada" }, { status: 404 });
    }

    // Si es entregador, solo puede eliminar sus propias novedades no validadas
    if (session.user?.rol === "entregador") {
      if (novedadExistente.validado) {
        return NextResponse.json(
          { error: "No puedes eliminar una novedad ya validada" },
          { status: 403 }
        );
      }
      if (novedadExistente.registrado_por !== session.user?.email && 
          novedadExistente.registrado_por !== session.user?.id) {
        return NextResponse.json(
          { error: "Solo puedes eliminar tus propias novedades" },
          { status: 403 }
        );
      }
    }

    // Eliminar la novedad
    await sql`
      DELETE FROM novedades_pedido
      WHERE id = ${novedadId}
    `;

    console.log("[API novedades DELETE] ✅ Novedad eliminada");

    return NextResponse.json({
      success: true,
      mensaje: "Novedad eliminada exitosamente",
    });

  } catch (error: any) {
    console.error("[API novedades DELETE] ❌ Error:", error);
    return handleDBError(error, "NOVEDADES_DELETE");
  }
}
