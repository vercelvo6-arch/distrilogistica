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
      codigo, 
      entregador, 
      cantidadSolicitada,
      cantidadDisponible, 
      cantidadFaltante,
      unidadIncompleta,
      observaciones,
      usuarioId 
    } = body;

    if (!codigo || !entregador || cantidadDisponible === undefined) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
    }

    if (unidadIncompleta && !observaciones?.trim()) {
      return NextResponse.json({ 
        error: 'Las unidades incompletas requieren observaciones' 
      }, { status: 400 });
    }

    const sql = getDB();

    // Obtener info de la planilla y producto
    const planillas = await sql`
      SELECT 
        pl.id as planilla_id,
        pl.tipo_ruta as ruta,
        pl.entregador,
        pp.nombre as descripcion,
        pp.categoria
      FROM planillas pl
      JOIN pedidos p ON p.planilla_id = pl.id
      JOIN pedido_productos pp ON pp.pedido_id = p.id
      WHERE pl.entregador = ${entregador}
      AND pl.estado IN ('pendiente', 'alistando')
      AND pp.codigo = ${codigo}
      LIMIT 1
    `;

    if (planillas.length === 0) {
      return NextResponse.json({ 
        error: 'No se encontró información de la planilla o producto' 
      }, { status: 404 });
    }

    const info = planillas[0];

    // Insertar faltante
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
        marcado_por
      ) VALUES (
        ${info.planilla_id},
        ${entregador},
        ${info.ruta},
        ${codigo},
        ${info.descripcion},
        ${info.categoria || ''},
        ${cantidadSolicitada},
        ${cantidadDisponible},
        ${cantidadFaltante},
        ${unidadIncompleta || false},
        ${observaciones || null},
        ${usuarioId}
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
    console.error('[FALTANTES] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar' },
      { status: 500 }
    );
  }
}

// GET - Listar faltantes
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const entregador = searchParams.get('entregador');
    const fecha = searchParams.get('fecha');

    const sql = getDB();

    let query;
    if (entregador) {
      query = sql`
        SELECT * FROM faltantes 
        WHERE entregador = ${entregador}
        ORDER BY fecha_marcado DESC
      `;
    } else if (fecha) {
      query = sql`
        SELECT * FROM faltantes 
        WHERE DATE(fecha_marcado) = ${fecha}
        ORDER BY entregador, ruta, codigo
      `;
    } else {
      query = sql`
        SELECT * FROM faltantes 
        ORDER BY fecha_marcado DESC
        LIMIT 100
      `;
    }

    const faltantes = await query;

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
