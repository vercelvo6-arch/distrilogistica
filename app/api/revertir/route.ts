import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { handleDBError } from "@/lib/db-helpers"
import { registrarSnapshotNovedad } from "@/lib/eliminaciones-historial"

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

    // Identificar la última novedad del pedido (la que se va a borrar)
    const [ultimaNovedad] = await sql`
      SELECT id FROM novedades_pedido
      WHERE pedido_id = ${pedidoId}
      ORDER BY created_at DESC
      LIMIT 1
    `

    await sql`BEGIN`
    try {
      if (ultimaNovedad) {
        await registrarSnapshotNovedad(
          sql,
          ultimaNovedad.id,
          { id: session.user.id, nombre: session.user.nombre },
          "revertir"
        )

        await sql`
          DELETE FROM novedades_pedido
          WHERE id = ${ultimaNovedad.id}
        `
      }

      // Revertir estado del pedido a pendiente
      await sql`
        UPDATE pedidos SET
          estado          = 'pendiente',
          monto_pagado    = 0,
          saldo_pendiente = total,
          updated_at      = NOW()
        WHERE id = ${pedidoId}
      `

      await sql`COMMIT`
    } catch (txError) {
      await sql`ROLLBACK`
      throw txError
    }

    return NextResponse.json({
      success: true,
      mensaje: "Pedido revertido a pendiente"
    })

  } catch (error) {
    return handleDBError(error, "NOVEDADES_REVERTIR")
  }
}
