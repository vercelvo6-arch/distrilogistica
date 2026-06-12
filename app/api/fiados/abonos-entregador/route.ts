import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// GET /api/fiados/abonos-entregador?entregador=X&fecha=YYYY-MM-DD
// Devuelve los abonos que el entregador registró en ruta en una fecha dada
// Usado por caja para precargar los cobrosVinculados automáticamente
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entregador = searchParams.get('entregador')
    const fecha      = searchParams.get('fecha') || new Date().toISOString().split('T')[0]

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
        AND DATE(af.fecha_abono AT TIME ZONE 'America/Bogota') = ${fecha}::date
        AND af.planilla_cobro_id IS NULL  -- solo los registrados en ruta (no en cuadre)
      ORDER BY af.fecha_abono DESC
    `

    return NextResponse.json({ success: true, abonos })

  } catch (error) {
    return handleDBError(error, 'ABONOS_ENTREGADOR_GET')
  }
}
