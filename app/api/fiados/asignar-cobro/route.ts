import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fiados/registrar-abono
//
// Registra el resultado de un cobro CxC cuando el entregador regresa.
// Un solo camino: siempre opera sobre tabla fiados por id numérico.
// Registra: monto, medio de pago, referencia, entregador que cobró.
//
// Casos:
// - pagó todo       → estado = 'pagado_completo'
// - abono parcial   → estado = 'abono_parcial', saldo se reduce
// - no pagó nada    → llamar a /liberar-cobro en su lugar
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      fiadoId,          // id numérico de tabla fiados — ÚNICO identificador
      montoEfectivo,    // monto cobrado en efectivo
      montoNequi,       // monto cobrado por Nequi/transferencia
      referenciaPago,   // número de referencia Nequi/consignación
      entregadorCobro,  // quién fue a cobrar
      cuadreId,         // id del cuadre_caja donde se registra
      observaciones,
    } = body

    // Validaciones
    if (!fiadoId) {
      return NextResponse.json({ error: 'fiadoId es requerido' }, { status: 400 })
    }

    const efectivo = Number(montoEfectivo) || 0
    const nequi    = Number(montoNequi)    || 0
    const totalAbono = efectivo + nequi

    if (totalAbono <= 0) {
      return NextResponse.json(
        { error: 'El abono debe tener al menos un monto en efectivo o Nequi mayor a 0' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // ── 1. Obtener fiado ──────────────────────────────────────────────────────
    const [fiado] = await sql`
      SELECT id, cliente, monto_total, monto_pagado, saldo_pendiente, estado
      FROM fiados
      WHERE id = ${Number(fiadoId)}
        AND (eliminado IS NULL OR eliminado = false)
        AND estado IN ('pendiente', 'abono_parcial')
    `

    if (!fiado) {
      return NextResponse.json(
        { error: 'Fiado no encontrado o ya está pagado' },
        { status: 404 }
      )
    }

    const saldoActual = Number(fiado.saldo_pendiente)

    if (totalAbono > saldoActual) {
      return NextResponse.json(
        {
          error: `El abono ($${totalAbono.toLocaleString('es-CO')}) no puede superar el saldo pendiente ($${saldoActual.toLocaleString('es-CO')})`
        },
        { status: 400 }
      )
    }

    // ── 2. Validar referencia Nequi no duplicada (global) ────────────────────
    if (referenciaPago) {
      const [refExiste] = await sql`
        SELECT id FROM abonos_fiados
        WHERE referencia_pago = ${referenciaPago}
        LIMIT 1
      `
      if (refExiste) {
        return NextResponse.json(
          { error: `La referencia ${referenciaPago} ya fue registrada. Verifique el comprobante.` },
          { status: 409 }
        )
      }
    }

    // ── 3. Calcular nuevo estado ──────────────────────────────────────────────
    const nuevoMontoPagado = Number(fiado.monto_pagado) + totalAbono
    const nuevoSaldo       = Math.round((saldoActual - totalAbono) * 100) / 100
    const pagoCompleto     = nuevoSaldo <= 0
    const nuevoEstado      = pagoCompleto ? 'pagado_completo' : 'abono_parcial'

    // ── 4. Actualizar fiado ───────────────────────────────────────────────────
    await sql`
      UPDATE fiados SET
        monto_pagado        = ${nuevoMontoPagado},
        saldo_pendiente     = ${nuevoSaldo},
        estado              = ${nuevoEstado},
        cobrado_por         = ${session.user.id},
        entregador_asignado = ${entregadorCobro || fiado.entregador_asignado || null},
        fecha_pago_completo = ${pagoCompleto ? sql`NOW()` : sql`NULL`},
        -- Si pagó completo, liberar de la asignación
        planilla_asignado_id = ${pagoCompleto ? null : sql`planilla_asignado_id`},
        updated_at          = NOW()
      WHERE id = ${Number(fiadoId)}
    `

    // ── 5. Registrar abono con trazabilidad completa ──────────────────────────
    await sql`
      INSERT INTO abonos_fiados (
        pedido_id,
        monto_abono,
        monto_nequi,
        metodo_pago,
        referencia_pago,
        fecha_abono,
        observaciones,
        registrado_por,
        entregador_cobro,
        planilla_cobro_id,
        origen_tabla,
        created_at
      ) VALUES (
        ${String(fiadoId)},
        ${efectivo},
        ${nequi},
        ${nequi > 0 && efectivo > 0 ? 'mixto' : nequi > 0 ? 'nequi' : 'efectivo'},
        ${referenciaPago || null},
        NOW(),
        ${observaciones || null},
        ${session.user.id},
        ${entregadorCobro || null},
        ${cuadreId ? Number(cuadreId) : null},
        'fiados',
        NOW()
      )
    `

    // ── 6. Respuesta ──────────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      mensaje: pagoCompleto
        ? `Cobro completado — ${fiado.cliente} pagó su deuda completa`
        : `Abono registrado — Saldo pendiente: $${nuevoSaldo.toLocaleString('es-CO')}`,
      fiado_id:        fiado.id,
      cliente:         fiado.cliente,
      monto_abonado:   totalAbono,
      efectivo,
      nequi,
      monto_pagado:    nuevoMontoPagado,
      saldo_pendiente: nuevoSaldo,
      estado:          nuevoEstado,
      pago_completo:   pagoCompleto,
    })

  } catch (error) {
    return handleDBError(error, 'REGISTRAR_ABONO')
  }
}
