import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await params;
    const planillaId = id;

    if (!planillaId) {
      return NextResponse.json({ error: 'ID de planilla requerido' }, { status: 400 });
    }

    const body = await request.json();
    const {
      total_agotados,
      total_devolucion,
      total_descuento,
      total_fiado,
    } = body;

    const sql = getDB();

    // Verificar que existe y no está cuadrada
    const [planilla] = await sql`
      SELECT id, cuadrado_en_caja FROM planillas WHERE id = ${planillaId}
    `;

    if (!planilla) {
      return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 });
    }

    if (planilla.cuadrado_en_caja) {
      return NextResponse.json({ error: 'La planilla ya fue cuadrada — no se puede modificar' }, { status: 409 });
    }

    // Actualizar solo los campos enviados
    const updates: Record<string, number> = {};
    if (total_agotados   !== undefined) updates.total_agotados   = Number(total_agotados)   || 0;
    if (total_devolucion !== undefined) updates.total_devolucion = Number(total_devolucion) || 0;
    if (total_descuento  !== undefined) updates.total_descuento  = Number(total_descuento)  || 0;
    if (total_fiado      !== undefined) updates.total_fiado      = Number(total_fiado)      || 0;

    // Actualizar todos los campos de novedades enviados
    await sql`
      UPDATE planillas SET
        total_agotados   = ${Number(total_agotados)   || 0},
        total_devolucion = ${Number(total_devolucion) || 0},
        total_descuento  = ${Number(total_descuento)  || 0},
        total_fiado      = ${Number(total_fiado)      || 0},
        updated_at       = NOW()
      WHERE id = ${planillaId}
    `;

    console.log(`[PATCH /api/planillas/${planillaId}/novedades] Actualizado:`, updates);

    return NextResponse.json({
      success: true,
      planillaId,
      updates,
    });

  } catch (error) {
    console.error('[PATCH planillas novedades] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar novedades' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await params;
    const planillaId = id;

    if (!planillaId) {
      return NextResponse.json({ error: 'ID de planilla requerido' }, { status: 400 });
    }

    console.log(`[API DELETE] Intentando eliminar planilla: ${planillaId}`);

    const sql = getDB();

    const planilla = await sql`
      SELECT id FROM planillas WHERE id = ${planillaId}
    `;

    if (planilla.length === 0) {
      return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 });
    }

    const deletedProducts = await sql`
      DELETE FROM pedido_productos
      WHERE pedido_id IN (
        SELECT id FROM pedidos WHERE planilla_id = ${planillaId}
      )
    `;

    const deletedOrders = await sql`
      DELETE FROM pedidos WHERE planilla_id = ${planillaId}
    `;

    const deletedSheet = await sql`
      DELETE FROM planillas WHERE id = ${planillaId}
    `;

    console.log(`[API DELETE] Planilla ${planillaId} eliminada`);

    return NextResponse.json({
      success: true,
      message: 'Planilla eliminada correctamente',
      deleted: {
        products: deletedProducts.count,
        orders: deletedOrders.count,
        sheet: deletedSheet.count
      }
    });

  } catch (error) {
    console.error('[API DELETE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar planilla' },
      { status: 500 }
    );
  }
}
