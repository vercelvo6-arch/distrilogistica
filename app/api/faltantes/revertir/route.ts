import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';
import { comentarioVigente } from '@/lib/sumar-notas';

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
    // La justificación ya no se pide (el coordinador no la necesita); si llega, se guarda sin mostrarse.
    const { faltanteId, justificacion } = body;

    if (!faltanteId) {
      return NextResponse.json({ error: 'ID de faltante requerido' }, { status: 400 });
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

    // Revertir solo devuelve el ESTADO. El comentario que se ve en Supervisión es el último que se
    // escribió: si el coordinador escribió uno al subsanar ("faltan 3 displeys"), ese reemplaza al del
    // alistador ("FALTAN 10 DISPLEYS") en vez de volver a aparecer el viejo junto al nuevo. Si no
    // escribió nada (texto automático), queda el del alistador.
    const ultimoComentario = comentarioVigente({
      observaciones: faltante.observaciones,
      observaciones_resolucion: `${faltante.observaciones_resolucion || ''} [REVERTIDO por ${session.user.nombre || session.user.id}]`,
    });

    // Marca interna de que se revirtió (no se muestra en ninguna pantalla mientras está pendiente).
    const motivo = String(justificacion || '').trim();
    const observacionesConHistorial = `${faltante.observaciones_resolucion || ''} [REVERTIDO por ${session.user.nombre || session.user.id}${motivo ? `: ${motivo}` : ''}]`.trim();

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
        observaciones = ${ultimoComentario},
        -- Si el comentario vigente es el del coordinador, conserva la hora en que lo escribió.
        fecha_subsanacion = CASE WHEN ${ultimoComentario} IS DISTINCT FROM observaciones
                                 THEN COALESCE(fecha_resolucion, fecha_subsanacion, NOW()) ELSE fecha_subsanacion END,
        observaciones_resolucion = ${observacionesConHistorial}
      WHERE id = ${faltanteId}
      RETURNING *
    `;

    // 2️⃣ Desbloquear el botón "Subsanar" en Supervisión: SOLO la bandera de estado.
    //    cantidad_disponible NO se toca — eso pertenece al inventario y queda fuera del alcance.
    //    Solo las líneas que tenían la novedad: las que el alistador dejó completas siguen completas
    //    (cada línea guarda su propio estado, ver lib/alistamiento-reparto.ts).
    await sql`
      UPDATE pedido_productos pp
      SET estado_alistamiento = 'incompleto'
      FROM pedidos p
      WHERE pp.pedido_id = p.id
        AND COALESCE(p.planilla_mercancia_id, p.planilla_id) = ${faltante.planilla_id}
        AND pp.codigo = ${faltante.codigo}
        AND (COALESCE(pp.cantidad_faltante, 0) > 0
             OR COALESCE(pp.unidad_incompleta, false) = true
             OR pp.estado_alistamiento <> 'completo')
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
