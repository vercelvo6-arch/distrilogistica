import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/planillas/consignaciones-entregador?entregador=X&fecha=YYYY-MM-DD
// Consignaciones que el entregador registró en ruta (registrar-consignacion) y
// que todavía no se han usado en ningún cuadre — para precargarlas en el modal
// de cuadre agrupado de caja. Mismo rol que /api/fiados/abonos-entregador
// cumple para los cobros CxC.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entregador = searchParams.get('entregador')
    const fecha = searchParams.get('fecha')

    if (!entregador) {
      return NextResponse.json({ error: 'entregador es requerido' }, { status: 400 })
    }

    const sql = getDB()

    const consignaciones = fecha
      ? await sql`
          SELECT id, pedido_id, planilla_id, cliente, banco, numero, monto, fecha
          FROM consignaciones_pedido
          WHERE entregador = ${entregador}
            AND fecha = ${fecha}::date
            AND cuadre_caja_id IS NULL
          ORDER BY registrado_en DESC
        `
      : await sql`
          SELECT id, pedido_id, planilla_id, cliente, banco, numero, monto, fecha
          FROM consignaciones_pedido
          WHERE entregador = ${entregador}
            AND cuadre_caja_id IS NULL
          ORDER BY registrado_en DESC
        `

    return NextResponse.json({ success: true, consignaciones })
  } catch (error) {
    return handleDBError(error, 'CONSIGNACIONES_ENTREGADOR_GET')
  }
}
