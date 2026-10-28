import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'
import { confirmarPagoAdministrativo } from '@/lib/pago-administrativo'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pagos-anticipados/[id]/confirmar
// Confirma un pago ya identificado: baja el fiado (o marca entregado el pedido de
// asesor), deja el cobro a nombre del entregador y registra su comisión. Ya no pasa
// por el cuadre de caja. Sirve para los pagos que quedaron identificados antes de
// este cambio, cuando se confirmaban dentro del cuadre del entregador.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(
  _request: NextRequest,
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

    const r = await confirmarPagoAdministrativo(pagoId, { id: session.user.id, nombre: session.user.nombre })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ success: true, mensaje: r.mensaje })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_CONFIRMAR')
  }
}
