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
      estadoAlistamiento
    } = body;

    const sql = getDB();

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
      await sql`
        DELETE FROM faltantes 
        WHERE planilla_id = ${planilla_id} 
          AND codigo = ${codigo}
      `;
      console.log('[FALTANTES] ✓ Faltante eliminado (producto completo)');
    }

    // 2️⃣ ACTUALIZAR ESTADO EN PEDIDO_PRODUCTOS
    const pedidosAfectados = await sql`
      SELECT DISTINCT pedido_id 
      FROM pedido_productos pp
      JOIN pedidos p ON pp.pedido_id = p.id
      WHERE p.planilla_id = ${planilla_id}
        AND pp.codigo = ${codigo}
    `;

    console.log('[FALTANTES] 🔍 Query result:', {
      planilla_id,
      codigo,
      pedidosEncontrados: pedidosAfectados.length,
      pedidosIds: pedidosAfectados.map((p: any) => p.pedido_id)
    });

    console.log('[FALTANTES] Actualizando', pedidosAfectados.length, 'productos');

    // ✅ Un solo UPDATE en lugar de un loop
    if (pedidosAfectados.length > 0) {
      const pedidoIds = pedidosAfectados.map((p: any) => p.pedido_id);
      
      await sql`
        UPDATE pedido_productos
        SET 
          estado_alistamiento = ${estadoFinal},
          cantidad_disponible = ${cantidadDisponible},
          cantidad_faltante = ${cantidadFaltante},
          unidad_incompleta = ${unidadIncompleta || false},
          observaciones_faltante = ${observaciones || null}
        WHERE pedido_id = ANY(${pedidoIds}::text[])
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

// GET - Ver faltantes (SOLO PENDIENTES por defecto)
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const planilla_id = searchParams.get('planilla_id');
    const entregador = searchParams.get('entregador');
    const estado = searchParams.get('estado');
    const codigo = searchParams.get('codigo');
    const fecha_inicio = searchParams.get('fecha_inicio');
    const fecha_fin = searchParams.get('fecha_fin');
    
    console.log('[FALTANTES GET] Params:', { planilla_id, entregador, estado, codigo, fecha_inicio, fecha_fin });
    
    const sql = getDB();
    
    // Si NO se especifica estado, solo mostrar pendientes
    const estadoFiltro = estado && estado !== 'all' ? estado : 'pendiente';
    
    let faltantes = await sql`
      SELECT 
        f.*,
        u.nombre as marcado_por_nombre,
        u2.nombre as resuelto_por_nombre,
        pl.fecha as planilla_fecha
      FROM faltantes f
      LEFT JOIN usuarios u ON f.marcado_por = u.id
      LEFT JOIN usuarios u2 ON f.resuelto_por = u2.id
      LEFT JOIN planillas pl ON f.planilla_id = pl.id
      WHERE 
        f.estado = ${estadoFiltro}
        AND (${planilla_id ? sql`f.planilla_id = ${Number(planilla_id)}` : sql`1=1`})
        AND (${entregador && entregador !== 'all' ? sql`f.entregador = ${entregador}` : sql`1=1`})
        AND (${codigo ? sql`f.codigo ILIKE ${`%${codigo}%`}` : sql`1=1`})
        AND (${fecha_inicio ? sql`f.fecha_marcado >= ${fecha_inicio}::date` : sql`1=1`})
        AND (${fecha_fin ? sql`f.fecha_marcado <= ${fecha_fin}::date + interval '1 day'` : sql`1=1`})
      ORDER BY f.fecha_marcado DESC 
      LIMIT 500
    `;
    
    console.log('[FALTANTES GET] ✅ Encontrados:', faltantes.length);
    
    return NextResponse.json({ 
      success: true,
      faltantes
    });
  } catch (error) {
    console.error('[FALTANTES GET] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al obtener faltantes' },
      { status: 500 }
    );
  }
}

// PATCH - Subsanar faltante
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      faltanteId,
      tipoResolucion,
      cantidadResuelta,
      observaciones_resolucion
    } = body;

    // Validaciones
    if (!faltanteId || !tipoResolucion) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos: faltanteId y tipoResolucion' },
        { status: 400 }
      );
    }

    if (!['completo', 'parcial', 'definitivo'].includes(tipoResolucion)) {
      return NextResponse.json(
        { error: 'tipoResolucion debe ser: completo, parcial o definitivo' },
        { status: 400 }
      );
    }

    if (tipoResolucion === 'parcial' && (!cantidadResuelta || cantidadResuelta <= 0)) {
      return NextResponse.json(
        { error: 'Para resolución parcial debe especificar cantidadResuelta > 0' },
        { status: 400 }
      );
    }

    // ✅ Observaciones opcionales con valor por defecto
    const observacionesFinal = observaciones_resolucion?.trim() || 'Subsanado por coordinador';

    const sql = getDB();

    // Obtener el faltante actual
    const faltanteActual = await sql`
      SELECT * FROM faltantes WHERE id = ${faltanteId}
    `;

    if (faltanteActual.length === 0) {
      return NextResponse.json(
        { error: 'Faltante no encontrado' },
        { status: 404 }
      );
    }

    const faltante = faltanteActual[0];

    // Calcular valores según tipo de resolución
    let nuevoEstado: string;
    let cantidadResueltaFinal: number;
    
    switch (tipoResolucion) {
      case 'completo':
        nuevoEstado = 'resuelto';
        cantidadResueltaFinal = faltante.cantidad_faltante;
        break;
      
      case 'parcial':
        nuevoEstado = 'parcial';
        cantidadResueltaFinal = cantidadResuelta;
        
        if (cantidadResueltaFinal > faltante.cantidad_faltante) {
          return NextResponse.json(
            { error: `No puede resolver más de lo que falta (máximo: ${faltante.cantidad_faltante})` },
            { status: 400 }
          );
        }
        break;
      
      case 'definitivo':
        nuevoEstado = 'definitivo';
        cantidadResueltaFinal = 0;
        break;
      
      default:
        return NextResponse.json(
          { error: 'Tipo de resolución inválido' },
          { status: 400 }
        );
    }

    // Actualizar el faltante
    const resultado = await sql`
      UPDATE faltantes
      SET 
        estado = ${nuevoEstado},
        tipo_resolucion = ${tipoResolucion},
        cantidad_resuelta = ${cantidadResueltaFinal},
        resuelto_por = ${session.user.id},
        fecha_resolucion = NOW(),
        observaciones_resolucion = ${observacionesFinal}
      WHERE id = ${faltanteId}
      RETURNING *
    `;

    console.log(`[FALTANTES SUBSANAR] ✓ Faltante ${faltanteId} actualizado a estado: ${nuevoEstado}`);
    
    const estadoProducto = nuevoEstado === 'resuelto' ? 'completo' : 
                          nuevoEstado === 'parcial' ? 'incompleto' : 
                          'no_alistado';

    await sql`
      UPDATE pedido_productos pp
      SET 
        estado_alistamiento = ${estadoProducto},
        cantidad_disponible = ${faltante.cantidad_disponible + cantidadResueltaFinal},
        observaciones_faltante = ${observacionesFinal}
      FROM pedidos p
      WHERE pp.pedido_id = p.id
        AND p.planilla_id = ${faltante.planilla_id}
        AND pp.codigo = ${faltante.codigo}
    `;

    console.log(`[FALTANTES SUBSANAR] ✓ Estado actualizado en pedido_productos a: ${estadoProducto}`);

    return NextResponse.json({
      success: true,
      faltante: resultado[0],
      mensaje: 
        tipoResolucion === 'completo' ? `Faltante resuelto completamente (${cantidadResueltaFinal} unidades)` :
        tipoResolucion === 'parcial' ? `Resueltas ${cantidadResueltaFinal} de ${faltante.cantidad_faltante} unidades. Pendiente: ${faltante.cantidad_faltante - cantidadResueltaFinal}` :
        'Faltante marcado como definitivo (no hay producto disponible)'
    });

  } catch (error) {
    console.error('[FALTANTES SUBSANAR] ERROR:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al subsanar faltante' },
      { status: 500 }
    );
  }
}
