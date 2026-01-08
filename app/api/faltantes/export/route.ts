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

    // COPIAR LA MISMA LÓGICA QUE FUNCIONA EN GET /api/faltantes
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

    console.log('[EXPORT] WHERE:', whereClause);

    // Usar EXACTAMENTE la misma forma que en /api/faltantes
    const faltantes = await sql.unsafe(`
      SELECT 
        f.*,
        u_marcado.nombre as marcado_por_nombre,
        u_resuelto.nombre as resuelto_por_nombre
      FROM faltantes f
      LEFT JOIN usuarios u_marcado ON f.marcado_por = u_marcado.id
      LEFT JOIN usuarios u_resuelto ON f.resuelto_por = u_resuelto.id
      ${whereClause}
      ORDER BY f.fecha_marcado DESC
    `);

    console.log('[EXPORT] Tipo de dato:', typeof faltantes);
    console.log('[EXPORT] Es array?:', Array.isArray(faltantes));
    console.log('[EXPORT] Length:', faltantes?.length);
    console.log('[EXPORT] Primer registro:', faltantes?.[0]);

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
      'Estado'
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
      (f.observaciones || '').replace(/"/g, '""').replace(/\n/g, ' '),
      f.estado === 'pendiente' ? 'PENDIENTE' : 'RESUELTO'
    ]);

    // CSV
    const csvLines = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell)}"`).join(','))
    ];

    const csvContent = '\uFEFF' + csvLines.join('\n');

    console.log('[EXPORT] ✓ CSV generado con', rows.length, 'filas');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="faltantes_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('[EXPORT] ERROR completo:', error);
    console.error('[EXPORT] Stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: 'Error al exportar', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
