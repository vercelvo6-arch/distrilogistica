import { NextRequest, NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"

const ROLES_PERMITIDOS = ["alistador", "coordinador", "administrador"]

// POST /api/faltantes/baja-en-bloque { ids: string[], motivo: string }
//
// Saca de "pendientes" varios faltantes a la vez cuando ya no se van a entregar: quedan en estado
// "definitivo" (el mismo que usa el coordinador al subsanar uno por uno), con el motivo, quién y
// cuándo. NO se borra nada: siguen en el historial y se pueden revertir con "Revertir".
// Solo cambia los que siguen pendientes (los ya resueltos no se tocan). Si la planilla todavía
// conserva sus pedidos, esos productos pasan a "no alistado", igual que en la subsanación definitiva.
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { ids, motivo } = await request.json()
    const lista: string[] = Array.isArray(ids) ? Array.from(new Set(ids.map((x: any) => String(x)))) : []
    const motivoLimpio = String(motivo || "").trim()
    if (lista.length === 0) {
      return NextResponse.json({ error: "Selecciona al menos un faltante" }, { status: 400 })
    }
    if (lista.length > 2000) {
      return NextResponse.json({ error: "Son demasiados a la vez (máximo 2000). Filtra por fecha o entregador." }, { status: 400 })
    }
    if (!motivoLimpio) {
      return NextResponse.json({ error: "Escribe el motivo" }, { status: 400 })
    }

    const sql = getDB()
    const quien = String(session.user.id)
    const texto = `Dado de baja en bloque: ${motivoLimpio}`

    const [r] = (await sql`
      WITH baja AS (
        UPDATE faltantes
        SET estado = 'definitivo',
            tipo_resolucion = 'definitivo',
            cantidad_resuelta = 0,
            resuelto_por = ${quien},
            fecha_resolucion = NOW(),
            observaciones_resolucion = ${texto}
        WHERE id = ANY(${lista}::text[]) AND estado = 'pendiente'
        RETURNING id, planilla_id, codigo, cantidad_faltante
      ),
      lineas AS (
        UPDATE pedido_productos pp
        SET estado_alistamiento = 'no_alistado'
        FROM pedidos p, baja b
        WHERE pp.pedido_id = p.id
          AND COALESCE(p.planilla_mercancia_id, p.planilla_id) = b.planilla_id
          AND pp.codigo = b.codigo
        RETURNING pp.id
      ),
      auditoria AS (
        INSERT INTO audit_log (user_id, user_email, action, details)
        SELECT ${quien}, ${session.user.email ?? null}, 'faltantes_baja_en_bloque',
               jsonb_build_object('motivo', ${motivoLimpio}::text, 'ids', (SELECT jsonb_agg(id) FROM baja),
                                  'unidades', (SELECT COALESCE(SUM(cantidad_faltante), 0) FROM baja))
        WHERE EXISTS (SELECT 1 FROM baja)
        RETURNING 1
      )
      SELECT (SELECT COUNT(*) FROM baja)::int AS dados_de_baja,
             (SELECT COALESCE(SUM(cantidad_faltante), 0) FROM baja)::int AS unidades,
             (SELECT COUNT(*) FROM lineas)::int AS lineas_actualizadas
    `) as any[]

    return NextResponse.json({
      success: true,
      mensaje: `${r.dados_de_baja} faltantes dados de baja (${r.unidades} unidades)`,
      ...r,
      omitidos: lista.length - r.dados_de_baja,
    })
  } catch (error) {
    console.error("[FALTANTES BAJA EN BLOQUE] ERROR:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al dar de baja" },
      { status: 500 }
    )
  }
}
