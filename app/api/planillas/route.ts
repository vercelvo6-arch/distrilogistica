import { NextRequest, NextResponse } from 'next/server';
import { getDB } from '@/lib/db';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[API /planillas] ===== INICIO =====');

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { routeSheets } = await request.json();

    if (!Array.isArray(routeSheets) || routeSheets.length === 0) {
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
    }

    const sql = getDB();

    const results = [];
    const errors = [];

    // 🔁 UNA PLANILLA A LA VEZ (pero rápida y segura)
    for (let i = 0; i < routeSheets.length; i++) {
      const sheet = routeSheets[i];

      try {
        await sql.begin(async (tx) => {
          const planillaId = sheet.id;

          if (!planillaId || !sheet.ruta || !sheet.fecha) {
            throw new Error('Datos obligatorios faltantes');
          }

          // 1️⃣ PLANILLA
          await tx`
            INSERT INTO planillas (
              id, fecha, tipo_ruta, entregador,
              total_cargue, total_entregado, total_fiado,
              total_repaso, total_devolucion,
              estado, observaciones, created_at, updated_at
            ) VALUES (
              ${planillaId},
              ${sheet.fecha}::date,
              ${sheet.ruta},
              ${sheet.entregador || null},
              ${Number(sheet.totalAmount) || 0},
              0, 0, 0, 0,
              'pendiente',
              null,
              NOW(),
              NOW()
            )
          `;

          // 2️⃣ PEDIDOS (paralelo)
          if (Array.isArray(sheet.orders) && sheet.orders.length > 0) {
            await Promise.all(
              sheet.orders.map((order, index) => {
                const pedidoId = order.id || `${planillaId}-pedido-${index + 1}`;

                return tx`
                  INSERT INTO pedidos (
                    id, planilla_id, secuencia,
                    cliente, direccion, telefono, barrio,
                    total, estado, observaciones
                  ) VALUES (
                    ${pedidoId},
                    ${planillaId},
                    ${index + 1},
                    ${order.cliente || 'Sin nombre'},
                    ${order.direccion || ''},
                    ${order.telefono || ''},
                    ${order.barrio || ''},
                    ${Number(order.total) || 0},
                    'pendiente',
                    ${order.comentarios || order.observaciones || null}
                  )
                `;
              })
            );

            // 3️⃣ PRODUCTOS (paralelo controlado)
            const productInserts = sheet.orders.flatMap((order, orderIndex) => {
              const pedidoId = order.id || `${planillaId}-pedido-${orderIndex + 1}`;

              if (!Array.isArray(order.items)) return [];

              return order.items.map((item) =>
                tx`
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
                `
              );
            });

            if (productInserts.length > 0) {
              await Promise.all(productInserts);
            }
          }
        });

        results.push({
          id: sheet.id,
          ruta: sheet.ruta,
          pedidos: sheet.orders?.length || 0
        });

        console.log(`✓ Planilla OK (${i + 1}/${routeSheets.length}) → ${sheet.ruta}`);
      } catch (err) {
        console.error(`❌ Error planilla ${sheet.ruta}:`, err);

        errors.push({
          planilla: sheet.ruta,
          planillaId: sheet.id,
          error: err instanceof Error ? err.message : 'Error desconocido'
        });
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[API /planillas] FIN → ${results.length}/${routeSheets.length} en ${duration}ms`);

    return NextResponse.json({
      success: results.length > 0,
      inserted: results.length,
      total: routeSheets.length,
      planillas: results,
      errors,
      duration: `${duration}ms`
    });

  } catch (fatal) {
    console.error('[API /planillas] ERROR FATAL:', fatal);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
