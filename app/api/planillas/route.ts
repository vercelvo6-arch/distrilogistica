import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log("[API /planillas POST] ========== INICIO ==========");
  
  try {
    const session = await getSession();
    if (!session) {
      console.error("[API] No hay sesión");
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    console.log("[API] ✓ Sesión válida:", session.user.email);

    const body = await request.json();
    const { routeSheets } = body;
    
    console.log("[API] Planillas recibidas:", routeSheets?.length);
    
    if (!routeSheets || !Array.isArray(routeSheets)) {
      console.error("[API] Datos inválidos");
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const sql = getDB();
    console.log("[API] ✓ Conexión DB obtenida");

    let insertCount = 0;
    const createdPlanillas = [];

    for (const sheet of routeSheets) {
      console.log(`[API] Procesando planilla: ${sheet.ruta}`);
      
      // IGNORAR sheet.id y generar nuevo UUID válido
      const planillaId = randomUUID();
      console.log(`[API] UUID generado para planilla: ${planillaId}`);
      
      // Insertar planilla
      await sql`
        INSERT INTO planillas (
          id, fecha, tipo_ruta, entregador, total_cargue,
          total_entregado, total_fiado, total_repaso, total_devolucion,
          estado, observaciones, created_at, updated_at
        ) VALUES (
          ${planillaId}, 
          ${sheet.fecha}, 
          ${sheet.ruta}, 
          ${sheet.entregador || null},
          ${sheet.totalAmount || 0}, 
          ${0}, 
          ${0}, 
          ${0}, 
          ${0}, 
          ${'pendiente'}, 
          ${null},
          NOW(),
          NOW()
        )
      `;
      
      console.log(`[API] ✓ Planilla insertada con UUID: ${planillaId}`);
      insertCount++;

      // Insertar pedidos
      if (sheet.orders && Array.isArray(sheet.orders)) {
        for (let i = 0; i < sheet.orders.length; i++) {
          const order = sheet.orders[i];
          
          // IGNORAR order.id y generar nuevo UUID válido
          const pedidoId = randomUUID();
          
          console.log(`[API]   → Insertando pedido ${i + 1}/${sheet.orders.length}: ${pedidoId}`);
          
          await sql`
            INSERT INTO pedidos (
              id, planilla_id, secuencia, cliente, direccion, telefono,
              barrio, total, estado, observaciones, created_at, updated_at
            ) VALUES (
              ${pedidoId}, 
              ${planillaId}, 
              ${i + 1}, 
              ${order.cliente || 'Sin nombre'},
              ${order.direccion || ''},
              ${order.telefono || ''},
              ${order.barrio || ''},
              ${order.total || 0}, 
              ${'pendiente'}, 
              ${order.comentarios || order.observaciones || null},
              NOW(),
              NOW()
            )
          `;

          // Insertar productos del pedido
          if (order.items && Array.isArray(order.items)) {
            for (const item of order.items) {
              await sql`
                INSERT INTO pedido_productos (
                  pedido_id, codigo, nombre, cantidad, precio_unitario, total, devuelto
                ) VALUES (
                  ${pedidoId}, 
                  ${item.codigo || ''}, 
                  ${item.descripcion || item.nombre || ''}, 
                  ${item.cantidad || 0},
                  ${item.valorUnidad || item.precio_unitario || 0}, 
                  ${item.subtotal || item.total || 0}, 
                  ${false}
                )
              `;
            }
            console.log(`[API]     ✓ ${order.items.length} productos insertados`);
          }
        }
      }
      
      console.log(`[API] ✓ Planilla ${sheet.ruta} completada con ${sheet.orders?.length || 0} pedidos`);
      
      createdPlanillas.push({
        id: planillaId,
        ruta: sheet.ruta,
        fecha: sheet.fecha,
        pedidos: sheet.orders?.length || 0
      });
    }

    console.log(`[API] ========== ÉXITO: ${insertCount} planillas insertadas ==========`);
    return NextResponse.json({ 
      success: true, 
      count: insertCount,
      planillas: createdPlanillas
    });

  } catch (error) {
    console.error("[API] ========== ERROR FATAL ==========");
    console.error("[API] Error:", error);
    console.error("[API] Stack:", error instanceof Error ? error.stack : 'No stack');
    console.error("[API] Error name:", error instanceof Error ? error.name : 'Unknown');
    console.error("[API] Error message:", error instanceof Error ? error.message : 'No message');
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : null
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  console.log("[API /planillas GET] Obteniendo planillas");
  
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const sql = getDB();
    
    const planillas = await sql`
      SELECT 
        p.*,
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
            'pedido_productos', (
              SELECT json_agg(
                json_build_object(
                  'pedido_id', pp.pedido_id,
                  'codigo', pp.codigo,
                  'nombre', pp.nombre,
                  'cantidad', pp.cantidad,
                  'precio_unitario', pp.precio_unitario,
                  'total', pp.total,
                  'devuelto', pp.devuelto
                )
              )
              FROM pedido_productos pp
              WHERE pp.pedido_id = ped.id
            )
          ) ORDER BY ped.secuencia
        ) FILTER (WHERE ped.id IS NOT NULL) as pedidos
      FROM planillas p
      LEFT JOIN pedidos ped ON p.id = ped.planilla_id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;

    console.log(`[API /planillas GET] ✓ Obtenidas ${planillas.length} planillas`);
    return NextResponse.json({ planillas });

  } catch (error) {
    console.error("[API /planillas GET] ERROR:", error);
    return NextResponse.json(
      { error: "Error al obtener planillas" },
      { status: 500 }
    );
  }
}
