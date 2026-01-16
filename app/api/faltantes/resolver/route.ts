import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

// PATCH - Marcar faltante como resuelto
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    
    // ✅ Validar que sea administrador O coordinador
    if (session.user.rol !== 'administrador' && session.user.rol !== 'coordinador') {
      return NextResponse.json({ 
        error: 'Solo administradores y coordinadores pueden resolver faltantes' 
      }, { status: 403 });
    }
    
    const body = await request.json();
    const { faltanteId, observaciones_resolucion } = body;
    
    if (!faltanteId) {
      return NextResponse.json({ error: 'ID de faltante requerido' }, { status: 400 });
    }
    
    if (!observaciones_resolucion?.trim()) {
      return NextResponse.json({ 
        error: 'Debe proporcionar observaciones de resolución' 
      }, { status: 400 });
    }
    
    const sql = getDB();
    
    // Verificar que el faltante existe y está pendiente
    const faltante = await sql`
      SELECT id, estado FROM faltantes WHERE id = ${faltanteId}
    `;
    
    if (faltante.length === 0) {
      return NextResponse.json({ error: 'Faltante no encontrado' }, { status: 404 });
    }
    
    if (faltante[0].estado === 'resuelto') {
      return NextResponse.json({ 
        error: 'Este faltante ya fue resuelto' 
      }, { status: 400 });
    }
    
    // Actualizar faltante
    await sql`
      UPDATE faltantes
      SET 
        estado = 'resuelto',
        resuelto_por = ${session.user.id},
        fecha_resolucion = NOW(),
        observaciones_resolucion = ${observaciones_resolucion.trim()}
      WHERE id = ${faltanteId}
    `;
    
    console.log('[FALTANTES] ✓ Resuelto:', faltanteId, 'por', session.user.nombre);
    
    return NextResponse.json({ 
      success: true,
      message: 'Faltante marcado como resuelto'
    });
    
  } catch (error) {
    console.error('[FALTANTES] Error al resolver:', error);
    return NextResponse.json(
      { error: 'Error al resolver faltante' },
      { status: 500 }
    );
  }
}

// POST - Resolver múltiples faltantes
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    
    // ✅ Validar que sea administrador O coordinador
    if (!session?.user || (session.user.rol !== 'administrador' && session.user.rol !== 'coordinador')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }
    
    const body = await request.json();
    const { faltanteIds, observaciones_resolucion } = body;
    
    if (!faltanteIds || !Array.isArray(faltanteIds) || faltanteIds.length === 0) {
      return NextResponse.json({ error: 'IDs inválidos' }, { status: 400 });
    }
    
    if (!observaciones_resolucion?.trim()) {
      return NextResponse.json({ 
        error: 'Observaciones requeridas' 
      }, { status: 400 });
    }
    
    const sql = getDB();
    
    // Resolver todos los faltantes
    const result = await sql`
      UPDATE faltantes
      SET 
        estado = 'resuelto',
        resuelto_por = ${session.user.id},
        fecha_resolucion = NOW(),
        observaciones_resolucion = ${observaciones_resolucion.trim()}
      WHERE id = ANY(${faltanteIds}::text[])
      AND estado = 'pendiente'
      RETURNING id
    `;
    
    console.log('[FALTANTES] ✓ Resueltos en lote:', result.length);
    
    return NextResponse.json({ 
      success: true,
      message: `${result.length} faltante(s) resuelto(s)`,
      resueltos: result.length
    });
    
  } catch (error) {
    console.error('[FALTANTES] Error en resolución en lote:', error);
    return NextResponse.json(
      { error: 'Error al resolver faltantes' },
      { status: 500 }
    );
  }
}
