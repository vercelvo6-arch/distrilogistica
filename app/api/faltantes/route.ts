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
    console.log('[FALTANTES] Request:', body);

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

    // Validaciones
    if (!codigo || !entregador || cantidadDisponible === undefined) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    if (unidadIncompleta && !observaciones?.trim()) {
      return NextResponse.json({ 
        error: 'Las unidades incompletas requieren observaciones' 
      }, { status: 400 });
    }

    const sql = getDB();

    // Insertar faltante directamente con los datos recibidos
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
        estado
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
        ${observaciones || null},
        ${marcadoPor},
        'pendiente'
      )
      RETURNING id
    `;

    console.log('[FALTANTES] ✓ Registrado:', result[0].id);

    return NextResponse.json({ 
      success: true,
      message: unidadIncompleta 
        ? 'Registrado como incompleto'
        : cantidadFaltante > 0 
          ? `Faltante: ${cantidadFaltante} unidades` 
          : 'Cantidad completa registrada',
      id: result[0].id
    });

  } catch (error) {
    console.error('[FALTANTES] Error completo:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar' },
      { status: 500 }
    );
  }
}

// GET - Listar faltantes con filtros avanzados
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entregador = searchParams.get('entregador');
    const estado = searchParams.get('estado');
    const fecha_inicio = searchParams.get('fecha_inicio');
    const fecha_fin = searchParams.get('fecha_fin');
    const codigo = searchParams.get('codigo');

    const sql = getDB();

    // Construir query dinámica con filtros
    let conditions = [];
    
    if (entregador && entregador !== 'all') {
      conditions.push(`f.entregador = '${entregador}'`);
    }

    if (estado && estado !== 'all') {
      conditions.push(`f.estado = '${estado}'`);
    }

    if (codigo) {
      conditions.push(`f.codigo ILIKE '%${codigo}%'`);
    }

    if (fecha_inicio) {
      conditions.push(`DATE(f.fecha_marcado) >= '${fecha_inicio}'`);
    }

    if (fecha_fin) {
      conditions.push(`DATE(f.fecha_marcado) <= '${fecha_fin}'`);
    }

    const whereClause = conditions.length > 0 
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // Query con joins para nombres de usuarios
    const faltantes = await sql.unsafe(`
      SELECT 
        f.*,
        u_marcado.nombre as marcado_por_nombre,
        u_resuelto.nombre as resuelto_por_nombre,
        pl.fecha as planilla_fecha
      FROM faltantes f
      LEFT JOIN usuarios u_marcado ON f.marcado_por = u_marcado.id
      LEFT JOIN usuarios u_resuelto ON f.resuelto_por = u_resuelto.id
      LEFT JOIN planillas pl ON f.planilla_id = pl.id
      ${whereClause}
      ORDER BY 
        CASE WHEN f.estado = 'pendiente' THEN 0 ELSE 1 END,
        f.fecha_marcado DESC
      LIMIT 500
    `);

    return NextResponse.json({ 
      success: true,
      faltantes,
      total: faltantes.length
    });

  } catch (error) {
    console.error('[FALTANTES] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener faltantes' },
      { status: 500 }
    );
  }
}
