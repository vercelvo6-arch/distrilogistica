import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'
import { aplicarPagosPendientes } from '@/lib/pago-administrativo'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pagos-anticipados/aplicar-pendientes
// Lo llama solo la pantalla de Cuadre Administrativo al abrirse: aplica los pagos que
// quedaron 'identificado' sin bajar el fiado. Devuelve cuántos aplicó y cuáles no (con
// el motivo). Si no hay pendientes no hace nada.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const r = await aplicarPagosPendientes({ id: session.user.id, nombre: session.user.nombre })
    return NextResponse.json({ success: true, ...r })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_APLICAR_PENDIENTES')
  }
}
