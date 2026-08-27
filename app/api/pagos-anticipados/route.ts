import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'
import { buscarReferenciasUsadas } from '@/lib/validar-referencia'

const ROLES_PERMITIDOS = ['caja', 'administrador']

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/pagos-anticipados
// Registra un voucher/transferencia que llegó antes del cuadre de caja.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { medioPago, referencia, monto, cliente, observaciones, destinoTipo, destinoId, entregadorVinculado, fechaPago, numeroFactura } = body

    const medioPagoLimpio = String(medioPago || '').trim()
    if (!medioPagoLimpio) {
      return NextResponse.json({ error: 'medioPago es requerido' }, { status: 400 })
    }

    // La referencia (número de consignación/transacción) solo tiene sentido para
    // medios electrónicos — un pago en Efectivo no tiene ningún número que registrar.
    const referenciaLimpia = String(referencia || '').trim()
    if (medioPagoLimpio !== 'Efectivo' && !referenciaLimpia) {
      return NextResponse.json({ error: 'referencia es requerida para este medio de pago' }, { status: 400 })
    }

    const montoNum = Number(monto)
    if (!montoNum || montoNum <= 0) {
      return NextResponse.json({ error: 'monto debe ser mayor a 0' }, { status: 400 })
    }

    const sql = getDB()

    // ✅ Antifraude: la misma referencia no puede reutilizarse para cobrar dos veces,
    // sin importar si la primera vez fue una consignación (cuadre cerrado o todavía
    // pendiente en ruta), un abono de fiado o otro pago anticipado.
    if (referenciaLimpia) {
      const yaUsada = await buscarReferenciasUsadas([referenciaLimpia])
      if (yaUsada.length > 0) {
        return NextResponse.json(
          { error: `La referencia ${referenciaLimpia} ya fue registrada antes. Verifique el comprobante.` },
          { status: 409 }
        )
      }
    }

    const clienteLimpio = cliente ? String(cliente).trim() : null
    const fechaPagoLimpia = fechaPago ? String(fechaPago) : new Date().toISOString().split('T')[0]
    const numeroFacturaLimpio = numeroFactura ? String(numeroFactura).trim() || null : null

    // Si caja ya identificó el destino en el propio formulario de registro
    // (búsqueda de fiado o de pedido de asesor), el pago nace directamente
    // en estado 'identificado' — sin destino, nace 'pendiente' como antes.
    const destinoTipoLimpio = destinoTipo === 'fiado' || destinoTipo === 'pedido_asesor' ? destinoTipo : null
    const tieneDestino = destinoTipoLimpio && destinoId && entregadorVinculado

    const [pago] = tieneDestino
      ? await sql`
          INSERT INTO pagos_anticipados (
            medio_pago, referencia, monto, cliente, registrado_por, observaciones,
            tipo, fiado_id, pedido_id, entregador_vinculado, estado,
            fecha_pago, numero_factura
          ) VALUES (
            ${medioPagoLimpio}, ${referenciaLimpia || null}, ${montoNum},
            ${clienteLimpio}, ${session.user.nombre}, ${observaciones?.trim() || null},
            ${destinoTipoLimpio},
            ${destinoTipoLimpio === 'fiado' ? String(destinoId) : null},
            ${destinoTipoLimpio === 'pedido_asesor' ? String(destinoId) : null},
            ${String(entregadorVinculado)},
            'identificado',
            ${fechaPagoLimpia}, ${numeroFacturaLimpio}
          )
          RETURNING *
        `
      : await sql`
          INSERT INTO pagos_anticipados (
            medio_pago, referencia, monto, cliente, registrado_por, observaciones,
            fecha_pago, numero_factura
          ) VALUES (
            ${medioPagoLimpio}, ${referenciaLimpia || null}, ${montoNum},
            ${clienteLimpio}, ${session.user.nombre}, ${observaciones?.trim() || null},
            ${fechaPagoLimpia}, ${numeroFacturaLimpio}
          )
          RETURNING *
        `

    // Si ya se identificó el destino explícitamente no hace falta buscar coincidencias.
    const coincidencias = tieneDestino
      ? []
      : clienteLimpio
        ? await sql`
            SELECT id, cliente, ruta, saldo_pendiente, entregador, fecha_fiado
            FROM fiados
            WHERE eliminado IS NOT TRUE
              AND estado IN ('pendiente', 'abono_parcial')
              AND saldo_pendiente > 0
              AND (cliente ILIKE ${'%' + clienteLimpio + '%'} OR saldo_pendiente = ${montoNum})
            ORDER BY fecha_fiado DESC
            LIMIT 10
          `
        : await sql`
            SELECT id, cliente, ruta, saldo_pendiente, entregador, fecha_fiado
            FROM fiados
            WHERE eliminado IS NOT TRUE
              AND estado IN ('pendiente', 'abono_parcial')
              AND saldo_pendiente > 0
              AND saldo_pendiente = ${montoNum}
            ORDER BY fecha_fiado DESC
            LIMIT 10
          `

    return NextResponse.json({ success: true, pago, coincidencias })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_POST')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/pagos-anticipados?estado=pendiente&entregador=nombre
// Lista los pagos anticipados, opcionalmente filtrados por estado y/o por el
// entregador al que quedaron vinculados (usado por el modal de cuadre de caja).
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
    const estado = searchParams.get('estado')
    const entregador = searchParams.get('entregador')

    const sql = getDB()
    let pagos
    if (estado && entregador) {
      pagos = await sql`
        SELECT * FROM pagos_anticipados
        WHERE estado = ${estado} AND entregador_vinculado = ${entregador}
        ORDER BY registrado_en DESC
      `
    } else if (estado) {
      pagos = await sql`SELECT * FROM pagos_anticipados WHERE estado = ${estado} ORDER BY registrado_en DESC`
    } else if (entregador) {
      pagos = await sql`
        SELECT * FROM pagos_anticipados WHERE entregador_vinculado = ${entregador} ORDER BY registrado_en DESC
      `
    } else {
      pagos = await sql`SELECT * FROM pagos_anticipados ORDER BY registrado_en DESC`
    }

    return NextResponse.json({ success: true, pagos })
  } catch (error) {
    return handleDBError(error, 'PAGOS_ANTICIPADOS_GET')
  }
}
