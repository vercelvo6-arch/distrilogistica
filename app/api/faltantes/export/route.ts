import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';
import { agruparFaltantes } from '@/lib/agrupar-faltantes';
import { comentarioVigente } from '@/lib/sumar-notas';

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

    // Mismos filtros que la pantalla de Novedades (antes ignoraba fechas y código).
    const faltantes: any[] = await sql`
      SELECT f.*, u.nombre as marcado_por_nombre, u2.nombre as resuelto_por_nombre
      FROM faltantes f
      LEFT JOIN usuarios u ON f.marcado_por = u.id
      LEFT JOIN usuarios u2 ON f.resuelto_por = u2.id
      WHERE (${estado && estado !== 'all' ? sql`f.estado = ${estado}` : sql`1=1`})
        AND (${entregador && entregador !== 'all' ? sql`f.entregador = ${entregador}` : sql`1=1`})
        AND (${codigo ? sql`f.codigo ILIKE ${`%${codigo}%`}` : sql`1=1`})
        AND (${fecha_inicio ? sql`f.fecha_marcado >= ${fecha_inicio}::date` : estado === 'pendiente' ? sql`1=1` : sql`f.fecha_marcado >= CURRENT_DATE - INTERVAL '7 days'`})
        AND (${fecha_fin ? sql`f.fecha_marcado <= ${fecha_fin}::date + interval '1 day'` : sql`1=1`})
      ORDER BY f.fecha_marcado DESC
      LIMIT 3000
    ` as any[];

    if (!faltantes || faltantes.length === 0) {
      return NextResponse.json({ 
        error: 'No hay datos para exportar' 
      }, { status: 404 });
    }

    // Un registro sobre varias planillas sale en UNA fila (antes salía una por ruta, cada una con el
    // comentario del total, y parecía duplicado).
    const filas = agruparFaltantes(faltantes);
    const rutasPorFila = filas.map((g) =>
      Array.from(new Set(faltantes.filter((f) => g.ids.includes(f.id)).map((f) => f.ruta).filter(Boolean))).join(' + ')
    );

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

    filas.forEach((f, i) => {
      const row = [
        f.fecha_marcado ? new Date(f.fecha_marcado).toLocaleString('es-CO') : '',
        f.entregador || '',
        rutasPorFila[i] || '',
        f.codigo || '',
        f.descripcion || '',
        f.categoria || '',
        f.cantidad_solicitada || 0,
        f.cantidad_disponible || 0,
        f.cantidad_faltante || 0,
        f.unidad_incompleta ? 'Sí' : 'No',
        comentarioVigente(f).replace(/"/g, '""').replace(/\n/g, ' '),
        f.estado === 'pendiente' ? 'PENDIENTE' : f.estado === 'definitivo' ? 'NO SE ENTREGÓ' : 'RESUELTO',
        f.marcado_por_nombre || ''
      ];
      
      csvRows.push(row.map(cell => `"${String(cell)}"`).join(','));
    });

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
