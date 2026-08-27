import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'
import { buscarReferenciasUsadas } from '@/lib/validar-referencia'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const {
      fiadoId,
      montoEfectivo,
      montoNequi,
      referenciaPago,
      entregadorCobro,
      cuadreId,
      observaciones,
    } = body

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
        { error: `El abono ($${totalAbono.toLocaleString('es-CO')}) no puede superar el saldo pendiente ($${saldoActual.toLocaleString('es-CO')})` },
        { status: 400 }
      )
    }

    if (referenciaPago) {
      // ✅ Antifraude: busca la referencia en TODAS las fuentes (consignaciones,
      // cuadres cerrados, otros abonos, pagos anticipados) — no solo abonos_fiados.
      const yaUsada = await buscarReferenciasUsadas([referenciaPago])
      if (yaUsada.length > 0) {
        return NextResponse.json(
          { error: `La referencia ${referenciaPago} ya fue registrada. Verifique el comprobante.` },
          { status: 409 }
        )
      }
    }

    const nuevoMontoPagado = Number(fiado.monto_pagado) + totalAbono
    const nuevoSaldo       = Math.round((saldoActual - totalAbono) * 100) / 100
    const pagoCompleto     = nuevoSaldo <= 0
    const nuevoEstado      = pagoCompleto ? 'pagado_completo' : 'abono_parcial'

    // ✅ NO tocar entregador_asignado — solo se asigna desde "Asignar a Cobrar"
    await sql`
      UPDATE fiados SET
        monto_pagado        = ${nuevoMontoPagado},
        saldo_pendiente     = ${nuevoSaldo},
        estado              = ${nuevoEstado},
        cobrado_por         = ${session.user.id},
        fecha_pago_completo = ${pagoCompleto ? sql`NOW()` : sql`NULL`},
        updated_at          = NOW()
      WHERE id = ${Number(fiadoId)}
    `

    await sql`
      INSERT INTO abonos_fiados (
        pedido_id, monto_abono, monto_nequi, metodo_pago,
        referencia_pago, fecha_abono, observaciones,
        registrado_por, entregador_cobro, planilla_cobro_id,
        origen_tabla, created_at
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
