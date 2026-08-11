import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pagos-anticipados/buscar-destino?q=texto&monto=numero
// Busca posibles destinos para identificar a qué corresponde un pago anticipado:
//   - fiados con saldo pendiente (cualquier entregador)
//   - pedidos de planillas de asesor (planillas.es_asesor = true) en estado 'pendiente'
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    const montoParam = searchParams.get('monto')
    const monto = montoParam !== null && montoParam !== '' ? Number(montoParam) : null

    const sql = getDB()

    // ── Fiados con saldo pendiente ──────────────────────────────────────────
    let fiados: any[] = []
    if (q && monto !== null) {
      fiados = await sql`
        SELECT id, cliente, ruta, saldo_pendiente, entregador
        FROM fiados
        WHERE eliminado IS NOT TRUE
          AND estado IN ('pendiente', 'abono_parcial')
          AND saldo_pendiente > 0
          AND (cliente ILIKE ${'%' + q + '%'} OR saldo_pendiente = ${monto})
        ORDER BY fecha_fiado DESC
        LIMIT 15
      `
    } else if (q) {
      fiados = await sql`
        SELECT id, cliente, ruta, saldo_pendiente, entregador
        FROM fiados
        WHERE eliminado IS NOT TRUE
          AND estado IN ('pendiente', 'abono_parcial')
          AND saldo_pendiente > 0
          AND cliente ILIKE ${'%' + q + '%'}
        ORDER BY fecha_fiado DESC
        LIMIT 15
      `
    } else if (monto !== null) {
      fiados = await sql`
        SELECT id, cliente, ruta, saldo_pendiente, entregador
        FROM fiados
        WHERE eliminado IS NOT TRUE
          AND estado IN ('pendiente', 'abono_parcial')
          AND saldo_pendiente > 0
          AND saldo_pendiente = ${monto}
        ORDER BY fecha_fiado DESC
        LIMIT 15
      `
    }

    // ── Pedidos de planillas de asesor (incluye pedidos manuales sin planilla) ──
    let pedidosAsesor: any[] = []
    if (q && monto !== null) {
      pedidosAsesor = await sql`
        SELECT pe.id, pe.cliente, pe.total,
               COALESCE(p.entregador, pe.asesor_manual) AS asesor, p.id AS planilla_id
        FROM pedidos pe
        LEFT JOIN planillas p ON pe.planilla_id = p.id
        WHERE (p.es_asesor = true OR (pe.planilla_id IS NULL AND pe.asesor_manual IS NOT NULL))
          AND pe.estado = 'pendiente'
          AND (pe.cliente ILIKE ${'%' + q + '%'} OR pe.total = ${monto} OR pe.asesor_manual ILIKE ${'%' + q + '%'} OR p.entregador ILIKE ${'%' + q + '%'})
        ORDER BY pe.created_at DESC
        LIMIT 15
      `
    } else if (q) {
      pedidosAsesor = await sql`
        SELECT pe.id, pe.cliente, pe.total,
               COALESCE(p.entregador, pe.asesor_manual) AS asesor, p.id AS planilla_id
        FROM pedidos pe
        LEFT JOIN planillas p ON pe.planilla_id = p.id
        WHERE (p.es_asesor = true OR (pe.planilla_id IS NULL AND pe.asesor_manual IS NOT NULL))
          AND pe.estado = 'pendiente'
          AND (pe.cliente ILIKE ${'%' + q + '%'} OR pe.asesor_manual ILIKE ${'%' + q + '%'} OR p.entregador ILIKE ${'%' + q + '%'})
        ORDER BY pe.created_at DESC
        LIMIT 15
      `
    } else if (monto !== null) {
      pedidosAsesor = await sql`
        SELECT pe.id, pe.cliente, pe.total,
               COALESCE(p.entregador, pe.asesor_manual) AS asesor, p.id AS planilla_id
        FROM pedidos pe
        LEFT JOIN planillas p ON pe.planilla_id = p.id
        WHERE (p.es_asesor = true OR (pe.planilla_id IS NULL AND pe.asesor_manual IS NOT NULL))
          AND pe.estado = 'pendiente'
          AND pe.total = ${monto}
        ORDER BY pe.created_at DESC
        LIMIT 15
      `
    }

    const resultados = [
      ...fiados.map((f: any) => ({
        tipo: 'fiado' as const,
        id: f.id,
        cliente: f.cliente,
        monto_referencia: f.saldo_pendiente,
        entregador_vinculado: f.entregador,
        ruta: f.ruta,
      })),
      ...pedidosAsesor.map((p: any) => ({
        tipo: 'pedido_asesor' as const,
        id: p.id,
        cliente: p.cliente,
        monto_referencia: p.total,
        entregador_vinculado: p.asesor,
        planilla_id: p.planilla_id,
      })),
    ]

    return NextResponse.json({ success: true, resultados })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_BUSCAR_DESTINO')
  }
}
