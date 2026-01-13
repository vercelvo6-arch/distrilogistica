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
      marcadoPor
    } = body;

    const sql = getDB();

    // 🔥 DETERMINAR EL ESTADO CORRECTO
    let estadoAlistamiento: 'completo' | 'incompleto' | 'no_alistado';
    
    if (cantidadDisponible === 0 || cantidadDisponible === null) {
      estadoAlistamiento = 'no_alistado';
    } else if (unidadIncompleta || cantidadDisponible < cantidadSolicitada) {
      estadoAlistamiento = 'incompleto';
    } else {
      estadoAlistamiento = 'completo';
    }

    console.log('[FALTANTES] Estado calculado:', estadoAlistamiento);

    // 1️⃣ Guardar el faltante (solo si hay novedad)
    if (estadoAlistamiento !== 'completo') {
      const result = await sql`
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
        RETURNING *
      `;
      
      console.log('[FALTANTES] ✓ Faltante guardado ID:', result[0].id);
    }

    // 2️⃣ 🔥 ACTUALIZAR ESTADO EN PEDIDO_PRODUCTOS
    // Obtener todos los pedidos de esta planilla que tienen este producto
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
          estado_alistamiento = ${estadoAlistamiento},
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
      estado: estadoAlistamiento,
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
