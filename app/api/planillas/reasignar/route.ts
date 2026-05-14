import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.log("[API /planillas/reasignar] ===== INICIO =====");
  
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    if (session.user.rol !== 'caja' && session.user.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'No tienes permisos para reasignar rutas' },
        { status: 403 }
      )
    }

    const body = await request.json();
    const { planillaId, nuevoEntregador } = body;

    if (!planillaId) {
      return NextResponse.json({ error: "planillaId es requerido" }, { status: 400 });
    }
    
    if (!nuevoEntregador || !nuevoEntregador.trim()) {
      return NextResponse.json({ error: "nuevoEntregador es requerido" }, { status: 400 });
    }

    console.log(`[API /reasignar] Reasignando planilla ${planillaId} a ${nuevoEntregador}`);

    const sql = getDB();

    const entregadorExists = await sql`
      SELECT id, nombre FROM usuarios 
      WHERE nombre = ${nuevoEntregador} 
        AND rol = 'entregador' 
        AND estado = 'activo'
    `;

    if (entregadorExists.length === 0) {
      return NextResponse.json(
        { error: `El entregador "${nuevoEntregador}" no existe o no está activo` },
        { status: 400 }
      );
    }

    const planillaActual = await sql`
      SELECT id, entregador, tipo_ruta, total_cargue 
      FROM planillas 
      WHERE id = ${planillaId} 
      LIMIT 1
    `;

    if (planillaActual.length === 0) {
      return NextResponse.json({ error: "La planilla no existe" }, { status: 404 });
    }

    const entregadorAnterior = planillaActual[0].entregador;
    const totalCargue = planillaActual[0].total_cargue;

    console.log(`[API /reasignar] Entregador anterior: ${entregadorAnterior}`);
    console.log(`[API /reasignar] Total cargue a reasignar: ${totalCargue}`);

    // Actualizar entregador en la planilla
    const result = await sql`
      UPDATE planillas
      SET entregador = ${nuevoEntregador},
          updated_at = NOW()
      WHERE id = ${planillaId}
      RETURNING id, entregador, tipo_ruta, fecha
    `;

    console.log(`[API /reasignar] ✓ Planilla reasignada exitosamente`);

    // ✅ Actualizar entregador en faltantes pendientes de esta planilla
    const faltantesActualizados = await sql`
      UPDATE faltantes
      SET entregador = ${nuevoEntregador},
          updated_at = NOW()
      WHERE planilla_id = ${planillaId}
        AND estado = 'pendiente'
      RETURNING id
    `

    console.log(`[API /reasignar] ✓ Faltantes actualizados: ${faltantesActualizados.length}`);
    console.log(`[API /reasignar] ===== FIN =====`);

    return NextResponse.json({
      success: true,
      mensaje: `Ruta reasignada de ${entregadorAnterior} a ${nuevoEntregador}`,
      planillaId,
      entregadorAnterior,
      nuevoEntregador,
      totalCargue,
      planilla: result[0],
      faltantesActualizados: faltantesActualizados.length
    });

  } catch (error: any) {
    console.error("[API /reasignar] ERROR FATAL", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
