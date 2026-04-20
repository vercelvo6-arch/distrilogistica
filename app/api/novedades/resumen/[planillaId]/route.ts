import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

// =====================================================
// GET: Obtener resumen de novedades de una planilla
// Para mostrar en los cards de Caja
// =====================================================
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
    console.log("[API novedades/resumen] Obteniendo resumen de planilla:", planillaId);

    const sql = getDB();

    // Obtener todas las novedades de la planilla agrupadas por tipo
    const resumen = await sql`
      SELECT 
        n.tipo_novedad,
        n.validado,
        COUNT(DISTINCT n.id) as cantidad_novedades,
        COUNT(DISTINCT n.pedido_id) as clientes_afectados,
        SUM(n.monto_novedad) as total_monto,
        SUM(CASE WHEN n.tipo_novedad = 'fiado_parcial' THEN n.monto_pagado ELSE 0 END) as total_pagado_fiados
      FROM novedades_pedido n
      JOIN pedidos p ON n.pedido_id = p.id
      WHERE p.planilla_id = ${planillaId}
      GROUP BY n.tipo_novedad, n.validado
      ORDER BY n.tipo_novedad
    `;

    // Agrupar por tipo y separar validadas/pendientes
    const resumenPorTipo: Record<string, any> = {
      agotado: { total: 0, validadas: 0, pendientes: 0, clientes: 0, cantidad: 0 },
      devolucion: { total: 0, validadas: 0, pendientes: 0, clientes: 0, cantidad: 0 },
      fiado_parcial: { total: 0, validadas: 0, pendientes: 0, clientes: 0, cantidad: 0, pagado: 0 },
      error_facturacion: { total: 0, validadas: 0, pendientes: 0, clientes: 0, cantidad: 0 },
    };

    for (const row of resumen) {
      const tipo = row.tipo_novedad;
      if (!resumenPorTipo[tipo]) continue;

      if (row.validado) {
        resumenPorTipo[tipo].validadas = Number(row.total_monto || 0);
        resumenPorTipo[tipo].clientes = Number(row.clientes_afectados || 0);
        resumenPorTipo[tipo].cantidad = Number(row.cantidad_novedades || 0);
        
        if (tipo === 'fiado_parcial') {
          resumenPorTipo[tipo].pagado = Number(row.total_pagado_fiados || 0);
        }
      } else {
        resumenPorTipo[tipo].pendientes = Number(row.total_monto || 0);
      }

      resumenPorTipo[tipo].total = 
        resumenPorTipo[tipo].validadas + resumenPorTipo[tipo].pendientes;
    }

    // Calcular totales generales
    const totalNovedades = Object.values(resumenPorTipo).reduce(
      (sum: number, tipo: any) => sum + tipo.total, 
      0
    );

    const totalPendientes = Object.values(resumenPorTipo).reduce(
      (sum: number, tipo: any) => sum + tipo.pendientes, 
      0
    );

    // Obtener listado detallado de novedades pendientes
    const novedadesPendientes = await sql`
      SELECT 
        n.*,
        p.cliente,
        p.total as total_pedido
      FROM novedades_pedido n
      JOIN pedidos p ON n.pedido_id = p.id
      WHERE p.planilla_id = ${planillaId}
        AND n.validado = false
      ORDER BY n.created_at DESC
    `;

    console.log("[API novedades/resumen] ✅ Resumen calculado:", {
      totalNovedades,
      totalPendientes,
      agotados: resumenPorTipo.agotado.total,
      devoluciones: resumenPorTipo.devolucion.total,
      fiados: resumenPorTipo.fiado_parcial.total,
      errores: resumenPorTipo.error_facturacion.total,
    });

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
