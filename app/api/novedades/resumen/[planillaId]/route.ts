import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

// PostgreSQL puede retornar boolean como true/false O como 't'/'f' según el driver
const esVerdadero = (val: any): boolean => val === true || val === 't'

export async function GET(
  request: NextRequest,
  { params }: { params: { planillaId: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const planillaId = params.planillaId;

    const sql = getDB();

    const todasLasNovedades = await sql`
      SELECT 
        n.*,
        p.cliente
      FROM novedades_pedido n
      JOIN pedidos p ON n.pedido_id = p.id
      WHERE p.planilla_id = ${planillaId}
      ORDER BY n.created_at DESC
    `;

    const resumenPorTipo: Record<string, any> = {
      agotado: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
      devolucion: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
      fiado_parcial: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0, pagado: 0 },
      error_facturacion: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
    };

    for (const novedad of todasLasNovedades) {
      const tipo = novedad.tipo_novedad;
      if (!resumenPorTipo[tipo]) continue;

      const monto = Number(novedad.monto_novedad || 0);
      
      resumenPorTipo[tipo].clientes.add(novedad.pedido_id);
      resumenPorTipo[tipo].cantidad++;

      // ✅ FIX: PostgreSQL retorna boolean como 't'/'f' o true/false según el driver
      if (esVerdadero(novedad.validado)) {
        resumenPorTipo[tipo].validadas += monto;
        if (tipo === 'fiado_parcial') {
          resumenPorTipo[tipo].pagado += Number(novedad.monto_pagado || 0);
        }
      } else {
        resumenPorTipo[tipo].pendientes += monto;
      }

      resumenPorTipo[tipo].total = resumenPorTipo[tipo].validadas + resumenPorTipo[tipo].pendientes;
    }

    Object.keys(resumenPorTipo).forEach(tipo => {
      resumenPorTipo[tipo].clientes = resumenPorTipo[tipo].clientes.size;
    });

    // ✅ FIX: Filtrar pendientes comparando correctamente el boolean de PG
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
    });

  } catch (error: any) {
    console.error("[API novedades/resumen] ❌ Error:", error);
    return handleDBError(error, "NOVEDADES_RESUMEN");
  }
}
