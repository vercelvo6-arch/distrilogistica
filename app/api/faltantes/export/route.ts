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

    // EXACTAMENTE igual que en /api/faltantes route.ts que SÍ FUNCIONA
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

    // Convertir explícitamente a array
    const data = Array.from(faltantes);

    if (data.length === 0) {
      return NextResponse.json({ 
        error: 'No hay datos para exportar' 
      }, { status: 404 });
    }

    // Headers CSV
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

    // Crear filas CSV
    const csvRows = [];
    csvRows.push(headers.join(','));

    for (const f of data) {
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
