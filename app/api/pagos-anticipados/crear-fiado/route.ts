import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pagos-anticipados/crear-fiado
// Registra manualmente un fiado histórico que un entregador dejó pendiente
// y nunca quedó en el sistema. No depende de ningún pedido — fiados.pedido_id
// es opcional — así que queda visible de inmediato en la búsqueda de fiados
// que ya usa el flujo de "Registrar pago", sin tocar ningún otro endpoint.
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
    const { cliente, entregador, ruta, monto, fecha, observaciones } = body

    const clienteLimpio = String(cliente || '').trim()
    if (!clienteLimpio) {
      return NextResponse.json({ error: 'cliente es requerido' }, { status: 400 })
    }

    const entregadorLimpio = String(entregador || '').trim()
    if (!entregadorLimpio) {
      return NextResponse.json({ error: 'entregador es requerido' }, { status: 400 })
    }

    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) {
      return NextResponse.json({ error: 'monto debe ser mayor a 0' }, { status: 400 })
    }

    const rutaLimpia = ruta ? String(ruta).trim() || null : null
    const fechaLimpia = fecha ? String(fecha) : new Date().toISOString().split('T')[0]

    const sql = getDB()

    const [fiado] = await sql`
      INSERT INTO fiados (
        cliente, entregador, ruta, monto_total, saldo_pendiente,
        fecha_fiado, estado, observaciones
      ) VALUES (
        ${clienteLimpio}, ${entregadorLimpio}, ${rutaLimpia}, ${montoNum}, ${montoNum},
        ${fechaLimpia}, 'pendiente', ${observaciones?.trim() || null}
      )
      RETURNING *
    `

    return NextResponse.json({ success: true, fiado })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_CREAR_FIADO')
  }
}
