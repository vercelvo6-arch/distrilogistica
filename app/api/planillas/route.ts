import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import type { RouteSheet } from "@/lib/types"

export async function POST(request: Request) {
  try {
    const { planillas } = await request.json()
    
    if (!planillas || !Array.isArray(planillas)) {
      return NextResponse.json(
        { error: "Datos de planillas inválidos" },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Insertar cada planilla en la base de datos
    for (const planilla of planillas as RouteSheet[]) {
      // 1. Insertar la planilla
      const [insertedPlanilla] = await sql`
        INSERT INTO planillas (
          id, ruta, fecha, entregador, estado, total_amount, total_orders
        ) VALUES (
          ${planilla.id},
          ${planilla.ruta},
          ${planilla.fecha},
          ${planilla.entregador || null},
          ${planilla.estado},
          ${planilla.totalAmount},
          ${planilla.totalOrders}
        )
        RETURNING id
      `

      // 2. Insertar los pedidos de esta planilla
      for (const order of planilla.orders) {
        const [insertedOrder] = await sql`
          INSERT INTO pedidos (
            id, planilla_id, cliente, ruta, fecha, entregador, 
            estado, total_original, total_actual
          ) VALUES (
            ${order.id},
            ${planilla.id},
            ${order.cliente},
            ${order.ruta},
            ${order.fecha},
            ${order.entregador || null},
            ${order.estado},
            ${order.totalOriginal},
            ${order.totalActual}
          )
          RETURNING id
        `

        // 3. Insertar los productos de cada pedido
        for (const product of order.products) {
          await sql`
            INSERT INTO pedido_productos (
              pedido_id, codigo, descripcion, categoria, ubicacion,
              cantidad, valor_unitario, subtotal, devuelto
            ) VALUES (
              ${order.id},
              ${product.codigo},
              ${product.descripcion},
              ${product.categoria},
              ${product.ubicacion},
              ${product.cantidad},
              ${product.valorUnitario},
              ${product.subtotal},
              ${product.devuelto}
            )
          `
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      message: `${planillas.length} planillas creadas exitosamente`
    })

  } catch (error) {
    console.error("[v0] Error creating planillas:", error)
    return NextResponse.json(
      { error: "Error al crear planillas: " + (error as Error).message },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const sql = getDB()
    
    // Obtener todas las planillas con sus pedidos
    const planillas = await sql`
      SELECT 
        p.*,
        json_agg(
          json_build_object(
            'id', ped.id,
            'cliente', ped.cliente,
            'ruta', ped.ruta,
            'fecha', ped.fecha,
            'entregador', ped.entregador,
            'estado', ped.estado,
            'totalOriginal', ped.total_original,
            'totalActual', ped.total_actual,
            'products', (
              SELECT json_agg(
                json_build_object(
                  'codigo', pp.codigo,
                  'descripcion', pp.descripcion,
                  'categoria', pp.categoria,
                  'ubicacion', pp.ubicacion,
                  'cantidad', pp.cantidad,
                  'valorUnitario', pp.valor_unitario,
                  'subtotal', pp.subtotal,
                  'devuelto', pp.devuelto
                )
              )
              FROM pedido_productos pp
              WHERE pp.pedido_id = ped.id
            )
          )
        ) as orders
      FROM planillas p
      LEFT JOIN pedidos ped ON ped.planilla_id = p.id
      GROUP BY p.id
      ORDER BY p.fecha DESC, p.ruta
    `

    return NextResponse.json(planillas)

  } catch (error) {
    console.error("[v0] Error fetching planillas:", error)
    return NextResponse.json(
      { error: "Error al obtener planillas" },
      { status: 500 }
    )
  }
}
