import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/planillas/consignaciones-entregador?entregador=X
// Consignaciones que el entregador registró en ruta (registrar-consignacion) y
// que todavía no se han usado en ningún cuadre — para precargarlas en el modal
// de cuadre agrupado de caja. Mismo rol que /api/fiados/abonos-entregador
// cumple para los cobros CxC.
//
// ✅ Un entregador puede estar varios días en ruta antes de que caja haga el
// cuadre, así que cualquier consignación sin usar (cuadre_caja_id IS NULL)
// debe seguir apareciendo sin importar cuántos días hayan pasado desde que
// se registró — PERO solo a partir de CUTOFF. Antes de esa fecha hay
// consignaciones huérfanas por un bug de vinculación ya corregido (ver
// abonos-entregador) cuyo dinero ya fue entregado y contado en cuadres
// pasados; mostrarlas de nuevo aquí las haría contarse dos veces.
// ─────────────────────────────────────────────────────────────────────────────
const CUTOFF = '2026-08-27T00:00:00-05:00'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entregador = searchParams.get('entregador')

    if (!entregador) {
      return NextResponse.json({ error: 'entregador es requerido' }, { status: 400 })
    }

    const sql = getDB()

    const consignaciones = await sql`
      SELECT id, pedido_id, planilla_id, cliente, banco, numero, monto, fecha
      FROM consignaciones_pedido
      WHERE entregador = ${entregador}
        AND cuadre_caja_id IS NULL
        AND registrado_en >= ${CUTOFF}::timestamptz
      ORDER BY registrado_en DESC
    `

    return NextResponse.json({ success: true, consignaciones })
  } catch (error) {
    return handleDBError(error, 'CONSIGNACIONES_ENTREGADOR_GET')
  }
}
