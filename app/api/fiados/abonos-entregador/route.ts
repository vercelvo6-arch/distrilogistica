import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// GET /api/fiados/abonos-entregador?entregador=X
// Devuelve los abonos que el entregador registró en ruta y que ningún cuadre
// ha usado todavía. Usado por caja para precargar los cobrosVinculados automáticamente.
//
// ✅ Sin filtro de fecha a propósito: un entregador puede estar varios días en
// ruta antes de que caja haga el cuadre, así que cualquier abono sin usar
// (planilla_cobro_id IS NULL) debe seguir apareciendo sin importar cuántos
// días hayan pasado desde que se registró.
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entregador = searchParams.get('entregador')

    if (!entregador) {
      return NextResponse.json({ error: 'entregador requerido' }, { status: 400 })
    }

    const sql = getDB()

    const abonos = await sql`
      SELECT
        af.id,
        af.pedido_id,
        af.monto_abono     AS monto_efectivo,
        af.monto_nequi,
        af.metodo_pago,
        af.referencia_pago,
        af.fecha_abono,
        af.entregador_cobro,
        f.id               AS fiado_id,
        f.cliente,
        f.ruta,
        f.saldo_pendiente,
        f.estado
      FROM abonos_fiados af
      JOIN fiados f ON f.id = af.pedido_id::integer
      WHERE af.entregador_cobro = ${entregador}
        AND af.planilla_cobro_id IS NULL
      ORDER BY af.fecha_abono DESC
    `

    return NextResponse.json({ success: true, abonos })

  } catch (error) {
    return handleDBError(error, 'ABONOS_ENTREGADOR_GET')
  }
}
