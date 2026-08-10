import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"
import { handleDBError } from "@/lib/db-helpers"

const ROLES_PERMITIDOS = ["coordinador", "caja", "administrador"]

// GET: listar eliminaciones aún no restauradas
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const sql = getDB()

    const filas = await sql`
      SELECT id, tipo_entidad, entidad_id, contexto, motivo,
             eliminado_por_nombre, eliminado_en
      FROM eliminaciones_historial
      WHERE restaurado = false
      ORDER BY eliminado_en DESC
      LIMIT 100
    `

    return NextResponse.json({ success: true, eliminaciones: filas })

  } catch (error) {
    return handleDBError(error, "ELIMINACIONES_HISTORIAL_GET")
  }
}

// POST: restaurar una eliminación por su id
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 })
    }

    const sql = getDB()

    const [registro] = await sql`
      SELECT id, tipo_entidad, entidad_id, snapshot, restaurado
      FROM eliminaciones_historial
      WHERE id = ${id}
    `

    if (!registro) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 })
    }
    if (registro.restaurado) {
      return NextResponse.json({ error: "Este registro ya fue restaurado" }, { status: 409 })
    }

    const snapshot = registro.snapshot

    await sql`BEGIN`
    try {
      if (registro.tipo_entidad === "planilla") {
        if (snapshot.planilla) {
          await sql`
            INSERT INTO planillas
            SELECT * FROM jsonb_populate_record(NULL::planillas, ${JSON.stringify(snapshot.planilla)}::jsonb)
            ON CONFLICT (id) DO NOTHING
          `
        }
        for (const item of snapshot.pedidos || []) {
          if (item.pedido) {
            await sql`
              INSERT INTO pedidos
              SELECT * FROM jsonb_populate_record(NULL::pedidos, ${JSON.stringify(item.pedido)}::jsonb)
              ON CONFLICT (id) DO NOTHING
            `
          }
          for (const prod of item.productos || []) {
            await sql`
              INSERT INTO pedido_productos
              SELECT * FROM jsonb_populate_record(NULL::pedido_productos, ${JSON.stringify(prod)}::jsonb)
              ON CONFLICT (id) DO NOTHING
            `
          }
        }
      } else if (registro.tipo_entidad === "pedido") {
        if (snapshot.pedido) {
          await sql`
            INSERT INTO pedidos
            SELECT * FROM jsonb_populate_record(NULL::pedidos, ${JSON.stringify(snapshot.pedido)}::jsonb)
            ON CONFLICT (id) DO NOTHING
          `
        }
        for (const prod of snapshot.productos || []) {
          await sql`
            INSERT INTO pedido_productos
            SELECT * FROM jsonb_populate_record(NULL::pedido_productos, ${JSON.stringify(prod)}::jsonb)
            ON CONFLICT (id) DO NOTHING
          `
        }
      } else if (registro.tipo_entidad === "novedad") {
        if (snapshot.novedad) {
          await sql`
            INSERT INTO novedades_pedido
            SELECT * FROM jsonb_populate_record(NULL::novedades_pedido, ${JSON.stringify(snapshot.novedad)}::jsonb)
            ON CONFLICT (id) DO NOTHING
          `
        }
      } else {
        throw new Error(`tipo_entidad desconocido: ${registro.tipo_entidad}`)
      }

      await sql`
        UPDATE eliminaciones_historial SET
          restaurado = true,
          restaurado_por = ${session.user.id},
          restaurado_en = NOW()
        WHERE id = ${id}
      `

      await sql`COMMIT`
    } catch (txError) {
      await sql`ROLLBACK`
      throw txError
    }

    return NextResponse.json({
      success: true,
      mensaje: "Restaurado correctamente",
      tipo_entidad: registro.tipo_entidad,
      entidad_id: registro.entidad_id,
    })

  } catch (error) {
    return handleDBError(error, "ELIMINACIONES_HISTORIAL_RESTAURAR")
  }
}
