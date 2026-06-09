import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

const esVerdadero = (val: any): boolean => val === true || val === 't';

function normalizarNovedades(novedades: any[]) {
  return novedades.map(n => ({ ...n, validado: esVerdadero(n.validado) }));
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const pedidoId   = searchParams.get("pedidoId");
    const planillaId  = searchParams.get("planillaId");
    const planillaIds = searchParams.get("planillaIds");

    const sql = getDB();

    if (pedidoId) {
      const novedades = await sql`
        SELECT n.*, p.cliente, p.total AS total_pedido
        FROM novedades_pedido n
        JOIN pedidos p ON n.pedido_id = p.id
        WHERE n.pedido_id = ${pedidoId}
        ORDER BY n.created_at DESC
      `;
      return NextResponse.json({ novedades: normalizarNovedades(novedades) });
    }

    if (planillaId) {
      const novedades = await sql`
        SELECT n.*, p.cliente, p.total AS total_pedido, p.planilla_id
        FROM novedades_pedido n
        JOIN pedidos p ON n.pedido_id = p.id
        WHERE p.planilla_id = ${planillaId}
        ORDER BY n.created_at DESC
      `;
      return NextResponse.json({ novedades: normalizarNovedades(novedades) });
    }

    if (planillaIds) {
      const ids = planillaIds.split(",").map(id => id.trim()).filter(id => id);
      if (ids.length === 0) return NextResponse.json({ novedades: [] });

      const novedades = await sql`
        SELECT n.*, p.cliente, p.total AS total_pedido, p.planilla_id
        FROM novedades_pedido n
        JOIN pedidos p ON n.pedido_id = p.id
        WHERE p.planilla_id = ANY(${ids})
        ORDER BY n.created_at DESC
      `;
      return NextResponse.json({ novedades: normalizarNovedades(novedades) });
    }

    return NextResponse.json(
      { error: "Se requiere pedidoId, planillaId o planillaIds" },
      { status: 400 }
    );

  } catch (error: any) {
    console.error("[API novedades GET] Error:", error);
    return handleDBError(error, "NOVEDADES_GET");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { pedidoId, tipoNovedad, montoNovedad, descripcion, montoPagado } = body;

    // ── Validaciones ────────────────────────────────────────────────────────
    if (!pedidoId || !tipoNovedad) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: pedidoId, tipoNovedad" },
        { status: 400 }
      );
    }

    // montoNovedad puede ser 0 solo para fiado_parcial (cliente abonó el total)
    if (montoNovedad === undefined || montoNovedad === null) {
      return NextResponse.json(
        { error: "montoNovedad es requerido" },
        { status: 400 }
      );
    }

    const tiposValidos = ["agotado", "devolucion", "fiado_parcial", "fiado", "error_facturacion"];
    if (!tiposValidos.includes(tipoNovedad)) {
      return NextResponse.json(
        { error: `Tipo de novedad inválido. Debe ser: ${tiposValidos.join(", ")}` },
        { status: 400 }
      );
    }

    const esFiado = tipoNovedad === 'fiado_parcial' || tipoNovedad === 'fiado'

    // Solo rechazar monto 0 si NO es fiado (para fiado, monto 0 = cliente no abonó nada)
    if (Number(montoNovedad) <= 0 && !esFiado) {
      return NextResponse.json(
        { error: "El monto de la novedad debe ser mayor a 0" },
        { status: 400 }
      );
    }

    // Para fiado, montoNovedad es el saldo que queda fiado — debe ser >= 0
    if (esFiado && Number(montoNovedad) < 0) {
      return NextResponse.json(
        { error: "El saldo fiado no puede ser negativo" },
        { status: 400 }
      );
    }

    const sql = getDB();

    const [pedido] = await sql`
      SELECT id, total, planilla_id
      FROM pedidos
      WHERE id = ${pedidoId}
    `;

    if (!pedido) {
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    const tipoRegistro = session.user?.rol === "entregador" ? "entregador" : "caja";

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
        ${esFiado ? Number(montoPagado || 0) : 0},
        ${session.user?.email || session.user?.id},
        ${tipoRegistro},
        ${tipoRegistro === 'caja'}
      )
      RETURNING *
    `;

    // Actualizar estado del pedido según el tipo de novedad
    if (esFiado) {
      const montoPagadoNum = Number(montoPagado || 0)
      const saldoPendiente = Number(montoNovedad)
      await sql`
        UPDATE pedidos SET
          estado          = 'fiado',
          monto_pagado    = ${montoPagadoNum},
          saldo_pendiente = ${saldoPendiente},
          updated_at      = NOW()
        WHERE id = ${pedidoId}
      `
    } else if (tipoNovedad === 'devolucion') {
      await sql`
        UPDATE pedidos SET
          estado     = 'devolucion',
          updated_at = NOW()
        WHERE id = ${pedidoId}
      `
    } else if (tipoNovedad === 'agotado') {
      await sql`
        UPDATE pedidos SET
          estado     = 'devolucion',
          updated_at = NOW()
        WHERE id = ${pedidoId}
      `
    }

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
