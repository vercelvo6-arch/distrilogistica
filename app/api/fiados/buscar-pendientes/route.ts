import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fiados/buscar-pendientes?q=texto
// Búsqueda libre de CUALQUIER fiado con saldo pendiente, sin importar a quién
// esté asignado — para que un entregador pueda registrar el cobro de un
// cliente aunque nadie se lo haya asignado antes. Mismo patrón de consulta
// que la rama caja/admin de /api/fiados/asignar-cobro, sin el filtro de
// entregador_asignado.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()

    if (!q) {
      return NextResponse.json({ success: true, cobros: [] })
    }

    const sql = getDB()

    const cobrosFiados = await sql`
      SELECT
        f.id::text          AS id,
        f.cliente,
        f.ruta,
        f.entregador        AS entregador_origen,
        f.monto_total,
        f.monto_pagado,
        f.saldo_pendiente,
        f.estado,
        f.fecha_fiado,
        f.entregador_asignado,
        'fiados'            AS origen
      FROM fiados f
      WHERE f.eliminado IS NOT TRUE
        AND f.estado IN ('pendiente', 'abono_parcial')
        AND f.saldo_pendiente > 0
        AND (f.cliente ILIKE ${'%' + q + '%'} OR f.ruta ILIKE ${'%' + q + '%'})
      ORDER BY f.fecha_fiado DESC
      LIMIT 20
    `

    return NextResponse.json({ success: true, cobros: cobrosFiados })
  } catch (error) {
    return handleDBError(error, 'FIADOS_BUSCAR_PENDIENTES')
  }
}
