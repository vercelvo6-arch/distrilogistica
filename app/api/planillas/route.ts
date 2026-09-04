import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";
import { handleDBError } from '@/lib/db-helpers';

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
              await sql`
                DELETE FROM pedido_productos 
                WHERE pedido_id = ${pedidoId}
              `;

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
                    devuelto,
                    estado_alistamiento,
                    cantidad_disponible,
                    cantidad_faltante,
                    unidad_incompleta,
                    observaciones_faltante,
                    comentario
                  ) VALUES (
                    ${pedidoId},
                    ${item.codigo || ""},
                    ${item.descripcion || item.nombre || "Sin nombre"},
                    ${item.categoria || ""},
                    ${Number(item.cantidad) || 0},
                    ${Number(item.valorUnidad || item.precio_unitario) || 0},
                    ${Number(item.subtotal || item.total) || 0},
                    false,
                    'pendiente',
                    null,
                    0,
                    false,
                    null,
                    ${item.comentario || null}
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
    return handleDBError(error, 'PLANILLAS POST');
  }
}

export async function GET() {
  try {
    console.log("[API /planillas GET] Iniciando...");
    
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const sql = getDB();

    console.log("[API /planillas GET] Consultando planillas con JOIN...");
    
    // ✅ UNA SOLA QUERY CON JOINS - Evita múltiples conexiones
    const resultado = await sql`
      SELECT
        p.id as planilla_id,
        p.fecha,
        p.tipo_ruta,
        p.entregador,
        p.estado as planilla_estado,
        p.total_cargue,
        p.total_entregado,
        p.total_fiado,
        p.total_repaso,
        p.total_devolucion,
        p.cuadrado_en_caja,
        p.observaciones as planilla_observaciones,
        p.created_at,
        p.updated_at,
        p.fecha_alistamiento,
        p.alistado_por,
        p.alistado_en,
        p.timer_inicio,
        p.timer_fin,
        p.timer_segundos_pausados,
        pe.id as pedido_id,
        pe.secuencia,
        pe.cliente,
        pe.direccion,
        pe.telefono,
        pe.barrio,
        pe.total as pedido_total,
        pe.estado as pedido_estado,
        pe.observaciones as pedido_observaciones,
        pe.entregado_en,
        pe.es_cobro,
        pe.monto_pagado,
        pe.saldo_pendiente,
        pe.descuento,
        pe.motivo_descuento,
        pp.codigo,
        pp.nombre,
        pp.categoria,
        pp.cantidad,
        pp.precio_unitario,
        pp.total as producto_total,
        pp.devuelto,
        pp.motivo_ajuste,
        pp.cantidad_entregada,
        pp.subtotal_ajustado,
        pp.estado_producto,
        pp.estado_alistamiento,
        pp.cantidad_disponible,
        pp.cantidad_faltante,
        pp.unidad_incompleta,
        pp.observaciones_faltante,
        pp.comentario
      FROM planillas p
      LEFT JOIN pedidos pe ON pe.planilla_id = p.id
      LEFT JOIN pedido_productos pp ON pp.pedido_id = pe.id
      WHERE p.cuadrado_en_caja = false
      ORDER BY p.created_at DESC, pe.secuencia, pp.codigo
    `;

    console.log(`[API /planillas GET] Query ejecutado: ${resultado.length} filas`);

    // ✅ Agrupar resultados en memoria (mucho más eficiente)
    const planillasMap = new Map();

    for (const row of resultado) {
      const planillaId = row.planilla_id;
      
      if (!planillasMap.has(planillaId)) {
        planillasMap.set(planillaId, {
          id: planillaId,
          fecha: row.fecha,
          tipo_ruta: row.tipo_ruta,
          entregador: row.entregador,
          estado: row.planilla_estado,
          total_cargue: row.total_cargue,
          total_entregado: row.total_entregado,
          total_fiado: row.total_fiado,
          total_repaso: row.total_repaso,
          total_devolucion: row.total_devolucion,
          cuadrado_en_caja: row.cuadrado_en_caja,
          observaciones: row.planilla_observaciones,
          created_at: row.created_at,
          updated_at: row.updated_at,
          fecha_alistamiento: row.fecha_alistamiento,
          alistado_por: row.alistado_por,
          alistado_en: row.alistado_en,
          timer_inicio: row.timer_inicio || null,
          timer_fin: row.timer_fin || null,
          timer_segundos_pausados: row.timer_segundos_pausados || 0,
          pedidos: [],
          agotados: 0
        });
      }

      const planilla = planillasMap.get(planillaId);
      
      if (row.pedido_id) {
        let pedido = planilla.pedidos.find((p: any) => p.id === row.pedido_id);
        
        if (!pedido) {
          pedido = {
            id: row.pedido_id,
            cliente: row.cliente,
            direccion: row.direccion,
            telefono: row.telefono,
            barrio: row.barrio,
            total: row.pedido_total,
            estado: row.pedido_estado,
            observaciones: row.pedido_observaciones,
            entregado_en: row.entregado_en,
            productos: [],
            descuento: row.descuento || 0,
            motivo_descuento: row.motivo_descuento || null,
            monto_pagado: row.monto_pagado || 0,
            saldo_pendiente: row.saldo_pendiente || 0,
            es_cobro: row.es_cobro || false
          };
          planilla.pedidos.push(pedido);
        }

        if (row.codigo) {
          pedido.productos.push({
            codigo: row.codigo,
            nombre: row.nombre,
            categoria: row.categoria,
            cantidad: row.cantidad,
            precio_unitario: row.precio_unitario,
            total: row.producto_total,
            devuelto: row.devuelto,
            motivo_ajuste: row.motivo_ajuste,
            cantidad_entregada: row.cantidad_entregada,
            subtotal_ajustado: row.subtotal_ajustado,
            estado_producto: row.estado_producto,
            estado_alistamiento: row.estado_alistamiento,
            cantidad_disponible: row.cantidad_disponible,
            cantidad_faltante: row.cantidad_faltante,
            unidad_incompleta: row.unidad_incompleta,
            observaciones_faltante: row.observaciones_faltante,
            comentario: row.comentario
          });
        }
      }
    }

    const planillasConPedidos = Array.from(planillasMap.values());

    console.log('[API /planillas GET] ✓', planillasConPedidos.length, 'planillas obtenidas con éxito');

    return NextResponse.json({ planillas: planillasConPedidos });
    
  } catch (error: any) {
    console.error("[API /planillas GET] ERROR COMPLETO:", error);
    console.error("[API /planillas GET] Stack:", error.stack);
    return NextResponse.json(
      { 
        error: "Error al obtener planillas",
        detalles: error.message,
        tipo: error.name
      },
      { status: 500 }
    );
  }
}
