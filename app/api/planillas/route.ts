// Force redeploy - 2025-01-07 - Fixed bulk inserts for Neon
import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log("[API /planillas POST] ========== INICIO ==========");
  
  try {
    const session = await getSession();
    if (!session) {
      console.error("[API] No hay sesión");
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { routeSheets } = body;
    
    console.log("[API] Planillas recibidas:", routeSheets?.length);
    
    if (!routeSheets || !Array.isArray(routeSheets) || routeSheets.length === 0) {
      console.error("[API] Datos inválidos");
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const sql = getDB();

    let insertCount = 0;
    const createdPlanillas = [];
    const errors = [];

    for (let sheetIndex = 0; sheetIndex < routeSheets.length; sheetIndex++) {
      const sheet = routeSheets[sheetIndex];
      
      try {
        console.log(`[API] Procesando planilla ${sheetIndex + 1}/${routeSheets.length} - Ruta ${sheet.ruta}`);
        
        const planillaId = sheet.id;
        
        if (!planillaId || !sheet.ruta || !sheet.fecha) {
          throw new Error(`Datos faltantes en planilla ${sheetIndex + 1}`);
        }
        
        // 1. Insertar planilla
        await sql`
          INSERT INTO planillas (
            id, fecha, tipo_ruta, entregador, total_cargue,
            total_entregado, total_fiado, total_repaso, total_devolucion,
            estado, observaciones, created_at, updated_at
          ) VALUES (
            ${planillaId}, ${sheet.fecha}::date, ${sheet.ruta}, ${sheet.entregador || null},
            ${Number(sheet.totalAmount) || 0}, ${0}, ${0}, ${0}, ${0}, 
            'pendiente', ${null}, NOW(), NOW()
          )
        `;
        
        console.log(`[API] ✓ Planilla insertada: ${planillaId}`);

        // 2. Insertar pedidos UNO POR UNO (Neon no soporta bulk insert con la sintaxis anterior)
        if (sheet.orders && Array.isArray(sheet.orders) && sheet.orders.length > 0) {
          for (let orderIndex = 0; orderIndex < sheet.orders.length; orderIndex++) {
            const order = sheet.orders[orderIndex];
            const pedidoId = order.id || `${planillaId}-order-${orderIndex + 1}`;
            
            await sql`
              INSERT INTO pedidos (
                id, planilla_id, secuencia, cliente, direccion, 
                telefono, barrio, total, estado, observaciones
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
                ${order.comentarios || order.observaciones || null}
              )
            `;

            // 3. Insertar productos de este pedido
            if (order.items && Array.isArray(order.items) && order.items.length > 0) {
              for (const item of order.items) {
                await sql`
                  INSERT INTO pedido_productos (
                    pedido_id, codigo, nombre, categoria, 
                    cantidad, precio_unitario, total, devuelto
                  ) VALUES (
                    ${pedidoId},
                    ${item.codigo || ''},
                    ${item.descripcion || item.nombre || 'Sin nombre'},
                    ${item.categoria || ''},
                    ${Number(item.cantidad) || 0},
                    ${Number(item.valorUnidad || item.precio_unitario) || 0},
                    ${Number(item.subtotal || item.total) || 0},
                    false
                  )
                `;
              }
            }
          }
          
          console.log(`[API] ✓ ${sheet.orders.length} pedidos insertados para planilla ${planillaId}`);
        }
        
        insertCount++;
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
          planillaId: sheet.id,
          error: sheetError instanceof Error ? sheetError.message : 'Error desconocido'
        });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[API] ✓ Planillas insertadas: ${insertCount}/${routeSheets.length} en ${duration}ms`);
    
    return NextResponse.json({ 
      success: insertCount > 0, 
      count: insertCount,
      planillas: createdPlanillas,
      errors: errors,
      duration: `${duration}ms`
    });

  } catch (error) {
    console.error("[API] ERROR FATAL:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

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
          (
            SELECT json_agg(
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
                'productos', COALESCE(
                  (
                    SELECT json_agg(
                      json_build_object(
                        'codigo', pp.codigo,
                        'nombre', pp.nombre,
                        'categoria', pp.categoria,
                        'cantidad', pp.cantidad,
                        'precio_unitario', pp.precio_unitario,
                        'total', pp.total,
                        'devuelto', COALESCE(pp.devuelto, false),
                        'monto_entregado', pp.monto_entregado,
                        'monto_devuelto', pp.monto_devuelto
                      ) ORDER BY pp.id
                    )
                    FROM pedido_productos pp
                    WHERE pp.pedido_id = ped.id
                  ),
                  '[]'::json
                )
              ) ORDER BY ped.secuencia
            )
            FROM pedidos ped
            WHERE ped.planilla_id = p.id
          ),
          '[]'::json
        ) as pedidos
      FROM planillas p
      ORDER BY p.created_at DESC
    `;

    console.log(`[API /planillas GET] ✓ ${planillas.length} planillas obtenidas`);
    return NextResponse.json({ planillas });
    
  } catch (error) {
    console.error("[API /planillas GET] ERROR:", error);
    return NextResponse.json({ error: "Error al obtener planillas" }, { status: 500 });
  }
}
