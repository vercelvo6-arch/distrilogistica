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
    console.log("[API novedades/resumen] ===== INICIO =====");
    console.log("[API novedades/resumen] Planilla ID:", planillaId);

    const sql = getDB();

    // PASO 1: Obtener TODAS las novedades de la planilla
    const todasLasNovedades = await sql`
      SELECT 
        n.*,
        p.cliente
      FROM novedades_pedido n
      JOIN pedidos p ON n.pedido_id = p.id
      WHERE p.planilla_id = ${planillaId}
      ORDER BY n.created_at DESC
    `;

    console.log("[API novedades/resumen] Total novedades encontradas:", todasLasNovedades.length);
    console.log("[API novedades/resumen] Novedades:", JSON.stringify(todasLasNovedades, null, 2));

    // PASO 2: Agrupar manualmente por tipo y estado
    const resumenPorTipo: Record<string, any> = {
      agotado: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
      devolucion: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
      fiado_parcial: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0, pagado: 0 },
      error_facturacion: { total: 0, validadas: 0, pendientes: 0, clientes: new Set(), cantidad: 0 },
    };

    // Procesar cada novedad
    for (const novedad of todasLasNovedades) {
      const tipo = novedad.tipo_novedad;
      if (!resumenPorTipo[tipo]) continue;

      const monto = Number(novedad.monto_novedad || 0);
      
      // Contar clientes únicos
      resumenPorTipo[tipo].clientes.add(novedad.pedido_id);
      
      // Contar cantidad de novedades
      resumenPorTipo[tipo].cantidad++;

      if (novedad.validado) {
        resumenPorTipo[tipo].validadas += monto;
        
        if (tipo === 'fiado_parcial') {
          resumenPorTipo[tipo].pagado += Number(novedad.monto_pagado || 0);
        }
      } else {
        resumenPorTipo[tipo].pendientes += monto;
      }

      resumenPorTipo[tipo].total = resumenPorTipo[tipo].validadas + resumenPorTipo[tipo].pendientes;
    }

    // Convertir Sets a números
    Object.keys(resumenPorTipo).forEach(tipo => {
      resumenPorTipo[tipo].clientes = resumenPorTipo[tipo].clientes.size;
    });

    console.log("[API novedades/resumen] Resumen calculado:", JSON.stringify(resumenPorTipo, null, 2));

    // PASO 3: Obtener novedades pendientes
    const novedadesPendientes = todasLasNovedades.filter(n => !n.validado);

    console.log("[API novedades/resumen] Novedades pendientes:", novedadesPendientes.length);

    // Calcular totales generales
    const totalNovedades = Object.values(resumenPorTipo).reduce(
      (sum: number, tipo: any) => sum + tipo.total, 
      0
    );

    const totalPendientes = Object.values(resumenPorTipo).reduce(
      (sum: number, tipo: any) => sum + tipo.pendientes, 
      0
    );

    console.log("[API novedades/resumen] ✅ Totales:", {
      totalNovedades,
      totalPendientes,
      agotados: resumenPorTipo.agotado.total,
      devoluciones: resumenPorTipo.devolucion.total,
      fiados: resumenPorTipo.fiado_parcial.total,
      errores: resumenPorTipo.error_facturacion.total,
    });
    console.log("[API novedades/resumen] ===== FIN =====");

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
