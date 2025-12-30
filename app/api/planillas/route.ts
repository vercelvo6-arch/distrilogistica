import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 60 segundos para operaciones largas

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log("[API /planillas POST] ========== INICIO ==========");
  
  try {
    // 1. Validar sesión
    const session = await getSession();
    if (!session) {
      console.error("[API] No hay sesión");
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    console.log("[API] ✓ Sesión válida:", session.user.email);

    // 2. Parsear body
    const body = await request.json();
    const { routeSheets } = body;
    
    console.log("[API] Planillas recibidas:", routeSheets?.length);
    
    if (!routeSheets || !Array.isArray(routeSheets) || routeSheets.length === 0) {
      console.error("[API] Datos inválidos");
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    // 3. Conectar a BD
    const sql = getDB();
    console.log("[API] ✓ Conexión DB obtenida");

    // 4. Test de conexión
    try {
      await sql`SELECT NOW() as current_time`;
      console.log("[API] ✓ Test de conexión exitoso");
    } catch (dbError) {
      console.error("[API] ❌ Error en test de conexión:", dbError);
      throw new Error('No se pudo conectar a la base de datos');
    }

    let insertCount = 0;
    const createdPlanillas = [];
    const errors = [];

    // 5. Procesar cada planilla
    for (let sheetIndex = 0; sheetIndex < routeSheets.length; sheetIndex++) {
      const sheet = routeSheets[sheetIndex];
      
      try {
        console.log(`\n[API] ===== Planilla ${sheetIndex + 1}/${routeSheets.length} =====`);
        console.log(`[API] Ruta: ${sheet.ruta}`);
        console.log(`[API] Fecha: ${sheet.fecha}`);
        console.log(`[API] ID original: ${sheet.id}`);
        console.log(`[API] Órdenes: ${sheet.orders?.length || 0}`);
        
        // Usar el ID tal como viene (ahora funciona con TEXT)
        const planillaId = sheet.id;
        
        // Validar datos esenciales
        if (!planillaId || !sheet.ruta || !sheet.fecha) {
          throw new Error(`Datos faltantes en planilla ${sheetIndex + 1}`);
        }
        
        // 5.1. Insertar planilla
        const insertPlanillaResult = await sql`
          INSERT INTO planillas (
            id, 
            fecha, 
            tipo_ruta, 
            entregador, 
            total_cargue,
            total_entregado, 
            total_fiado, 
            total_repaso, 
            total_devolucion,
            estado, 
            observaciones, 
            created_at, 
            updated_at
          ) VALUES (
            ${planillaId}, 
            ${sheet.fecha}::date, 
            ${sheet.ruta}, 
            ${sheet.entregador || null},
            ${Number(sheet.totalAmount) || 0}, 
            ${0}, 
            ${0}, 
            ${0}, 
            ${0}, 
            'pendiente', 
            ${null},
            NOW(),
            NOW()
          )
          RETURNING id
        `;
        
        console.log(`[API] ✓ Planilla insertada:`, insertPlanillaResult[0]?.id);
        insertCount++;

        // 5.2. Insertar pedidos
        if (sheet.orders && Array.isArray(sheet.orders)) {
          for (let orderIndex = 0; orderIndex < sheet.orders.length; orderIndex++) {
            const order = sheet.orders[orderIndex];
            const pedidoId = order.id || `${planillaId}-order-${orderIndex + 1}`;
            
            try {
              // Insertar pedido
              await sql`
                INSERT INTO pedidos (
                  id, 
                  planilla_id, 
                  secuencia, 
                  cliente, 
                  direccion, 
                  telefono,
                  barrio, 
                  total, 
                  estado, 
                  observaciones, 
                  created_at, 
                  updated_at
                ) VALUES (
                  ${pedidoId}, 
                  ${planillaId}, 
                  ${orderIndex + 1}, 
                  ${order.cliente || 'Sin nombre'},
                  ${order.direccion || ''},
                  ${order.telefono || ''},
                  ${order.barrio || ''},
                  ${Number(order.total) || 0}, 
                  'pendiente', 
                  ${order.comentarios || order.observaciones || null},
                  NOW(),
                  NOW()
                )
              `;

              // 5.3. Insertar productos del pedido
              if (order.items && Array.isArray(order.items) && order.items.length > 0) {
                for (const item of order.items) {
                  await sql`
                    INSERT INTO pedido_productos (
                      pedido_id, 
                      codigo, 
                      nombre, 
                      cantidad, 
                      precio_unitario, 
                      total, 
                      devuelto
                    ) VALUES (
                      ${pedidoId}, 
                      ${item.codigo || ''}, 
                      ${item.descripcion || item.nombre || 'Sin nombre'}, 
                      ${Number(item.cantidad) || 0},
                      ${Number(item.valorUnidad || item.precio_unitario) || 0}, 
                      ${Number(item.subtotal || item.total) || 0}, 
                      false
                    )
                  `;
                }
                
                if (orderIndex % 10 === 0) {
                  console.log(`[API]   → ${orderIndex + 1}/${sheet.orders.length} pedidos procesados`);
                }
              }
            } catch (orderError) {
              console.error(`[API] ❌ Error en pedido ${orderIndex + 1}:`, orderError);
              errors.push({
                planilla: sheet.ruta,
                pedido: orderIndex + 1,
                error: orderError instanceof Error ? orderError.message : 'Error desconocido'
              });
            }
          }
          
          console.log(`[API] ✓ ${sheet.orders.length} pedidos insertados para ruta ${sheet.ruta}`);
        }
        
        createdPlanillas.push({
          id: planillaId,
          ruta: sheet.ruta,
          fecha: sheet.fecha,
          pedidos: sheet.orders?.length || 0
        });
        
      } catch (sheetError) {
        console.error(`[API] ❌ Error en planilla ${sheetIndex + 1}:`, sheetError);
        errors.push({
          planilla: sheet.ruta || `Planilla ${sheetIndex + 1}`,
          error: sheetError instanceof Error ? sheetError.message : 'Error desconocido'
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n[API] ========== RESUMEN ==========`);
    console.log(`[API] ✓ Planillas insertadas: ${insertCount}/${routeSheets.length}`);
    console.log(`[API] ✓ Errores: ${errors.length}`);
    console.log(`[API] ✓ Duración: ${duration}ms`);
    console.log(`[API] ========== FIN ==========\n`);
    
    return NextResponse.json({ 
      success: true, 
      count: insertCount,
      planillas: createdPlanillas,
      errors: errors.length > 0 ? errors : undefined,
      duration: `${duration}ms`
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error("\n[API] ========== ERROR FATAL ==========");
    console.error("[API] Tipo:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("[API] Mensaje:", error instanceof Error ? error.message : String(error));
    console.error("[API] Stack:", error instanceof Error ? error.stack : 'No disponible');
    console.error("[API] Duración hasta error:", duration, "ms");
    console.error("[API] ====================================\n");
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
      details: error instanceof Error ? error.stack : null,
      duration: `${duration}ms`
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  console.log("[API /planillas GET] Iniciando...");
  
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const sql = getDB();
    
    const planillas = await sql`
      SELECT 
        p.id,
        p.fecha,
        p.tipo_ruta,
        p.entregador,
        p.total_cargue,
        p.total_entregado,
        p.total_fiado,
        p.total_repaso,
        p.total_devolucion,
        p.estado,
        p.observaciones,
        p.created_at,
        p.updated_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ped.id,
              'planilla_id', ped.planilla_id,
              'secuencia', ped.secuencia,
              'cliente', ped.cliente,
              'direccion', ped.direccion,
              'telefono', ped.telefono,
              'barrio', ped.barrio,
              'total', ped.total,
              'estado', ped.estado,
              'observaciones', ped.observaciones,
              'productos', (
                SELECT COALESCE(json_agg(
                  json_build_object(
                    'codigo', pp.codigo,
                    'nombre', pp.nombre,
                    'cantidad', pp.cantidad,
                    'precio_unitario', pp.precio_unitario,
                    'total', pp.total,
                    'devuelto', pp.devuelto
                  ) ORDER BY pp.id
                ), '[]'::json)
                FROM pedido_productos pp
                WHERE pp.pedido_id = ped.id
              )
            ) ORDER BY ped.secuencia
          ) FILTER (WHERE ped.id IS NOT NULL),
          '[]'::json
        ) as pedidos
      FROM planillas p
      LEFT JOIN pedidos ped ON p.id = ped.planilla_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    console.log(`[API /planillas GET] ✓ ${planillas.length} planillas obtenidas`);
    return NextResponse.json({ planillas });

  } catch (error) {
    console.error("[API /planillas GET] ERROR:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al obtener planillas" },
      { status: 500 }
    );
  }
}
