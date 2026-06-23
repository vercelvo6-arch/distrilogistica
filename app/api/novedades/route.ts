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

      // ✅ Devolver TODAS las novedades — validadas y no validadas
      // El entregador ve el impacto inmediato de lo que registra
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

    if (!pedidoId || !tipoNovedad) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: pedidoId, tipoNovedad" },
        { status: 400 }
      );
    }

    if (montoNovedad === undefined || montoNovedad === null) {
      return NextResponse.json(
        { error: "montoNovedad es requerido" },
        { status: 400 }
      );
    }

    const tiposValidos = ["agotado", "devolucion", "fiado_parcial", "fiado", "error_facturacion", "descuento"];
    if (!tiposValidos.includes(tipoNovedad)) {
      return NextResponse.json(
        { error: `Tipo de novedad inválido. Debe ser: ${tiposValidos.join(", ")}` },
        { status: 400 }
      );
    }

    const esFiado = tipoNovedad === 'fiado_parcial' || tipoNovedad === 'fiado'

    if (Number(montoNovedad) <= 0 && !esFiado) {
      return NextResponse.json(
        { error: "El monto de la novedad debe ser mayor a 0" },
        { status: 400 }
      );
    }

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

    // ✅ NO tocar el estado del pedido — las novedades son la fuente de verdad
    // El estado del pedido lo actualiza caja al momento de cuadrar

    // ✅ SINCRONIZACIÓN INMEDIATA: si es fiado, refleja en la tabla `fiados`
    // ahora mismo — sin esperar a que caja cuadre la planilla. Esto es lo que
    // consulta el admin (`fiados-view`), así que debe existir desde el instante
    // en que el entregador o caja marcan el fiado.
    let fiadoSincronizado = null
    if (esFiado) {
      const [pedidoCompleto] = await sql`
        SELECT p.id, p.cliente, p.direccion, p.telefono, p.observaciones,
               pl.fecha, pl.entregador, pl.tipo_ruta
        FROM pedidos p
        JOIN planillas pl ON p.planilla_id = pl.id
        WHERE p.id = ${pedidoId}
      `

      if (pedidoCompleto) {
        const saldo        = Math.max(0, Number(montoNovedad))
        const montoPagadoN = Number(montoPagado || 0)
        const totalPedido  = saldo + montoPagadoN

        const [existente] = await sql`
          SELECT id FROM fiados WHERE pedido_id = ${pedidoId}
        `

        if (existente) {
          // Ya existe un fiado para este pedido — actualizar saldo/abono
          const [actualizado] = await sql`
            UPDATE fiados SET
              monto_total     = ${totalPedido},
              monto_pagado    = ${montoPagadoN},
              saldo_pendiente = ${saldo},
              estado          = ${saldo > 0 ? 'pendiente' : 'pagado_completo'},
              updated_at      = NOW()
            WHERE id = ${existente.id}
            RETURNING *
          `
          fiadoSincronizado = actualizado
        } else {
          const [creado] = await sql`
            INSERT INTO fiados (
              pedido_id, cliente, direccion, telefono,
              monto_total, monto_pagado, saldo_pendiente,
              fecha_fiado, entregador, ruta, estado, observaciones
            ) VALUES (
              ${pedidoCompleto.id}, ${pedidoCompleto.cliente}, ${pedidoCompleto.direccion || null},
              ${pedidoCompleto.telefono || null}, ${totalPedido},
              ${montoPagadoN}, ${saldo},
              ${pedidoCompleto.fecha}, ${pedidoCompleto.entregador}, ${pedidoCompleto.tipo_ruta},
              ${saldo > 0 ? 'pendiente' : 'pagado_completo'},
              ${pedidoCompleto.observaciones || null}
            )
            ON CONFLICT DO NOTHING
            RETURNING *
          `
          fiadoSincronizado = creado
        }
      }
    }

    return NextResponse.json({
      success: true,
      novedad,
      fiado: fiadoSincronizado,
      mensaje: "Novedad registrada exitosamente",
    });

  } catch (error: any) {
    return handleDBError(error, "NOVEDADES_POST");
  }
}
