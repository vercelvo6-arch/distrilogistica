import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

// PATCH - Revertir un faltante ya resuelto/definitivo, para corregir un error de subsanación
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ✅ Solo el coordinador puede revertir una subsanación
    if (session.user.rol !== 'coordinador') {
      return NextResponse.json({
        error: 'Solo el coordinador puede revertir una subsanación'
      }, { status: 403 });
    }

    const body = await request.json();
    const { faltanteId, justificacion } = body;

    if (!faltanteId) {
      return NextResponse.json({ error: 'ID de faltante requerido' }, { status: 400 });
    }

    if (!justificacion?.trim()) {
      return NextResponse.json({
        error: 'Debe indicar una justificación para revertir'
      }, { status: 400 });
    }

    const sql = getDB();

    const faltanteActual = await sql`
      SELECT * FROM faltantes WHERE id = ${faltanteId}
    `;

    if (faltanteActual.length === 0) {
      return NextResponse.json({ error: 'Faltante no encontrado' }, { status: 404 });
    }

    const faltante = faltanteActual[0];

    if (faltante.estado === 'pendiente') {
      return NextResponse.json({
        error: 'Este faltante está pendiente, no hay nada que revertir'
      }, { status: 400 });
    }

    // Conservar el historial de la resolución anterior dentro de las observaciones
    const observacionesConHistorial = `${faltante.observaciones_resolucion || ''} [REVERTIDO por ${session.user.nombre || session.user.id}: ${justificacion.trim()}]`.trim();

    // 1️⃣ Revertir el faltante: vuelve a "pendiente" con sus cantidades originales
    //    cantidad_faltante NO se toca aquí — para resoluciones "completo"/"definitivo"
    //    ese campo nunca se modificó en el PATCH original, así que ya conserva el valor correcto.
    const resultado = await sql`
      UPDATE faltantes
      SET
        estado = 'pendiente',
        tipo_resolucion = NULL,
        cantidad_resuelta = 0,
        resuelto_por = NULL,
        fecha_resolucion = NULL,
        observaciones_resolucion = ${observacionesConHistorial}
      WHERE id = ${faltanteId}
      RETURNING *
    `;

    // 2️⃣ Desbloquear el botón "Subsanar" en Supervisión: SOLO la bandera de estado.
    //    cantidad_disponible NO se toca — eso pertenece al inventario y queda fuera del alcance.
    await sql`
      UPDATE pedido_productos pp
      SET estado_alistamiento = 'incompleto'
      FROM pedidos p
      WHERE pp.pedido_id = p.id
        AND p.planilla_id = ${faltante.planilla_id}
        AND pp.codigo = ${faltante.codigo}
    `;

    console.log(`[FALTANTES REVERTIR] ✓ Faltante ${faltanteId} revertido por ${session.user.nombre || session.user.id}: ${justificacion}`);

    return NextResponse.json({
      success: true,
      faltante: resultado[0],
      mensaje: 'Faltante revertido a pendiente. Ya puede corregirlo.'
    });

  } catch (error) {
    console.error('[FALTANTES REVERTIR] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al revertir faltante' },
      { status: 500 }
    );
  }
}
