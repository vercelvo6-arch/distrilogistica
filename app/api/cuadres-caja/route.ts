import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { handleDBError } from '@/lib/db-helpers'

export async function POST(request: Request) {
  const sql = getDB()

  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()

    const {
      entregador,
      planillaIds: planillaIdsDirectos,
      fechaDesde,
      fechaHasta,
      rutasFiltro,
      efectivoRecibido,
      billetes,
      monedas,
      consignaciones: consignacionesArray,
      nequiRecibido,
      tieneConsignacion,
      numeroConsignacion,
      banco,
      montoConsignacion,
      observaciones,
      descuento,
      motivoDescuento,
      cobrosVinculados,
      totalEsperado: totalEsperadoFrontend,
      fiado: fiadoFrontend,
      devoluciones: devolucionesFrontend,
      agotados: agotadosFrontend,
      repasos: repasosFrontend,
      erroresFacturacion: erroresFrontend,
    } = body

    if (!entregador) {
      return NextResponse.json({ error: 'entregador es requerido' }, { status: 400 })
    }

    if (!planillaIdsDirectos?.length && (!fechaDesde || !fechaHasta)) {
      return NextResponse.json(
        { error: 'Se requiere planillaIds o fechaDesde + fechaHasta' },
        { status: 400 }
      )
    }

    // ─── 1. OBTENER PLANILLAS ─────────────────────────────────────────────────
    let planillas: any[]

    if (planillaIdsDirectos?.length) {
      planillas = await sql`
        SELECT id, tipo_ruta, fecha, total_cargue, total_entregado,
               total_fiado, total_devolucion, total_repaso, total_agotados
        FROM planillas
        WHERE id = ANY(${planillaIdsDirectos})
      `
    } else {
      planillas = await sql`
        SELECT id, tipo_ruta, fecha, total_cargue, total_entregado,
               total_fiado, total_devolucion, total_repaso, total_agotados
        FROM planillas
        WHERE entregador = ${entregador}
          AND fecha BETWEEN ${fechaDesde}::date AND ${fechaHasta}::date
          AND cuadrado_en_caja = false
          AND estado = 'en_ruta'
          ${rutasFiltro?.length ? sql`AND tipo_ruta = ANY(${rutasFiltro})` : sql``}
        ORDER BY fecha ASC, tipo_ruta ASC
      `
    }

    if (planillas.length === 0) {
      return NextResponse.json({ error: 'No hay planillas para cuadrar' }, { status: 404 })
    }

    const planillaIds = planillas.map((p: any) => p.id)

    // ─── 2. VERIFICAR QUE NO ESTÉN YA CUADRADAS ──────────────────────────────
    const yaCuadradas = await sql`
      SELECT id FROM cuadres_caja
      WHERE planillas_ids && ${planillaIds}::text[]
      LIMIT 1
    `
    if (yaCuadradas.length > 0) {
      return NextResponse.json(
        { error: 'Una o más planillas ya fueron cuadradas anteriormente' },
        { status: 409 }
      )
    }

    // ─── 3. CALCULAR TOTALES ──────────────────────────────────────────────────
    // Cargue viene de planillas (fuente de verdad)
    // Novedades: si el body trae valores editados por caja, se usan esos.
    // Si no, se toman de las planillas como fallback.
    const totalCargue = planillas.reduce((s: number, p: any) => s + Number(p.total_cargue || 0), 0)

    // Novedades — usar valor del modal si fue ingresado, sino sumar desde planillas
    const totalFiadosNuevos = (body.fiados !== undefined && body.fiados !== null)
      ? Number(body.fiados) || 0
      : planillas.reduce((s: number, p: any) => s + Number(p.total_fiado || 0), 0)

    const totalDevoluciones = (body.devoluciones !== undefined && body.devoluciones !== null)
      ? Number(body.devoluciones) || 0
      : planillas.reduce((s: number, p: any) => s + Number(p.total_devolucion || 0), 0)

    const totalRepasos = (body.repasos !== undefined && body.repasos !== null)
      ? Number(body.repasos) || 0
      : planillas.reduce((s: number, p: any) => s + Number(p.total_repaso || 0), 0)

    const totalAgotados = (body.agotados !== undefined && body.agotados !== null)
      ? Number(body.agotados) || 0
      : planillas.reduce((s: number, p: any) => s + Number(p.total_agotados || 0), 0)

    const totalDescuentos = Number(descuento) || 0

    // Entregado = cargue - novedades (lo que no es novedad fue entregado)
    const totalEntregado = totalCargue - totalFiadosNuevos - totalDevoluciones - totalRepasos - totalAgotados

    // ─── 4. CALCULAR COBROS VINCULADOS ────────────────────────────────────────
    const cobros = cobrosVinculados || []
    const cobrosEfectivo = cobros.reduce((s: number, c: any) => s + (Number(c.montoEfectivo) || 0), 0)
    const cobrosNequi    = cobros.reduce((s: number, c: any) => s + (Number(c.montoNequi) || 0), 0)
    const totalCobros    = cobrosEfectivo + cobrosNequi

    // ─── 5. FÓRMULA DE CUADRE ─────────────────────────────────────────────────
    // Esperado efectivo = entregado - descuentos + cobros efectivo
    // Esperado nequi    = cobros nequi
    const efectivoEsperado = Math.round((totalEntregado - totalDescuentos + cobrosEfectivo) * 100) / 100
    const nequiEsperado    = cobrosNequi

    const billetesVal         = Number(billetes) || 0
    const monedasVal          = Number(monedas) || 0
    const consignadoVal       = consignacionesArray?.length
      ? consignacionesArray.reduce((s: number, c: any) => s + Number(c.monto || 0), 0)
      : Number(montoConsignacion) || 0
    const nequiReal           = Number(nequiRecibido) || 0
    const totalFisicoRecibido = billetesVal + monedasVal + consignadoVal + nequiReal || Number(efectivoRecibido) || 0

    // ✅ Usar el totalEsperado calculado por el frontend (cargue - novedades + cobros)
    // Es más preciso que recalcular aquí porque el frontend ya tiene las novedades reales
    const totalEsperado = totalEsperadoFrontend !== undefined
      ? Number(totalEsperadoFrontend)
      : totalCargue - (Number(fiadoFrontend)||0) - (Number(devolucionesFrontend)||0) - (Number(agotadosFrontend)||0) - (Number(repasosFrontend)||0) - (Number(erroresFrontend)||0) - (Number(descuento)||0) + cobrosEfectivo

    const totalRecibido = totalFisicoRecibido
    const diferencia    = Math.round((totalRecibido - totalEsperado) * 100) / 100
    const estado        = diferencia === 0 ? 'cuadrado' : 'con_diferencia'
    const tipoCuadre    = planillaIds.length === 1 ? 'individual' : 'agrupado'

    // ─── 6. TRANSACCIÓN: TODO O NADA ─────────────────────────────────────────
    await sql`BEGIN`

    try {
      // 6a. Guardar fiados nuevos — leer desde novedades_pedido (fuente de verdad real)
      // ✅ SIN restringir por planillaIds: captura también huérfanos de cuadres previos
      // que quedaron sin migrar por código anterior a este fix.
      const pedidosFiados = await sql`
        SELECT
          p.id, p.cliente, p.direccion, p.telefono,
          n.monto_novedad AS saldo_pendiente,
          COALESCE(n.monto_pagado, 0) AS monto_pagado,
          (n.monto_novedad + COALESCE(n.monto_pagado,0)) AS total,
          p.observaciones, pl.fecha, pl.entregador, pl.tipo_ruta,
          n.id AS novedad_id
        FROM novedades_pedido n
        JOIN pedidos p ON n.pedido_id = p.id
        JOIN planillas pl ON p.planilla_id = pl.id
        WHERE n.tipo_novedad = 'fiado_parcial'
          AND NOT EXISTS (
            SELECT 1 FROM fiados f WHERE f.pedido_id = p.id
          )
      `
      for (const pedido of pedidosFiados) {
        const saldo = Math.max(0, Number(pedido.saldo_pendiente))
        await sql`
          INSERT INTO fiados (
            pedido_id, cliente, direccion, telefono,
            monto_total, monto_pagado, saldo_pendiente,
            fecha_fiado, entregador, ruta, estado, observaciones
          ) VALUES (
            ${pedido.id}, ${pedido.cliente}, ${pedido.direccion || null},
            ${pedido.telefono || null}, ${Number(pedido.total)},
            ${Number(pedido.monto_pagado)}, ${saldo},
            ${pedido.fecha}, ${pedido.entregador}, ${pedido.tipo_ruta},
            ${saldo > 0 ? 'pendiente' : 'pagado_completo'},
            ${pedido.observaciones || null}
          )
          ON CONFLICT DO NOTHING
        `
        // Marcar la novedad como validada — caja ya la cuadró y migró a fiados
        await sql`
          UPDATE novedades_pedido SET validado = true WHERE id = ${pedido.novedad_id}
        `
      }

      // 6b. Registrar abonos de cobros CxC
      for (const cobro of cobros) {
        const efectivo = Number(cobro.montoEfectivo) || 0
        const nequi    = Number(cobro.montoNequi) || 0
        if (!cobro.id || efectivo + nequi <= 0) continue

        // Si yaRegistrado=true el entregador ya lo cobró en ruta
        // Solo marcamos para vincular al cuadre después del INSERT — sin duplicar
        if (cobro.yaRegistrado) continue

        const totalAbono = efectivo + nequi
        const esFiadoNumerico = /^\d+$/.test(String(cobro.id))

        if (esFiadoNumerico) {
          // ── Cobro proviene de la tabla `fiados` ──────────────────────────
          const fiadoId = Number(cobro.id)

          const [fiado] = await sql`
            SELECT id, monto_total, monto_pagado, saldo_pendiente, estado
            FROM fiados
            WHERE id = ${fiadoId}
              AND (eliminado IS NULL OR eliminado = false)
              AND estado IN ('pendiente', 'abono_parcial')
          `
          if (!fiado) continue

          const saldoActual      = Number(fiado.saldo_pendiente)
          const nuevoMontoPagado = Number(fiado.monto_pagado) + totalAbono
          const nuevoSaldo       = Math.max(0, Math.round((saldoActual - totalAbono) * 100) / 100)
          const pagoCompleto     = nuevoSaldo <= 0

          await sql`
            UPDATE fiados SET
              monto_pagado    = ${nuevoMontoPagado},
              saldo_pendiente = ${nuevoSaldo},
              estado          = ${pagoCompleto ? 'pagado_completo' : 'abono_parcial'},
              updated_at      = NOW()
            WHERE id = ${fiadoId}
          `

          await sql`
            INSERT INTO abonos_fiados (
              pedido_id, monto_abono, monto_nequi, metodo_pago,
              referencia_pago, fecha_abono, observaciones,
              entregador_cobro, origen_tabla, created_at
            ) VALUES (
              ${String(fiadoId)},
              ${efectivo},
              ${nequi},
              ${nequi > 0 && efectivo > 0 ? 'mixto' : nequi > 0 ? 'nequi' : 'efectivo'},
              ${cobro.referencia?.trim() || null},
              NOW(),
              ${'Cobro registrado en cuadre de caja'},
              ${entregador},
              'fiados',
              NOW()
            )
          `
        } else {
          // ── Cobro proviene de un pedido huérfano (estado='fiado' sin fila en `fiados`) ──
          const pedidoId = String(cobro.id)

          const [pedido] = await sql`
            SELECT id, total, monto_pagado, saldo_pendiente, estado
            FROM pedidos
            WHERE id = ${pedidoId}
              AND estado = 'fiado'
          `
          if (!pedido) continue

          const saldoActual      = Number(pedido.saldo_pendiente ?? pedido.total)
          const nuevoMontoPagado = Number(pedido.monto_pagado || 0) + totalAbono
          const nuevoSaldo       = Math.max(0, Math.round((saldoActual - totalAbono) * 100) / 100)
          const pagoCompleto     = nuevoSaldo <= 0

          await sql`
            UPDATE pedidos SET
              monto_pagado    = ${nuevoMontoPagado},
              saldo_pendiente = ${nuevoSaldo},
              estado          = ${pagoCompleto ? 'pagado' : 'fiado'},
              updated_at      = NOW()
            WHERE id = ${pedidoId}
          `

          await sql`
            INSERT INTO abonos_fiados (
              pedido_id, monto_abono, monto_nequi, metodo_pago,
              referencia_pago, fecha_abono, observaciones,
              entregador_cobro, origen_tabla, created_at
            ) VALUES (
              ${pedidoId},
              ${efectivo},
              ${nequi},
              ${nequi > 0 && efectivo > 0 ? 'mixto' : nequi > 0 ? 'nequi' : 'efectivo'},
              ${cobro.referencia?.trim() || null},
              NOW(),
              ${'Cobro registrado en cuadre de caja'},
              ${entregador},
              'pedidos',
              NOW()
            )
          `
        }
      }

      // 6c. Guardar cuadre
      const [cuadreResult] = await sql`
        INSERT INTO cuadres_caja (
          entregador, fecha_cuadre, fecha_desde, fecha_hasta,
          planillas_ids, rutas_nombres, rutas_cuadre, tipo_cuadre,
          total_cargue, total_esperado, total_efectivo, nequi_recibido,
          total_consignado, diferencia, estado, observaciones,
          tiene_consignacion, numero_consignacion, banco,
          consignaciones,
          descuento, motivo_descuento,
          agotados, fiado, devoluciones, repasos, errores_facturacion,
          cobros_efectivo, cobros_nequi, total_cobros,
          cuadrado_por
        ) VALUES (
          ${entregador},
          NOW()::date,
          ${planillas[0].fecha},
          ${planillas[planillas.length - 1].fecha},
          ${planillaIds},
          ${planillas.map((p: any) => p.tipo_ruta)},
          ${planillas.map((p: any) => p.tipo_ruta)},
          ${tipoCuadre},
          ${totalCargue},
          ${totalEsperado},
          ${totalFisicoRecibido},
          ${nequiReal},
          ${consignadoVal},
          ${diferencia},
          ${estado},
          ${observaciones || null},
          ${(consignacionesArray?.length > 0) || tieneConsignacion || false},
          ${consignacionesArray?.[0]?.numero || numeroConsignacion || null},
          ${consignacionesArray?.[0]?.banco || banco || null},
          ${JSON.stringify(consignacionesArray || [])},
          ${totalDescuentos},
          ${motivoDescuento || null},
          ${totalAgotados},
          ${totalFiadosNuevos},
          ${totalDevoluciones},
          ${totalRepasos},
          0,
          ${cobrosEfectivo},
          ${cobrosNequi},
          ${totalCobros},
          null
        )
        RETURNING id
      `

      const cuadreId = cuadreResult.id

      // 6c.2 Vincular al cuadre los abonos que el entregador ya registró en ruta
      const cobrosYaRegistrados = cobros.filter((c: any) => c.yaRegistrado && c.id)
      if (cobrosYaRegistrados.length > 0) {
        for (const cobro of cobrosYaRegistrados) {
          await sql`
            UPDATE abonos_fiados SET
              planilla_cobro_id = ${cuadreId}
            WHERE pedido_id = ${String(Number(cobro.id))}
              AND entregador_cobro = ${entregador}
              AND planilla_cobro_id IS NULL
              AND DATE(fecha_abono AT TIME ZONE 'America/Bogota') = CURRENT_DATE
          `
        }
      }

      // 6d. Marcar planillas como cuadradas
      await sql`
        UPDATE planillas
        SET cuadrado_en_caja = true,
            cuadre_caja_id   = ${cuadreId},
            fecha_cuadre     = NOW(),
            updated_at       = NOW()
        WHERE id = ANY(${planillaIds})
      `

      // 6e. Comisión
      const [configComision] = await sql`
        SELECT porcentaje_comision FROM comisiones_config
        WHERE entregador = ${entregador} AND activo = true
        LIMIT 1
      `
      if (configComision) {
        const porcentaje       = Number(configComision.porcentaje_comision)
        const baseComisionable = Math.round(totalEntregado * 100) / 100
        const montoComision    = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100
        await sql`
          INSERT INTO comisiones (
            entregador, fecha, planilla_id,
            total_entregas_efectivas, total_devoluciones,
            base_comisionable, porcentaje_aplicado, monto_comision,
            estado, cuadre_agrupado_id
          ) VALUES (
            ${entregador},
            (NOW() AT TIME ZONE 'America/Bogota')::date,
            NULL,
            ${totalEntregado},
            ${totalDevoluciones},
            ${baseComisionable},
            ${porcentaje},
            ${montoComision},
            'pendiente',
            ${cuadreId}
          )
        `
      }

      await sql`COMMIT`

      return NextResponse.json({
        success: true,
        cuadreId,
        tipoCuadre,
        mensaje: `Cuadre registrado correctamente — ${planillaIds.length} planilla(s), ${cobros.filter((c: any) => (Number(c.montoEfectivo)||0) + (Number(c.montoNequi)||0) > 0).length} cobro(s) procesado(s)`,
        resumen: {
          totalCargue, totalEntregado, totalFiadosNuevos,
          totalDevoluciones, totalRepasos, totalAgotados,
          cobrosEfectivo, cobrosNequi, totalCobros,
          efectivoEsperado, nequiEsperado,
          totalFisicoRecibido, nequiReal,
          diferencia, estado,
        },
        planillasCuadradas: planillaIds.length,
        fiadosGuardados:    pedidosFiados.length,
      })

    } catch (txError) {
      await sql`ROLLBACK`
      throw txError
    }

  } catch (error) {
    console.error('[CUADRE CAJA POST] ERROR:', error)
    return handleDBError(error, 'CUADRE CAJA POST')
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const entregador = searchParams.get('entregador')
    const fechaDesde = searchParams.get('fechaDesde')
    const fechaHasta = searchParams.get('fechaHasta')

    const sql = getDB()

    const cuadres = await sql`
      SELECT *
      FROM cuadres_caja
      WHERE true
        ${entregador ? sql`AND entregador = ${entregador}` : sql``}
        ${fechaDesde ? sql`AND fecha_desde >= ${fechaDesde}::date` : sql``}
        ${fechaHasta ? sql`AND fecha_hasta <= ${fechaHasta}::date` : sql``}
      ORDER BY fecha_cuadre DESC
      LIMIT 100
    `

    return NextResponse.json({ success: true, cuadres })

  } catch (error) {
    return handleDBError(error, 'CUADRE CAJA GET')
  }
}
