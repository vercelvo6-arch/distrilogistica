import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

// POST - Registrar faltante
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[FALTANTES] Guardando:', body);

    const { 
      planilla_id,
      codigo,
      descripcion,
      categoria,
      entregador,
      ruta,
      cantidadSolicitada,
      cantidadDisponible, 
      cantidadFaltante,
      unidadIncompleta,
      observaciones,
      marcadoPor
    } = body;

    const sql = getDB();

    // SIMPLE: Solo guardar el faltante
    const result = await sql`
      INSERT INTO faltantes (
        planilla_id,
        entregador,
        ruta,
        codigo,
        descripcion,
        categoria,
        cantidad_solicitada,
        cantidad_disponible,
        cantidad_faltante,
        unidad_incompleta,
        observaciones,
        marcado_por,
        estado,
        fecha_marcado
      ) VALUES (
        ${planilla_id},
        ${entregador},
        ${ruta},
        ${codigo},
        ${descripcion},
        ${categoria || ''},
        ${cantidadSolicitada},
        ${cantidadDisponible},
        ${cantidadFaltante},
        ${unidadIncompleta || false},
        ${observaciones || ''},
        ${marcadoPor},
        'pendiente',
        NOW()
      )
      RETURNING *
    `;

    console.log('[FALTANTES] ✓ Guardado ID:', result[0].id);

    return NextResponse.json({ 
      success: true,
      faltante: result[0]
    });

  } catch (error) {
    console.error('[FALTANTES] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 }
    );
  }
}

// GET - Ver faltantes
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const planilla_id = searchParams.get('planilla_id');
    const entregador = searchParams.get('entregador');

    const sql = getDB();

    let faltantes;

    if (planilla_id) {
      faltantes = await sql`
        SELECT 
          f.*,
          u.nombre as marcado_por_nombre
        FROM faltantes f
        LEFT JOIN usuarios u ON f.marcado_por = u.id
        WHERE f.planilla_id = ${planilla_id}
        ORDER BY f.fecha_marcado DESC
      `;
    } else if (entregador) {
      faltantes = await sql`
        SELECT 
          f.*,
          u.nombre as marcado_por_nombre,
          pl.fecha as planilla_fecha
        FROM faltantes f
        LEFT JOIN usuarios u ON f.marcado_por = u.id
        LEFT JOIN planillas pl ON f.planilla_id = pl.id
        WHERE f.entregador = ${entregador}
        ORDER BY f.fecha_marcado DESC
        LIMIT 100
      `;
    } else {
      faltantes = await sql`
        SELECT 
          f.*,
          u.nombre as marcado_por_nombre,
          pl.fecha as planilla_fecha
        FROM faltantes f
        LEFT JOIN usuarios u ON f.marcado_por = u.id
        LEFT JOIN planillas pl ON f.planilla_id = pl.id
        ORDER BY f.fecha_marcado DESC
        LIMIT 100
      `;
    }

    return NextResponse.json({ 
      success: true,
      faltantes
    });

  } catch (error) {
    console.error('[FALTANTES] ERROR:', error);
    return NextResponse.json(
      { error: 'Error al obtener faltantes' },
      { status: 500 }
    );
  }
}
