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

    // Construir filtros
    let query = `
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
      WHERE 1=1
    `;

    if (entregador && entregador !== 'all') {
      query += ` AND f.entregador = '${entregador}'`;
    }
    if (estado && estado !== 'all') {
      query += ` AND f.estado = '${estado}'`;
    }
    if (fecha_inicio) {
      query += ` AND DATE(f.fecha_marcado) >= '${fecha_inicio}'`;
    }
    if (fecha_fin) {
      query += ` AND DATE(f.fecha_marcado) <= '${fecha_fin}'`;
    }

    query += ` ORDER BY f.fecha_marcado DESC`;

    console.log('[EXPORT] Ejecutando query...');
    
    const result = await sql.unsafe(query);
    
    // Asegurar que result es un array
    const faltantes = Array.isArray(result) ? result : [];

    console.log('[EXPORT] Registros encontrados:', faltantes.length);

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

    const rows = faltantes.map((f: any) => [
      f.fecha || '',
      f.entregador || '',
      f.ruta || '',
      f.codigo || '',
      f.descripcion || '',
      f.categoria || '',
      f.cantidad_solicitada || 0,
      f.cantidad_disponible || 0,
      f.cantidad_faltante || 0,
      f.estado_unidad || '',
      f.observaciones || '',
      f.estado === 'pendiente' ? 'PENDIENTE' : 'RESUELTO',
      f.marcado_por || '',
      f.fecha_resolucion || '',
      f.resuelto_por || '',
      f.observaciones_resolucion || ''
    ]);

    // Construir CSV
    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => 
        row.map(cell => {
          const cellStr = String(cell).replace(/"/g, '""');
          return `"${cellStr}"`;
        }).join(',')
      )
    ].join('\n');

    // BOM para Excel UTF-8
    const bom = '\uFEFF';
    const csvWithBom = bom + csvContent;

    const fecha = new Date().toISOString().split('T')[0];
    const filename = `faltantes_${fecha}.csv`;

    console.log('[EXPORT] CSV generado exitosamente');

    return new NextResponse(csvWithBom, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('[EXPORT] Error completo:', error);
    return NextResponse.json(
      { 
        error: 'Error al exportar datos',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}
