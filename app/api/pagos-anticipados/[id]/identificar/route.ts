import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/pagos-anticipados/[id]/identificar
// Marca a qué fiado o pedido de asesor corresponde un pago anticipado, y a qué
// entregador queda vinculado. NO mueve dinero todavía — no crea abono ni toca
// saldos: eso solo ocurre cuando caja confirma el cuadre de ese entregador
// (ver /api/cuadres-caja). El pago pasa de 'pendiente' a 'identificado'.
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await params
    const pagoId = parseInt(id, 10)
    if (isNaN(pagoId) || pagoId <= 0) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const body = await request.json()
    const { destinoTipo, destinoId, entregadorVinculado } = body

    if (destinoTipo !== 'fiado' && destinoTipo !== 'pedido_asesor') {
      return NextResponse.json({ error: "destinoTipo debe ser 'fiado' o 'pedido_asesor'" }, { status: 400 })
    }
    if (!destinoId) {
      return NextResponse.json({ error: 'destinoId es requerido' }, { status: 400 })
    }
    if (!entregadorVinculado) {
      return NextResponse.json({ error: 'entregadorVinculado es requerido' }, { status: 400 })
    }

    const sql = getDB()

    const [pago] = await sql`SELECT * FROM pagos_anticipados WHERE id = ${pagoId}`
    if (!pago) {
      return NextResponse.json({ error: 'Registro de cuadre administrativo no encontrado' }, { status: 404 })
    }
    if (pago.estado === 'vinculado') {
      return NextResponse.json({ error: 'Este pago ya fue vinculado en un cuadre' }, { status: 409 })
    }

    await sql`
      UPDATE pagos_anticipados SET
        tipo                 = ${destinoTipo},
        fiado_id             = ${destinoTipo === 'fiado' ? String(destinoId) : null},
        pedido_id            = ${destinoTipo === 'pedido_asesor' ? String(destinoId) : null},
        entregador_vinculado = ${String(entregadorVinculado)},
        estado               = 'identificado'
      WHERE id = ${pagoId}
    `

    return NextResponse.json({
      success: true,
      mensaje: `Pago identificado — quedará disponible en el cuadre de ${entregadorVinculado}`,
    })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_IDENTIFICAR')
  }
}
