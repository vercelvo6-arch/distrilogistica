import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'
import { confirmarPagoAdministrativo } from '@/lib/pago-administrativo'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/pagos-anticipados/[id]/identificar
// Marca a qué fiado o pedido de asesor corresponde un pago anticipado y a qué
// entregador queda vinculado, y lo CONFIRMA de una vez: baja el fiado, deja el cobro
// a nombre del entregador y registra su comisión (lib/pago-administrativo.ts). Ya no
// espera al cuadre de caja: quien identifica está autorizado por quien cuadra caja.
// Si algo impide aplicarlo (fiado ya pagado, excede el saldo…), queda 'identificado'
// y se avisa, para corregirlo y confirmarlo después.
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
        entregador_vinculado = ${entregadorVinculado ? String(entregadorVinculado).trim() : null},
        estado               = 'identificado'
      WHERE id = ${pagoId} AND estado <> 'vinculado'
    `

    const r = await confirmarPagoAdministrativo(pagoId, { id: session.user.id, nombre: session.user.nombre })
    if (!r.ok) {
      return NextResponse.json(
        { error: `Quedó identificado, pero no se confirmó: ${r.error}`, codigo: r.codigo },
        { status: r.status }
      )
    }
    return NextResponse.json({ success: true, mensaje: r.mensaje, aviso: r.aviso })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_IDENTIFICAR')
  }
}
