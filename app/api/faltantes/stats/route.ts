import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET - Obtener estadísticas de faltantes
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const sql = getDB();

    // 1. Totales por estado
    const totales = await sql`
      SELECT 
        COUNT(*) FILTER (WHERE estado = 'pendiente') as total_pendientes,
        COUNT(*) FILTER (WHERE estado = 'resuelto') as total_resueltos,
        COUNT(*) FILTER (WHERE DATE(fecha_marcado) = CURRENT_DATE) as total_hoy,
        COUNT(*) as total_general
      FROM faltantes
    `;

    // 2. Por entregador
    const porEntregador = await sql`
      SELECT 
        entregador,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes,
        COUNT(*) FILTER (WHERE estado = 'resuelto') as resueltos,
        SUM(cantidad_faltante) as total_unidades_faltantes
      FROM faltantes
      GROUP BY entregador
      ORDER BY pendientes DESC, total DESC
    `;

    // 3. Productos más faltantes
    const productosMasFaltantes = await sql`
      SELECT 
        codigo,
        descripcion,
        categoria,
        COUNT(*) as total_veces,
        SUM(cantidad_faltante) as total_unidades,
        COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes
      FROM faltantes
      WHERE cantidad_faltante > 0
      GROUP BY codigo, descripcion, categoria
      ORDER BY total_veces DESC, total_unidades DESC
      LIMIT 10
    `;

    // 4. Tendencia últimos 7 días
    const tendencia = await sql`
      SELECT 
        DATE(fecha_marcado) as fecha,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE estado = 'resuelto') as resueltos,
        SUM(cantidad_faltante) as unidades_faltantes
      FROM faltantes
      WHERE fecha_marcado >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(fecha_marcado)
      ORDER BY fecha DESC
    `;

    // 5. Faltantes urgentes (pendientes de hoy)
    const urgentes = await sql`
      SELECT 
        f.*,
        u.nombre as marcado_por_nombre,
        pl.fecha as planilla_fecha
      FROM faltantes f
      LEFT JOIN usuarios u ON f.marcado_por = u.id
      LEFT JOIN planillas pl ON f.planilla_id = pl.id
      WHERE f.estado = 'pendiente'
      AND DATE(f.fecha_marcado) = CURRENT_DATE
      ORDER BY f.cantidad_faltante DESC
      LIMIT 10
    `;

    return NextResponse.json({ 
      success: true,
      stats: {
        totales: totales[0],
        por_entregador: porEntregador,
        productos_mas_faltantes: productosMasFaltantes,
        tendencia_7_dias: tendencia,
        urgentes
      }
    });

  } catch (error) {
    console.error('[FALTANTES] Error en stats:', error);
    return NextResponse.json(
      { error: 'Error al obtener estadísticas' },
      { status: 500 }
    );
  }
}
