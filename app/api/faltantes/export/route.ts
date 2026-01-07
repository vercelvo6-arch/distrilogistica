import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET - Exportar faltantes a CSV
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

    const sql = getDB();

    // Construir filtros
    let conditions = [];
    if (entregador && entregador !== 'all') {
      conditions.push(`f.entregador = '${entregador}'`);
    }
    if (estado && estado !== 'all') {
      conditions.push(`f.estado = '${estado}'`);
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

    // Obtener datos
    const faltantes = await sql.unsafe(`
      SELECT 
        TO_CHAR(f.fecha_marcado, 'YYYY-MM-DD HH24:MI') as fecha,
        f.entregador,
        f.ruta,
        f.codigo,
        f.descripcion,
        f.categoria,
        f.cantidad_solicitada,
        f.cantidad_disponible,
        f.cantidad_faltante,
        CASE 
          WHEN f.unidad_incompleta THEN 'Incompleta'
          ELSE 'Completa'
        END as estado_unidad,
        COALESCE(f.observaciones, '') as observaciones,
        f.estado,
        u_marcado.nombre as marcado_por,
        COALESCE(TO_CHAR(f.fecha_resolucion, 'YYYY-MM-DD HH24:MI'), '') as fecha_resolucion,
        COALESCE(u_resuelto.nombre, '') as resuelto_por,
        COALESCE(f.observaciones_resolucion, '') as observaciones_resolucion
      FROM faltantes f
      LEFT JOIN usuarios u_marcado ON f.marcado_por = u_marcado.id
      LEFT JOIN usuarios u_resuelto ON f.resuelto_por = u_resuelto.id
      ${whereClause}
      ORDER BY f.fecha_marcado DESC
    `);

    if (faltantes.length === 0) {
      return NextResponse.json({ 
        error: 'No hay datos para exportar con los filtros seleccionados' 
      }, { status: 404 });
    }

    // Crear CSV
    const headers = [
      'Fecha Registro',
      'Entregador',
      'Ruta',
      'Código',
      'Producto',
      'Categoría',
      'Cant. Solicitada',
      'Cant. Disponible',
      'Cant. Faltante',
      'Estado Unidad',
      'Observaciones',
      'Estado',
      'Registrado Por',
      'Fecha Resolución',
      'Resuelto Por',
      'Observaciones Resolución'
    ];

    const rows = faltantes.map(f => [
      f.fecha,
      f.entregador,
      f.ruta,
      f.codigo,
      f.descripcion,
      f.categoria,
      f.cantidad_solicitada,
      f.cantidad_disponible,
      f.cantidad_faltante,
      f.estado_unidad,
      f.observaciones,
      f.estado === 'pendiente' ? 'PENDIENTE' : 'RESUELTO',
      f.marcado_por,
      f.fecha_resolucion,
      f.resuelto_por,
      f.observaciones_resolucion
    ]);

    // Convertir a CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Nombre del archivo
    const fecha = new Date().toISOString().split('T')[0];
    const filename = `faltantes_${fecha}.csv`;

    // Retornar CSV
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('[FALTANTES] Error en export:', error);
    return NextResponse.json(
      { error: 'Error al exportar datos' },
      { status: 500 }
    );
  }
}
