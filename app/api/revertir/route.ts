import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { handleDBError } from "@/lib/db-helpers"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    if (!["caja", "administrador"].includes(session.user.rol)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { pedidoId } = await request.json()

    if (!pedidoId) {
      return NextResponse.json({ error: "pedidoId requerido" }, { status: 400 })
    }

    const sql = getDB()

    // Borrar la última novedad del pedido
    await sql`
      DELETE FROM novedades_pedido
      WHERE id = (
        SELECT id FROM novedades_pedido
        WHERE pedido_id = ${pedidoId}
        ORDER BY created_at DESC
        LIMIT 1
      )
    `

    // Revertir estado del pedido a pendiente
    await sql`
      UPDATE pedidos SET
        estado          = 'pendiente',
        monto_pagado    = 0,
        saldo_pendiente = total,
        updated_at      = NOW()
      WHERE id = ${pedidoId}
    `

    return NextResponse.json({
      success: true,
      mensaje: "Pedido revertido a pendiente"
    })

  } catch (error) {
    return handleDBError(error, "NOVEDADES_REVERTIR")
  }
}
