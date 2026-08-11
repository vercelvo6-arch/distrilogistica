import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pagos-anticipados/crear-pedido-asesor
// Registra manualmente un pedido de asesor que nunca tuvo planilla (venta
// facturada antes de este módulo, o que nunca se cargó). Queda pendiente,
// visible en el panel de asesores y pagable por el flujo normal de
// "Registrar pago".
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { ruta, cliente, monto, asesor, fecha, observaciones } = body

    const clienteLimpio = String(cliente || '').trim()
    if (!clienteLimpio) {
      return NextResponse.json({ error: 'cliente es requerido' }, { status: 400 })
    }

    const asesorLimpio = String(asesor || '').trim()
    if (!asesorLimpio) {
      return NextResponse.json({ error: 'asesor es requerido' }, { status: 400 })
    }

    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) {
      return NextResponse.json({ error: 'monto debe ser mayor a 0' }, { status: 400 })
    }

    const rutaLimpia = ruta ? String(ruta).trim() || null : null
    const fechaLimpia = fecha ? String(fecha) : new Date().toISOString().split('T')[0]

    const sql = getDB()

    const pedidoId = `PED${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`

    const [pedido] = await sql`
      INSERT INTO pedidos (
        id, planilla_id, cliente, total, estado, secuencia,
        asesor_manual, ruta_manual, fecha_manual, observaciones
      ) VALUES (
        ${pedidoId}, NULL, ${clienteLimpio}, ${montoNum}, 'pendiente', 1,
        ${asesorLimpio}, ${rutaLimpia}, ${fechaLimpia}, ${observaciones?.trim() || null}
      )
      RETURNING *
    `

    return NextResponse.json({ success: true, pedido })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_CREAR_PEDIDO_ASESOR')
  }
}
