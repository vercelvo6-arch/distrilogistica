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

    console.log('[EXPORT] Filtros:', { entregador, estado, fecha_inicio, fecha_fin });

    const sql = getDB();

    // Construir WHERE clause manualmente
    let whereConditions = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (entregador && entregador !== 'all') {
      whereConditions.push(`f.entregador = $${paramIndex}`);
      params.push(entregador);
      paramIndex++;
    }

    if (estado && estado !== 'all') {
      whereConditions.push(`f.estado = $${paramIndex}`);
      params.push(estado);
      paramIndex++;
    }

    if (fecha_inicio) {
      whereConditions.push(`f.fecha_marcado::date >= $${paramIndex}::date`);
      params.push(fecha_inicio);
      paramIndex++;
    }

    if (fecha_fin) {
      whereConditions.push(`f.fecha_marcado::date <= $${paramIndex}::date`);
      params.push(fecha_fin);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    console.log('[EXPORT] WHERE:', whereClause);
    console.log('[EXPORT] Params:', params);

    // Query usando unsafe con parámetros
    const query = `
      SELECT 
        f.fecha_marcado,
        f.entregador,
        f.ruta,
        f.codigo,
        f.descripcion,
        f.categoria,
        f.cantidad_solicitada,
        f.cantidad_disponible,
        f.cantidad_faltante,
        f.unidad_incompleta,
        f.observaciones,
        f.estado,
        u_marcado.nombre as marcado_por,
        f.fecha_resolucion,
        u_resuelto.nombre as resuelto_por,
        f.observaciones_resolucion
      FROM faltantes f
      LEFT JOIN usuarios u_marcado ON f.marcado_por = u_marcado.id
      LEFT JOIN usuarios u_resuelto ON f.resuelto_por = u_resuelto.id
      ${whereClause}
      ORDER BY f.fecha_marcado DESC
    `;

    const faltantes = await sql.unsafe(query, params);

    console.log('[EXPORT] Registros encontrados:', faltantes.length);

    if (!Array.isArray(faltantes) || faltantes.length === 0) {
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
      'Marcado Por',
      'Fecha Resolución',
      'Resuelto Por',
      'Obs. Resolución'
    ];

    // Filas
    const rows = faltantes.map((f: any) => [
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
      (f.observaciones || '').replace(/"/g, '""'),
      f.estado === 'pendiente' ? 'PENDIENTE' : 'RESUELTO',
      f.marcado_por || '',
      f.fecha_resolucion ? new Date(f.fecha_resolucion).toLocaleString('es-CO') : '',
      f.resuelto_por || '',
      (f.observaciones_resolucion || '').replace(/"/g, '""')
    ]);

    // CSV
    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell)}"`).join(','))
    ];

    const csvContent = '\uFEFF' + csvLines.join('\n');

    console.log('[EXPORT] ✓ CSV generado');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="faltantes_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('[EXPORT] ERROR:', error);
    return NextResponse.json(
      { error: 'Error al exportar', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
