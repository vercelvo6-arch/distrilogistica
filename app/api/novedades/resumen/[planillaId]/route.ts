import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

const esVerdadero = (val: any): boolean => val === true || val === 't';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ planillaId: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { planillaId } = await params;
    if (!planillaId) {
      return NextResponse.json({ error: "planillaId requerido" }, { status: 400 });
    }

    const sql = getDB();

    const todasLasNovedades = await sql`
      SELECT n.*, p.cliente
      FROM novedades_pedido n
      JOIN pedidos p ON n.pedido_id = p.id
      WHERE p.planilla_id = ${planillaId}
      ORDER BY n.created_at DESC
    `;

    const resumenPorTipo: Record<string, any> = {
      agotado:           { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
      devolucion:        { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
      fiado:             { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0, pagado: 0 },
      error_facturacion: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
    };

    for (const novedad of todasLasNovedades) {
      const tipo = novedad.tipo_novedad === 'fiado_parcial' ? 'fiado' : novedad.tipo_novedad;
      if (!resumenPorTipo[tipo]) continue;
      const monto = Number(novedad.monto_novedad || 0);
      resumenPorTipo[tipo].clientes.add(novedad.pedido_id);
      resumenPorTipo[tipo].cantidad++;
      if (esVerdadero(novedad.validado)) {
        resumenPorTipo[tipo].validadas += monto;
        if (tipo === 'fiado') {
          resumenPorTipo[tipo].pagado += Number(novedad.monto_pagado || 0);
        }
      } else {
        resumenPorTipo[tipo].pendientes += monto;
      }
      resumenPorTipo[tipo].total =
        resumenPorTipo[tipo].validadas + resumenPorTipo[tipo].pendientes;
    }

    Object.keys(resumenPorTipo).forEach(tipo => {
      resumenPorTipo[tipo].clientes = resumenPorTipo[tipo].clientes.size;
    });

    const novedadesPendientes = todasLasNovedades.filter(n => !esVerdadero(n.validado));

    const totalNovedades = Object.values(resumenPorTipo).reduce(
      (sum: number, tipo: any) => sum + tipo.total, 0
    );
    const totalPendientes = Object.values(resumenPorTipo).reduce(
      (sum: number, tipo: any) => sum + tipo.pendientes, 0
    );

    return NextResponse.json({
      resumen: resumenPorTipo,
      totales: {
        total_novedades: totalNovedades,
        total_pendientes: totalPendientes,
        total_validadas: totalNovedades - totalPendientes,
      },
      novedadesPendientes,
      todasNovedades: todasLasNovedades, // ← agregado para permitir revertir validadas
    });

  } catch (error: any) {
    console.error("[API novedades/resumen] ❌ Error:", error);
    return handleDBError(error, "NOVEDADES_RESUMEN");
  }
}
