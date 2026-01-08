import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

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

    // Usar la MISMA sintaxis que funciona
    let faltantes;

    if (entregador && entregador !== 'all' && estado && estado !== 'all') {
      faltantes = await sql`
        SELECT 
          f.*,
          u.nombre as marcado_por_nombre,
          pl.fecha as planilla_fecha
        FROM faltantes f
        LEFT JOIN usuarios u ON f.marcado_por = u.id
        LEFT JOIN planillas pl ON f.planilla_id = pl.id
        WHERE f.entregador = ${entregador}
        AND f.estado = ${estado}
        ORDER BY f.fecha_marcado DESC
      `;
    } else if (entregador && entregador !== 'all') {
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
      `;
    } else if (estado && estado !== 'all') {
      faltantes = await sql`
        SELECT 
          f.*,
          u.nombre as marcado_por_nombre,
          pl.fecha as planilla_fecha
        FROM faltantes f
        LEFT JOIN usuarios u ON f.marcado_por = u.id
        LEFT JOIN planillas pl ON f.planilla_id = pl.id
        WHERE f.estado = ${estado}
        ORDER BY f.fecha_marcado DESC
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

    if (!faltantes || faltantes.length === 0) {
      return NextResponse.json({ 
        error: 'No hay datos para exportar' 
      }, { status: 404 });
    }

    // Headers
    const headers = [
      'Fecha',
      'Entregador',
      'Ruta',
      'Código',
      'Producto',
      'Categoría',
      'Solicitado',
      'Disponible',
      'Faltante',
      'Unidad Incompleta',
      'Observaciones',
      'Estado',
      'Marcado Por'
    ];

    // Filas
    const csvRows = [headers.join(',')];

    for (const f of faltantes) {
      const row = [
        f.fecha_marcado ? new Date(f.fecha_marcado).toLocaleString('es-CO') : '',
        f.entregador || '',
        f.ruta || '',
        f.codigo || '',
        f.descripcion || '',
        f.categoria || '',
        f.cantidad_solicitada || 0,
        f.cantidad_disponible || 0,
        f.cantidad_faltante || 0,
        f.unidad_incompleta ? 'Sí' : 'No',
        (f.observaciones || '').replace(/"/g, '""').replace(/\n/g, ' '),
        f.estado === 'pendiente' ? 'PENDIENTE' : 'RESUELTO',
        f.marcado_por_nombre || ''
      ];
      
      csvRows.push(row.map(cell => `"${String(cell)}"`).join(','));
    }

    const csvContent = '\uFEFF' + csvRows.join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="faltantes_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('[EXPORT] ERROR:', error);
    return NextResponse.json(
      { error: 'Error al exportar' },
      { status: 500 }
    );
  }
}
