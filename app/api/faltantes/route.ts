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
    console.log('[FALTANTES] Guardando:', body);
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
      marcadoPor,
      estadoAlistamiento // 🔥 NUEVO: recibir el estado del frontend
    } = body;

    const sql = getDB();

    // 🔥 Usar el estado que viene del frontend, o calcularlo si no viene
    const estadoFinal = estadoAlistamiento || 
      (cantidadDisponible === 0 || cantidadDisponible === null ? 'no_alistado' : 
       (unidadIncompleta || cantidadDisponible < cantidadSolicitada ? 'incompleto' : 'completo'));

    console.log('[FALTANTES] Estado final:', estadoFinal);

    // 1️⃣ Solo guardar faltante si NO es completo
    if (estadoFinal !== 'completo') {
      await sql`
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
          estado,
          fecha_marcado
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
          ${observaciones || ''},
          ${marcadoPor},
          'pendiente',
          NOW()
        )
        ON CONFLICT (planilla_id, codigo) 
        DO UPDATE SET
          cantidad_disponible = ${cantidadDisponible},
          cantidad_faltante = ${cantidadFaltante},
          unidad_incompleta = ${unidadIncompleta || false},
          observaciones = ${observaciones || ''},
          fecha_marcado = NOW()
      `;
      
      console.log('[FALTANTES] ✓ Faltante guardado');
    } else {
      // 🔥 Si es completo, eliminar el faltante si existía
      await sql`
        DELETE FROM faltantes 
        WHERE planilla_id = ${planilla_id} 
          AND codigo = ${codigo}
      `;
      console.log('[FALTANTES] ✓ Faltante eliminado (producto completo)');
    }

    // 2️⃣ 🔥 ACTUALIZAR ESTADO EN PEDIDO_PRODUCTOS (SIEMPRE)
    const pedidosAfectados = await sql`
      SELECT DISTINCT pedido_id 
      FROM pedido_productos pp
      JOIN pedidos p ON pp.pedido_id = p.id
      WHERE p.planilla_id = ${planilla_id}
        AND pp.codigo = ${codigo}
    `;

    console.log('[FALTANTES] Actualizando', pedidosAfectados.length, 'productos');

    // Actualizar el estado en cada producto
    for (const pedido of pedidosAfectados) {
      await sql`
        UPDATE pedido_productos
        SET 
          estado_alistamiento = ${estadoFinal},
          cantidad_disponible = ${cantidadDisponible},
          cantidad_faltante = ${cantidadFaltante},
          unidad_incompleta = ${unidadIncompleta || false},
          observaciones_faltante = ${observaciones || null}
        WHERE pedido_id = ${pedido.pedido_id}
          AND codigo = ${codigo}
      `;
    }

    console.log('[FALTANTES] ✓ Estados actualizados en pedido_productos');

    return NextResponse.json({ 
      success: true,
      estado: estadoFinal,
      productosActualizados: pedidosAfectados.length
    });
  } catch (error) {
    console.error('[FALTANTES] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 }
    );
  }
}

// GET - Ver faltantes (sin cambios)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const planilla_id = searchParams.get('planilla_id');
    const entregador = searchParams.get('entregador');
    const sql = getDB();
    let faltantes;
    if (planilla_id) {
      faltantes = await sql`
        SELECT 
          f.*,
          u.nombre as marcado_por_nombre
        FROM faltantes f
        LEFT JOIN usuarios u ON f.marcado_por = u.id
        WHERE f.planilla_id = ${planilla_id}
        ORDER BY f.fecha_marcado DESC
      `;
    } else if (entregador) {
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
        LIMIT 100
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
    return NextResponse.json({ 
      success: true,
      faltantes
    });
  } catch (error) {
    console.error('[FALTANTES] ERROR:', error);
    return NextResponse.json(
      { error: 'Error al obtener faltantes' },
      { status: 500 }
    );
  }
}
