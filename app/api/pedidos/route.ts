import { NextRequest, NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  console.log("[API /pedidos] ===== INICIO =====");

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json();
    const { planillaId, cliente, observaciones, productos, total } = body;

    // Validaciones
    if (!planillaId) {
      return NextResponse.json({ error: "planillaId es requerido" }, { status: 400 });
    }

    if (!cliente) {
      return NextResponse.json({ error: "cliente es requerido" }, { status: 400 });
    }

    if (!Array.isArray(productos) || productos.length === 0) {
      return NextResponse.json({ error: "productos debe ser un array con al menos un producto" }, { status: 400 });
    }

    console.log(`[API /pedidos] Creando pedido para planilla ${planillaId}`);
    console.log(`[API /pedidos] Cliente: ${cliente}`);
    console.log(`[API /pedidos] Productos: ${productos.length}`);

    const sql = getDB();

    // Verificar que la planilla existe
    const planillaExiste = await sql`
      SELECT id FROM planillas WHERE id = ${planillaId} LIMIT 1
    `;

    if (planillaExiste.length === 0) {
      return NextResponse.json({ error: "La planilla no existe" }, { status: 404 });
    }

    // Obtener la secuencia del siguiente pedido
    const ultimaSecuencia = await sql`
      SELECT COALESCE(MAX(secuencia), 0) as max_secuencia 
      FROM pedidos 
      WHERE planilla_id = ${planillaId}
    `;

    const nuevaSecuencia = (ultimaSecuencia[0]?.max_secuencia || 0) + 1;
    const pedidoId = `${planillaId}-PED-${nuevaSecuencia}`;

    console.log(`[API /pedidos] Generando pedido ID: ${pedidoId} con secuencia ${nuevaSecuencia}`);

    // Insertar el pedido
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
        observaciones,
        monto_pagado,
        saldo_pendiente
      ) VALUES (
        ${pedidoId},
        ${planillaId},
        ${nuevaSecuencia},
        ${cliente},
        ${""}, -- direccion vacía
        ${""}, -- telefono vacío
        ${""}, -- barrio vacío
        ${Number(total) || 0},
        'entregado',
        ${observaciones || null},
        0,
        0
      )
      RETURNING id, secuencia
    `;

    console.log(`[API /pedidos] ✓ Pedido creado: ${resultPedido[0]?.id}`);

    // Insertar los productos
    for (let i = 0; i < productos.length; i++) {
      const producto = productos[i];
      
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
          ${producto.codigo || ""},
          ${producto.descripcion || producto.nombre || "Sin nombre"},
          ${producto.categoria || ""},
          ${Number(producto.cantidad) || 0},
          ${Number(producto.precio_unitario || producto.precioUnitario) || 0},
          ${Number(producto.subtotal || producto.total) || 0},
          false
        )
      `;
    }

    console.log(`[API /pedidos] ✓ ${productos.length} productos insertados`);

    // Actualizar el total de cargue de la planilla
    const nuevoTotalCargue = await sql`
      SELECT COALESCE(SUM(total), 0) as total_cargue
      FROM pedidos
      WHERE planilla_id = ${planillaId}
    `;

    await sql`
      UPDATE planillas
      SET total_cargue = ${Number(nuevoTotalCargue[0]?.total_cargue) || 0},
          updated_at = NOW()
      WHERE id = ${planillaId}
    `;

    console.log(`[API /pedidos] ✓ Total de cargue actualizado`);
    console.log(`[API /pedidos] ===== FIN =====`);

    return NextResponse.json({
      success: true,
      pedido: {
        id: pedidoId,
        secuencia: nuevaSecuencia,
        cliente,
        total,
        productos: productos.length
      }
    });

  } catch (error: any) {
    console.error("[API /pedidos] ERROR FATAL", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
