import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const planillaId = params.id;
    
    if (!planillaId) {
      return NextResponse.json({ error: 'ID de planilla requerido' }, { status: 400 });
    }

    console.log(`[API DELETE] Intentando eliminar planilla: ${planillaId}`);

    const sql = getDB();

    // Verificar que la planilla existe
    const planilla = await sql`
      SELECT id FROM planillas WHERE id = ${planillaId}
    `;

    if (planilla.length === 0) {
      return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 });
    }

    // Eliminar en cascada: primero productos, luego pedidos, luego planilla
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

    console.log(`[API DELETE] ✓ Planilla ${planillaId} eliminada`);
    console.log(`[API DELETE] - Productos eliminados: ${deletedProducts.count}`);
    console.log(`[API DELETE] - Pedidos eliminados: ${deletedOrders.count}`);

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
