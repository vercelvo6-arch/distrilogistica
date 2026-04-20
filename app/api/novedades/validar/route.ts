import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

// =====================================================
// POST: Validar una o varias novedades
// =====================================================
export async function POST(request: NextRequest) {
  try {
    console.log("[API novedades/validar] ===== INICIO =====");
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // Solo caja puede validar
    if (session.user?.rol === "entregador") {
      return NextResponse.json(
        { error: "Solo el usuario de caja puede validar novedades" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { novedadIds } = body; // Array de IDs o un solo ID

    if (!novedadIds || (Array.isArray(novedadIds) && novedadIds.length === 0)) {
      return NextResponse.json(
        { error: "Se requiere al menos un ID de novedad" },
        { status: 400 }
      );
    }

    const sql = getDB();
    const ids = Array.isArray(novedadIds) ? novedadIds : [novedadIds];

    console.log("[API novedades/validar] Validando novedades:", ids);

    // Validar las novedades
    const novedadesValidadas = await sql`
      UPDATE novedades_pedido
      SET 
        validado = true,
        validado_por = ${session.user?.email || session.user?.id},
        validado_en = NOW(),
        updated_at = NOW()
      WHERE id = ANY(${ids}::uuid[])
        AND validado = false
      RETURNING *
    `;

    console.log("[API novedades/validar] ✅ Novedades validadas:", novedadesValidadas.length);

    return NextResponse.json({
      success: true,
      novedadesValidadas: novedadesValidadas.length,
      novedades: novedadesValidadas,
      mensaje: `${novedadesValidadas.length} novedad(es) validada(s) exitosamente`,
    });

  } catch (error: any) {
    console.error("[API novedades/validar] ❌ Error:", error);
    return handleDBError(error, "NOVEDADES_VALIDAR");
  }
}
