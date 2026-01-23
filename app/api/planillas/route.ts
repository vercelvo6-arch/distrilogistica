import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.log("[API /planillas] ===== INICIO =====");

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { routeSheets } = body;

    if (!Array.isArray(routeSheets) || routeSheets.length === 0) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    console.log(`[API /planillas] Recibidas ${routeSheets.length} planillas`);
    
    // Log de ejemplo para debug
    if (routeSheets.length > 0) {
      const ejemplo = routeSheets.find(s => s.ruta === '72') || routeSheets[0];
      console.log(`[API /planillas] Ejemplo ruta ${ejemplo.ruta}:`, {
        id: ejemplo.id,
        totalOrders: ejemplo.orders?.length || 0,
        primeraOrden: ejemplo.orders?.[0]?.id
      });
    }

    const sql = getDB();

    let insertadas = 0;
    const errores: any[] = [];

    for (const sheet of routeSheets) {
      try {
        if (!sheet.id || !sheet.ruta || !sheet.fecha) {
          throw new Error("Datos incompletos en la planilla");
        }

        console.log(`[API /planillas] Procesando planilla ${sheet.id} - Ruta ${sheet.ruta} - ${sheet.orders?.length || 0} pedidos`);

        // 1️⃣ PLANILLA
        await sql`
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
            ${sheet.id},
            ${sheet.fecha}::date,
            ${sheet.ruta},
            ${sheet.entregador || null},
            ${Number(sheet.totalAmount) || 0},
            0,
            0,
            0,
            0,
            'pendiente',
            null,
            NOW(),
            NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            updated_at = NOW()
        `;

        // 2️⃣ PEDIDOS
        if (Array.isArray(sheet.orders) && sheet.orders.length > 0) {
          console.log(`[API /planillas] Insertando ${sheet.orders.length} pedidos para planilla ${sheet.id}`);
          
          for (let j = 0; j < sheet.orders.length; j++) {
            const order = sheet.orders[j];
            const pedidoId = order.id || `${sheet.id}-PED-${j + 1}`;

            console.log(`[API /planillas] Pedido ${j + 1}/${sheet.orders.length}: ${pedidoId} - ${order.items?.length || 0} items`);

            const resultPedido = await sql`
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
                observaciones
              ) VALUES (
                ${pedidoId},
                ${sheet.id},
                ${j + 1},
                ${order.cliente || "Sin nombre"},
                ${order.direccion || ""},
                ${order.telefono || ""},
                ${order.barrio || ""},
                ${Number(order.total) || 0},
                'pendiente',
                ${order.observaciones || order.comentarios || null}
              )
              ON CONFLICT (id) DO UPDATE SET
                updated_at = NOW()
              RETURNING id
            `;

            console.log(`[API /planillas] ✓ Pedido insertado: ${resultPedido[0]?.id}`);

            // 3️⃣ PRODUCTOS
            if (Array.isArray(order.items) && order.items.length > 0) {
              // Primero eliminar productos existentes de este pedido
              await sql`
                DELETE FROM pedido_productos 
                WHERE pedido_id = ${pedidoId}
              `;

              // Insertar productos uno por uno para mejor logging
              for (let k = 0; k < order.items.length; k++) {
                const item = order.items[k];
                
                await sql`
                  INSERT INTO pedido_productos (
                    pedido_id,
                    codigo,
                    nombre,
                    categoria,
                    cantidad,
                    precio_unitario,
                    total,
                    devuelto
                  ) VALUES (
                    ${pedidoId},
                    ${item.codigo || ""},
                    ${item.descripcion || item.nombre || "Sin nombre"},
                    ${item.categoria || ""},
                    ${Number(item.cantidad) || 0},
                    ${Number(item.valorUnidad || item.precio_unitario) || 0},
                    ${Number(item.subtotal || item.total) || 0},
                    false
                  )
                `;
              }
              
              console.log(`[API /planillas] ✓ ${order.items.length} productos insertados para pedido ${pedidoId}`);
            }
          }
        } else {
          console.warn(`[API /planillas] ⚠️ Planilla ${sheet.id} no tiene pedidos`);
        }

        insertadas++;
        console.log(`✅ Planilla ${sheet.id} completada (${insertadas}/${routeSheets.length})`);
        
      } catch (err: any) {
        console.error("❌ Error planilla:", sheet.id, err);
        errores.push({
          planillaId: sheet.id,
          ruta: sheet.ruta,
          error: err.message,
        });
      }
    }

    console.log(`[API /planillas] ✅ COMPLETADO: ${insertadas}/${routeSheets.length}`);

    return NextResponse.json({
      success: insertadas > 0,
      insertadas,
      total: routeSheets.length,
      errores,
    });
  } catch (error: any) {
    console.error("[API /planillas] ERROR FATAL", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const sql = getDB();

    // SELECT SIN las columnas que pueden no existir
    const planillas = await sql`
      SELECT
        p.id,
        p.fecha,
        p.tipo_ruta,
        p.entregador,
        p.estado,
        p.total_cargue,
        p.total_entregado,
        p.total_fiado,
        p.total_repaso,
        p.total_devolucion,
        p.cuadrado_en_caja,
        p.observaciones,
        p.created_at,
        p.updated_at
      FROM planillas p
      ORDER BY p.created_at DESC
    `;

    const planillasConPedidos = await Promise.all(
      planillas.map(async (planilla) => {
        const pedidos = await sql`
          SELECT 
            pe.id,
            pe.cliente,
            pe.direccion,
            pe.telefono,
            pe.barrio,
            pe.total,
            pe.estado,
            pe.observaciones,
            pe.entregado_en
          FROM pedidos pe
          WHERE pe.planilla_id = ${planilla.id}
          ORDER BY pe.secuencia
        `;

        console.log(`[API GET] Planilla ${planilla.id}: ${pedidos.length} pedidos`);

        const pedidosConProductos = await Promise.all(
          pedidos.map(async (pedido) => {
            const productos = await sql`
              SELECT 
                codigo,
                nombre,
                categoria,
                cantidad,
                precio_unitario,
                total,
                devuelto,
                estado_alistamiento,
                cantidad_disponible,
                cantidad_faltante,
                unidad_incompleta,
                observaciones_faltante
              FROM pedido_productos
              WHERE pedido_id = ${pedido.id}
              ORDER BY codigo
            `;

            return {
              ...pedido,
              productos,
              // Valores por defecto para campos que pueden faltar
              descuento: 0,
              motivo_descuento: null,
              monto_pagado: 0,
              saldo_pendiente: 0,
              es_cobro: false
            };
          })
        );

        return {
          ...planilla,
          pedidos: pedidosConProductos,
          // Valores por defecto para campos que pueden faltar
          agotados: 0,
          fecha_alistamiento: null,
          alistado_por: null,
          alistado_en: null
        };
      })
    );

    console.log('[API /planillas GET] ✓', planillasConPedidos.length, 'planillas obtenidas');

    return NextResponse.json({ planillas: planillasConPedidos });
  } catch (error) {
    console.error("[API /planillas GET] ERROR", error);
    return NextResponse.json(
      { error: "Error al obtener planillas" },
      { status: 500 }
    );
  }
}
