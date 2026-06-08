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
      fechaDesde,
      fechaHasta,
      rutasFiltro,            // string[] opcional — si caja filtra por rutas específicas
      efectivoRecibido,
      nequiRecibido,          // NUEVO — transferencias recibidas separadas
      tieneConsignacion,
      numeroConsignacion,
      banco,
      montoConsignacion,
      observaciones,
      descuento,
      motivoDescuento,
    } = body

    if (!entregador || !fechaDesde || !fechaHasta) {
      return NextResponse.json(
        { error: 'entregador, fechaDesde y fechaHasta son requeridos' },
        { status: 400 }
      )
    }

    // ─── 1. OBTENER PLANILLAS PENDIENTES DEL ENTREGADOR EN EL PERÍODO ───────────
    const planillas = await sql`
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

    if (planillas.length === 0) {
      return NextResponse.json(
        { error: 'No hay planillas pendientes de cuadre para este entregador en el período indicado' },
        { status: 404 }
      )
    }

    const planillaIds = planillas.map((p: any) => p.id)

    // ─── 2. CALCULAR TOTALES DESDE PEDIDOS (fuente de verdad) ────────────────────
    const totales = await sql`
      SELECT
        COALESCE(SUM(p.total), 0)                                                AS total_cargue,
        COALESCE(SUM(CASE WHEN p.estado IN ('entregado','pagado') THEN p.total - COALESCE(p.descuento,0) ELSE 0 END), 0) AS total_entregado,
        COALESCE(SUM(CASE WHEN p.estado = 'fiado' AND COALESCE(p.es_cobro,false) = false THEN p.saldo_pendiente ELSE 0 END), 0) AS total_fiados_nuevos,
        COALESCE(SUM(CASE WHEN p.estado = 'devolucion' THEN p.total ELSE 0 END), 0) AS total_devoluciones,
        COALESCE(SUM(CASE WHEN p.estado = 'repaso' THEN p.total ELSE 0 END), 0)     AS total_repasos,
        COALESCE(SUM(COALESCE(p.descuento,0)), 0)                                AS total_descuentos,
        COALESCE(SUM(
          CASE WHEN p.estado IN ('entregado','pagado','fiado')
            THEN (
              SELECT COALESCE(SUM(pp.total),0) FROM pedido_productos pp
              WHERE pp.pedido_id = p.id AND pp.estado_producto = 'agotado'
            )
          ELSE 0 END
        ), 0) AS total_agotados
      FROM pedidos p
      WHERE p.planilla_id = ANY(${planillaIds})
        AND COALESCE(p.es_cobro, false) = false
    `

    // ─── 3. CALCULAR COBROS CxC ASIGNADOS A ESTAS PLANILLAS ─────────────────────
    // Fuente: tabla fiados con planilla_asignado_id en estas planillas
    const cobros = await sql`
      SELECT
        COALESCE(SUM(f.monto_total), 0)    AS total_cobros_asignados,
        COALESCE(SUM(f.monto_pagado), 0)   AS total_cobrado,
        COALESCE(SUM(f.saldo_pendiente), 0) AS total_no_cobrado
      FROM fiados f
      WHERE f.planilla_asignado_id = ANY(${planillaIds})
        AND f.eliminado = false
    `

    // Cobros por medio de pago (de abonos_fiados registrados hoy en estas planillas)
    const cobrosPorMedio = await sql`
      SELECT
        COALESCE(SUM(af.monto_abono), 0)   AS cobros_efectivo,
        COALESCE(SUM(af.monto_nequi), 0)   AS cobros_nequi
      FROM abonos_fiados af
      WHERE af.planilla_cobro_id = ANY(${planillaIds})
    `

    const t = totales[0]
    const c = cobros[0]
    const cm = cobrosPorMedio[0]

    const totalCargue        = Number(t.total_cargue)
    const totalEntregado     = Number(t.total_entregado)
    const totalFiadosNuevos  = Number(t.total_fiados_nuevos)
    const totalDevoluciones  = Number(t.total_devoluciones)
    const totalRepasos       = Number(t.total_repasos)
    const totalDescuentos    = Number(t.total_descuentos)
    const totalAgotados      = Number(t.total_agotados)
    const totalCobrosAsig    = Number(c.total_cobros_asignados)
    const cobrosEfectivo     = Number(cm.cobros_efectivo)
    const cobrosNequi        = Number(cm.cobros_nequi)
    const totalCobros        = cobrosEfectivo + cobrosNequi

    // ─── 4. FÓRMULA DE CUADRE ────────────────────────────────────────────────────
    // Efectivo Esperado = Entregado - Descuentos - Agotados + Cobros efectivo
    // Nequi Esperado    = Cobros nequi
    const efectivoEsperado = Math.round(
      (totalEntregado - totalDescuentos - totalAgotados + cobrosEfectivo) * 100
    ) / 100
    const nequiEsperado = cobrosNequi

    const efectivoReal    = Number(efectivoRecibido) || 0
    const nequiReal       = Number(nequiRecibido) || 0
    const consignado      = Number(montoConsignacion) || 0
    const descuentoVal    = Number(descuento) || 0

    const totalRecibido   = efectivoReal + nequiReal + consignado
    const totalEsperado   = efectivoEsperado + nequiEsperado
    const diferencia      = Math.round((totalRecibido - totalEsperado - descuentoVal) * 100) / 100
    const estado          = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    // ─── 5. GUARDAR FIADOS NUEVOS ─────────────────────────────────────────────────
    const pedidosFiados = await sql`
      SELECT p.id, p.cliente, p.direccion, p.telefono, p.total,
             COALESCE(p.monto_pagado,0) AS monto_pagado,
             COALESCE(p.saldo_pendiente, p.total - COALESCE(p.monto_pagado,0)) AS saldo_pendiente,
             p.observaciones, pl.fecha, pl.entregador, pl.tipo_ruta
      FROM pedidos p
      JOIN planillas pl ON p.planilla_id = pl.id
      WHERE p.estado = 'fiado'
        AND COALESCE(p.es_cobro, false) = false
        AND p.planilla_id = ANY(${planillaIds})
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
    }

    // ─── 6. MARCAR PEDIDOS DE REPASO (sin tabla repasos) ─────────────────────────
    // Los repasos quedan como pedidos con estado='repaso' — no se mueven a otra tabla
    // El coordinador los verá en la siguiente planilla si los reasigna

    // ─── 7. GUARDAR CUADRE ───────────────────────────────────────────────────────
    const tipoCuadre = planillaIds.length === 1 ? 'individual' : 'agrupado'

    const result = await sql`
      INSERT INTO cuadres_caja (
        entregador, fecha_cuadre, fecha_desde, fecha_hasta,
        planillas_ids, rutas_nombres, rutas_cuadre, tipo_cuadre,
        total_cargue, total_esperado, total_efectivo, nequi_recibido,
        total_consignado, diferencia, estado, observaciones,
        tiene_consignacion, numero_consignacion, banco,
        descuento, motivo_descuento,
        agotados, fiado, devoluciones, repasos, errores_facturacion,
        cobros_efectivo, cobros_nequi, total_cobros,
        cuadrado_por
      ) VALUES (
        ${entregador},
        NOW()::date,
        ${fechaDesde}::date,
        ${fechaHasta}::date,
        ${planillaIds},
        ${planillas.map((p: any) => p.tipo_ruta)},
        ${rutasFiltro || planillas.map((p: any) => p.tipo_ruta)},
        ${tipoCuadre},
        ${totalCargue},
        ${totalEsperado},
        ${efectivoReal},
        ${nequiReal},
        ${consignado},
        ${diferencia},
        ${estado},
        ${observaciones || null},
        ${tieneConsignacion || false},
        ${numeroConsignacion || null},
        ${banco || null},
        ${descuentoVal},
        ${motivoDescuento || null},
        ${totalAgotados},
        ${totalFiadosNuevos},
        ${totalDevoluciones},
        ${totalRepasos},
        0,
        ${cobrosEfectivo},
        ${cobrosNequi},
        ${totalCobros},
        ${session.user.id}
      )
      RETURNING id
    `

    const cuadreId = result[0].id

    // ─── 8. MARCAR PLANILLAS COMO CUADRADAS ──────────────────────────────────────
    await sql`
      UPDATE planillas
      SET cuadrado_en_caja = true,
          cuadre_caja_id   = ${cuadreId},
          fecha_cuadre     = NOW(),
          updated_at       = NOW()
      WHERE id = ANY(${planillaIds})
    `

    // ─── 9. COMISIÓN ──────────────────────────────────────────────────────────────
    const configComision = await sql`
      SELECT porcentaje_comision FROM comisiones_config
      WHERE entregador = ${entregador} AND activo = true
      LIMIT 1
    `

    if (configComision.length > 0) {
      const porcentaje       = Number(configComision[0].porcentaje_comision)
      // Base comisionable = lo entregado efectivamente (sin cobros CxC)
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

    return NextResponse.json({
      success: true,
      cuadreId,
      tipoCuadre,
      resumen: {
        totalCargue,
        totalEntregado,
        totalFiadosNuevos,
        totalDevoluciones,
        totalRepasos,
        totalAgotados,
        totalDescuentos,
        cobrosEfectivo,
        cobrosNequi,
        totalCobros,
        efectivoEsperado,
        nequiEsperado,
        efectivoRecibido: efectivoReal,
        nequiRecibido:    nequiReal,
        diferencia,
        estado,
      },
      planillasCuadradas: planillaIds.length,
      fiadosGuardados:    pedidosFiados.length,
    })

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
    const entregador  = searchParams.get('entregador')
    const fechaDesde  = searchParams.get('fechaDesde')
    const fechaHasta  = searchParams.get('fechaHasta')

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

// ─── ENDPOINT DE PREVIEW ─────────────────────────────────────────────────────
// GET /api/cuadres-caja/preview?entregador=X&fechaDesde=Y&fechaHasta=Z
// Retorna el resumen calculado SIN guardar — para que caja vea los números antes de cuadrar
export async function preview(request: Request) {
  // Mismo cálculo que POST secciones 1-4, pero sin escribir nada
  // Implementar si se necesita pre-visualización en el modal
}
