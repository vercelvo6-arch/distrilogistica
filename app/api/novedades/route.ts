import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

// =====================================================
// GET: Obtener todas las novedades de un pedido
// =====================================================
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pedidoId = searchParams.get("pedidoId");
    const planillaId = searchParams.get("planillaId");

    const sql = getDB();

    if (pedidoId) {
      // Obtener novedades de un pedido específico
      const novedades = await sql`
        SELECT 
          n.*,
          p.cliente,
          p.total as total_pedido
        FROM novedades_pedido n
        JOIN pedidos p ON n.pedido_id = p.id
        WHERE n.pedido_id = ${pedidoId}
        ORDER BY n.created_at DESC
      `;

      return NextResponse.json({ novedades });
    }

    if (planillaId) {
      // Obtener todas las novedades de una planilla
      const novedades = await sql`
        SELECT 
          n.*,
          p.cliente,
          p.total as total_pedido,
          p.planilla_id
        FROM novedades_pedido n
        JOIN pedidos p ON n.pedido_id = p.id
        WHERE p.planilla_id = ${planillaId}
        ORDER BY n.created_at DESC
      `;

      return NextResponse.json({ novedades });
    }

    return NextResponse.json({ error: "Se requiere pedidoId o planillaId" }, { status: 400 });

  } catch (error: any) {
    console.error("[API novedades GET] Error:", error);
    return handleDBError(error, "NOVEDADES_GET");
  }
}

// =====================================================
// POST: Crear una nueva novedad
// =====================================================
export async function POST(request: NextRequest) {
  try {
    console.log("[API novedades POST] ===== INICIO =====");
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const {
      pedidoId,
      tipoNovedad,
      montoNovedad,
      descripcion,
      montoPagado,
    } = body;

    console.log("[API novedades POST] Datos recibidos:", {
      pedidoId,
      tipoNovedad,
      montoNovedad,
      descripcion,
      montoPagado,
    });

    // Validaciones
    if (!pedidoId || !tipoNovedad || !montoNovedad) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: pedidoId, tipoNovedad, montoNovedad" },
        { status: 400 }
      );
    }

    const tiposValidos = ["agotado", "devolucion", "fiado_parcial", "error_facturacion"];
    if (!tiposValidos.includes(tipoNovedad)) {
      return NextResponse.json(
        { error: `Tipo de novedad inválido. Debe ser: ${tiposValidos.join(", ")}` },
        { status: 400 }
      );
    }

    if (Number(montoNovedad) <= 0) {
      return NextResponse.json(
        { error: "El monto de la novedad debe ser mayor a 0" },
        { status: 400 }
      );
    }

    const sql = getDB();

    // Verificar que el pedido existe
    const [pedido] = await sql`
      SELECT id, total, planilla_id
      FROM pedidos
      WHERE id = ${pedidoId}
    `;

    if (!pedido) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    console.log("[API novedades POST] Pedido encontrado:", {
      id: pedido.id,
      total: pedido.total,
      planilla: pedido.planilla_id,
    });

    // Determinar quién registra (entregador o caja)
    const tipoRegistro = session.user?.rol === "entregador" ? "entregador" : "caja";

    // Crear la novedad
    const [novedad] = await sql`
      INSERT INTO novedades_pedido (
        pedido_id,
        tipo_novedad,
        monto_novedad,
        descripcion,
        monto_pagado,
        registrado_por,
        tipo_registro,
        validado
      ) VALUES (
        ${pedidoId},
        ${tipoNovedad},
        ${Number(montoNovedad)},
        ${descripcion || null},
        ${tipoNovedad === 'fiado_parcial' ? Number(montoPagado || 0) : 0},
        ${session.user?.email || session.user?.id},
        ${tipoRegistro},
        ${tipoRegistro === 'caja'}
      )
      RETURNING *
    `;

    console.log("[API novedades POST] ✅ Novedad creada:", novedad);

    return NextResponse.json({
      success: true,
      novedad,
      mensaje: "Novedad registrada exitosamente",
    });

  } catch (error: any) {
    console.error("[API novedades POST] ❌ Error:", error);
    return handleDBError(error, "NOVEDADES_POST");
  }
}
