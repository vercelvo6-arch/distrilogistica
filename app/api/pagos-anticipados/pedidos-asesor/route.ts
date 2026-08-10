import { NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pagos-anticipados/pedidos-asesor
// Todos los pedidos pendientes de planillas marcadas como "de asesor" —
// base para el panel de rendición de cuentas por asesor en Cuadre Administrativo.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()

    const pedidos = await sql`
      SELECT pe.id, pe.cliente, pe.total, pe.created_at,
             p.nombre_asesor AS asesor, p.id AS planilla_id, p.tipo_ruta AS ruta, p.fecha
      FROM pedidos pe
      JOIN planillas p ON pe.planilla_id = p.id
      WHERE p.es_asesor = true AND pe.estado = 'pendiente'
      ORDER BY p.nombre_asesor, pe.created_at DESC
    `

    return NextResponse.json({ success: true, pedidos })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_PEDIDOS_ASESOR')
  }
}
