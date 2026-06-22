import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fiados/asignar-cobro
// Mantiene la asignación manual para casos especiales desde admin/caja
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['administrador', 'caja'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { fiadoId, entregador, cuadreId } = body

    if (!fiadoId || !entregador) {
      return NextResponse.json(
        { error: 'fiadoId y entregador son requeridos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    const [fiado] = await sql`
      SELECT id, cliente, monto_total, monto_pagado, saldo_pendiente, estado, ruta
      FROM fiados
      WHERE id = ${Number(fiadoId)}
        AND (eliminado IS NULL OR eliminado = false)
        AND estado IN ('pendiente', 'abono_parcial')
        AND saldo_pendiente > 0
    `

    if (!fiado) {
      return NextResponse.json(
        { error: 'Fiado no encontrado o sin saldo pendiente' },
        { status: 404 }
      )
    }

    await sql`
      UPDATE fiados SET
        entregador_asignado  = ${entregador},
        fecha_asignacion     = NOW(),
        planilla_asignado_id = ${cuadreId ? String(cuadreId) : null},
        updated_at           = NOW()
      WHERE id = ${Number(fiadoId)}
    `

    return NextResponse.json({
      success: true,
      mensaje: 'Cobro vinculado al entregador',
      cobro: {
        id:              fiado.id,
        cliente:         fiado.cliente,
        saldo_pendiente: fiado.saldo_pendiente,
        entregador,
        ruta:            fiado.ruta,
      }
    })

  } catch (error) {
    return handleDBError(error, 'ASIGNAR_COBRO')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/fiados/asignar-cobro?entregador=X&rol=Y&fecha=YYYY-MM-DD
//
// rol=entregador → cobros de las rutas que el entregador tiene HOY
//                  (automático por ruta, sin asignación manual)
// rol=caja/admin → todos los disponibles para gestionar
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const busqueda   = searchParams.get('busqueda')
    const entregador = searchParams.get('entregador')
    const rol        = searchParams.get('rol') || session.user.rol
    const fecha      = searchParams.get('fecha') || new Date().toISOString().split('T')[0]

    const sql = getDB()
    const esEntregador = rol === 'entregador'

    if (esEntregador && entregador) {
      // ── Solo cobros asignados explícitamente por admin/caja ───────────────
      const cobros = await sql`
        SELECT
          f.id,
          f.cliente,
          f.ruta,
          f.entregador        AS entregador_origen,
          f.monto_total,
          f.monto_pagado,
          f.saldo_pendiente,
          f.estado,
          f.fecha_fiado,
          f.entregador_asignado,
          COALESCE(
            (SELECT SUM(monto_abono) FROM abonos_fiados WHERE pedido_id = f.id::text),
            0
          ) AS total_abonado
        FROM fiados f
        WHERE f.eliminado IS NOT TRUE
          AND f.estado IN ('pendiente', 'abono_parcial')
          AND f.saldo_pendiente > 0
          AND f.entregador_asignado = ${entregador}
          ${busqueda ? sql`
            AND (
              f.cliente ILIKE ${'%' + busqueda + '%'}
              OR f.ruta  ILIKE ${'%' + busqueda + '%'}
            )
          ` : sql``}
        ORDER BY f.ruta ASC, f.fecha_fiado ASC, f.cliente ASC
      `

      return NextResponse.json({ success: true, cobros })
    }

    // ── Caja/Admin: todos los disponibles (tabla fiados + pedidos huérfanos) ─
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
        'fiados'            AS origen,
        COALESCE(
          (SELECT SUM(monto_abono) FROM abonos_fiados WHERE pedido_id = f.id::text),
          0
        ) AS total_abonado
      FROM fiados f
      WHERE f.eliminado IS NOT TRUE
        AND f.estado IN ('pendiente', 'abono_parcial')
        AND f.saldo_pendiente > 0
        AND (
          f.entregador_asignado IS NULL
          OR f.entregador_asignado = ${entregador || ''}
        )
        ${busqueda ? sql`
          AND (
            f.cliente ILIKE ${'%' + busqueda + '%'}
            OR f.ruta  ILIKE ${'%' + busqueda + '%'}
          )
        ` : sql``}
    `

    // Pedidos con estado='fiado' que NUNCA se migraron a la tabla fiados
    // (mismo criterio que usa el admin en /api/fiados)
    const cobrosPedidos = await sql`
      SELECT
        p.id                AS id,
        p.cliente,
        pl.tipo_ruta         AS ruta,
        pl.entregador        AS entregador_origen,
        p.total              AS monto_total,
        COALESCE(p.monto_pagado, 0)     AS monto_pagado,
        COALESCE(p.saldo_pendiente, p.total) AS saldo_pendiente,
        p.estado,
        pl.fecha             AS fecha_fiado,
        NULL                 AS entregador_asignado,
        'pedidos'            AS origen,
        0                    AS total_abonado
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      LEFT JOIN fiados f ON f.pedido_id = p.id OR f.id::text = p.id
      WHERE p.estado = 'fiado'
        AND COALESCE(p.saldo_pendiente, p.total) > 0
        AND f.id IS NULL
        ${busqueda ? sql`
          AND (
            p.cliente ILIKE ${'%' + busqueda + '%'}
            OR pl.tipo_ruta ILIKE ${'%' + busqueda + '%'}
          )
        ` : sql``}
    `

    const cobros = [...cobrosFiados, ...cobrosPedidos].sort(
      (a: any, b: any) => new Date(a.fecha_fiado).getTime() - new Date(b.fecha_fiado).getTime()
    )

    return NextResponse.json({ success: true, cobros })

  } catch (error) {
    return handleDBError(error, 'ASIGNAR_COBRO_GET')
  }
}
