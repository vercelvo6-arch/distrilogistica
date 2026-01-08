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

    const sql = getDB();

    let insertadas = 0;
    const errores: any[] = [];

    for (let i = 0; i < routeSheets.length; i++) {
      const sheet = routeSheets[i];

      try {
        if (!sheet.id || !sheet.ruta || !sheet.fecha) {
          throw new Error("Datos incompletos en la planilla");
        }

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
          ON CONFLICT (id) DO NOTHING
        `;

        // 2️⃣ PEDIDOS
        if (Array.isArray(sheet.orders)) {
          for (let j = 0; j < sheet.orders.length; j++) {
            const order = sheet.orders[j];
            const pedidoId = order.id || `${sheet.id}-${j + 1}`;

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
                ${order.observaciones || null}
              )
              ON CONFLICT (id) DO NOTHING
            `;

            // 3️⃣ PRODUCTOS
            if (Array.isArray(order.items)) {
              for (const item of order.items) {
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
            }
          }
        }

        insertadas++;
      } catch (err: any) {
        console.error("❌ Error planilla:", sheet.id, err);
        errores.push({
          planillaId: sheet.id,
          ruta: sheet.ruta,
          error: err.message,
        });
      }
    }

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

    const planillas = await sql`
      SELECT
        p.*,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', pe.id,
                'cliente', pe.cliente,
                'total', pe.total,
                'estado', pe.estado
              )
              ORDER BY pe.secuencia
            )
            FROM pedidos pe
            WHERE pe.planilla_id = p.id
          ),
          '[]'::json
        ) AS pedidos
      FROM planillas p
      ORDER BY p.created_at DESC
    `;

    return NextResponse.json({ planillas });
  } catch (error) {
    console.error("[API /planillas GET] ERROR", error);
    return NextResponse.json(
      { error: "Error al obtener planillas" },
      { status: 500 }
    );
  }
}
