import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[API FALTANTE] Request body:', body);

    const { 
      codigo, 
      entregador, 
      cantidadSolicitada,
      cantidadDisponible, 
      cantidadFaltante, 
      usuarioId 
    } = body;

    if (!codigo || !entregador || cantidadDisponible === undefined) {
      console.error('[API FALTANTE] Datos incompletos:', { codigo, entregador, cantidadDisponible });
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    const sql = getDB();

    // Obtener planillas del entregador que están en proceso de alistamiento
    const planillas = await sql`
      SELECT id FROM planillas 
      WHERE entregador = ${entregador} 
      AND estado IN ('pendiente', 'alistando')
    `;

    console.log('[API FALTANTE] Planillas encontradas:', planillas.length);

    if (planillas.length === 0) {
      return NextResponse.json({ error: 'No hay planillas activas para este entregador' }, { status: 404 });
    }

    const planillaIds = planillas.map(p => p.id);

    // Actualizar todos los productos con este código en las planillas del entregador
    const result = await sql`
      UPDATE pedido_productos
      SET 
        cantidad_disponible = ${cantidadDisponible},
        cantidad_faltante = ${cantidadFaltante},
        marcado_faltante_por = ${cantidadFaltante > 0 ? usuarioId : null},
        marcado_faltante_fecha = ${cantidadFaltante > 0 ? new Date().toISOString() : null}
      WHERE codigo = ${codigo}
      AND pedido_id IN (
        SELECT id FROM pedidos 
        WHERE planilla_id IN ${sql(planillaIds)}
      )
    `;

    console.log(`[API FALTANTE] ✓ Producto ${codigo}: ${cantidadDisponible}/${cantidadSolicitada} (faltante: ${cantidadFaltante})`);
    console.log(`[API FALTANTE] Registros actualizados: ${result.count}`);

    return NextResponse.json({ 
      success: true,
      message: cantidadFaltante > 0 
        ? `Registrado: ${cantidadDisponible} disponibles, ${cantidadFaltante} faltantes` 
        : 'Cantidad completa registrada',
      updated: result.count,
      data: {
        cantidadDisponible,
        cantidadFaltante
      }
    });

  } catch (error) {
    console.error('[API FALTANTE] Error completo:', error);
    console.error('[API FALTANTE] Stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar cantidad' },
      { status: 500 }
    );
  }
}
