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

    const sql = getDB();

    // Eliminar en cascada: primero productos, luego pedidos, luego planilla
    await sql`
      DELETE FROM pedido_productos 
      WHERE pedido_id IN (
        SELECT id FROM pedidos WHERE planilla_id = ${planillaId}
      )
    `;

    await sql`
      DELETE FROM pedidos WHERE planilla_id = ${planillaId}
    `;

    await sql`
      DELETE FROM planillas WHERE id = ${planillaId}
    `;

    console.log(`[API DELETE] ✓ Planilla ${planillaId} eliminada`);

    return NextResponse.json({ 
      success: true, 
      message: 'Planilla eliminada correctamente' 
    });

  } catch (error) {
    console.error('[API DELETE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al eliminar planilla' },
      { status: 500 }
    );
  }
}
