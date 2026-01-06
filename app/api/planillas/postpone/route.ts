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
    const { planillaId } = body;
    
    if (!planillaId) {
      return NextResponse.json({ error: 'ID de planilla requerido' }, { status: 400 });
    }

    const sql = getDB();

    // Actualizar estado a "pospuesto"
    await sql`
      UPDATE planillas 
      SET estado = 'pospuesto',
          updated_at = NOW()
      WHERE id = ${planillaId}
    `;

    console.log(`[API POSTPONE] ✓ Planilla ${planillaId} pospuesta`);

    return NextResponse.json({ 
      success: true, 
      message: 'Planilla pospuesta correctamente' 
    });

  } catch (error) {
    console.error('[API POSTPONE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al posponer planilla' },
      { status: 500 }
    );
  }
}
