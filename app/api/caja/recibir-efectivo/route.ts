import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const {
      planillaId,
      efectivoEsperado,
      efectivoRecibido,
      tieneConsignacion,
      numeroConsignacion,
      banco,
      montoConsignacion,
      fechaConsignacion,
      observaciones,
      descuento,
      motivoDescuento,
      agotados,
    } = body

    if (!planillaId || efectivoEsperado === undefined || efectivoRecibido === undefined) {
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    if (tieneConsignacion && (!numeroConsignacion || !banco || !montoConsignacion)) {
      return NextResponse.json({ error: 'Datos de consignación incompletos' }, { status: 400 })
    }

    const sql = getDB()

    // ── 1. Verificar planilla ─────────────────────────────────────────────────
    const [planilla] = await sql`
      SELECT id, estado, entregador, tipo_ruta, fecha, total_devolucion
      FROM planillas
      WHERE id = ${planillaId}
    `

    if (!planilla) {
      return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 })
    }

    if (!['completado', 'alistado', 'en_ruta'].includes(planilla.estado)) {
      return NextResponse.json(
        { error: 'La planilla debe estar en ruta, completada o alistada para cuadrar' },
        { status: 400 }
      )
    }

    // ── 2. Verificar que no esté ya cuadrada ──────────────────────────────────
    const yaCuadrada = await sql`
      SELECT id FROM cuadres_caja
      WHERE planillas_ids @> ARRAY[${planillaId}]::text[]
      LIMIT 1
    `

    if (yaCuadrada.length > 0) {
      return NextResponse.json({ error: 'Esta planilla ya fue cuadrada en caja' }, { status: 400 })
    }

    // ── 3. Validar consignación no duplicada ──────────────────────────────────
    if (tieneConsignacion && numeroConsignacion) {
      const [consExiste] = await sql`
        SELECT id FROM cuadres_caja
        WHERE numero_consignacion = ${numeroConsignacion}
        LIMIT 1
      `
      if (consExiste) {
        return NextResponse.json(
          { error: 'Este número de consignación ya fue registrado' },
          { status: 400 }
        )
      }
    }

    // ── 4. Guardar fiados nuevos (sin escribir en tabla repasos) ──────────────
    const pedidosEspeciales = await sql`
      SELECT id, estado, total, cliente, monto_pagado, saldo_pendiente
      FROM pedidos
      WHERE planilla_id = ${planillaId}
        AND estado IN ('fiado', 'repaso')
    `

    for (const pedido of pedidosEspeciales) {
      if (pedido.estado === 'fiado') {
        const [yaExiste] = await sql`
          SELECT id FROM fiados WHERE pedido_id = ${pedido.id} LIMIT 1
        `
        if (!yaExiste) {
          await sql`
            INSERT INTO fiados (
              pedido_id, cliente, monto_total, monto_pagado,
              saldo_pendiente, estado, fecha_fiado, entregador, ruta
            ) VALUES (
              ${pedido.id}, ${pedido.cliente}, ${pedido.total},
              ${pedido.monto_pagado || 0},
              ${pedido.saldo_pendiente || pedido.total},
              ${Number(pedido.saldo_pendiente) > 0 ? 'pendiente' : 'pagado_completo'},
              ${planilla.fecha}, ${planilla.entregador}, ${planilla.tipo_ruta}
            )
          `
        }
      }
      // Repasos: quedan como pedidos con estado='repaso' — no se mueven a tabla repasos
    }

    // ── 5. Calcular cuadre ────────────────────────────────────────────────────
    const descuentoVal    = Number(descuento || 0)
    const consignadoVal   = Number(montoConsignacion || 0)
    const efectivoReal    = Number(efectivoRecibido)
    const esperadoAjust   = Number(efectivoEsperado) - descuentoVal
    const totalRecibido   = efectivoReal + consignadoVal
    const diferencia      = Math.round((totalRecibido - esperadoAjust) * 100) / 100
    const estado          = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    // ── 6. Guardar en cuadres_caja (fuente única) ─────────────────────────────
    const [cuadre] = await sql`
      INSERT INTO cuadres_caja (
        entregador, fecha_cuadre, fecha_desde, fecha_hasta,
        planillas_ids, rutas_nombres, tipo_cuadre,
        total_cargue, total_esperado, total_efectivo,
        total_consignado, diferencia, estado,
        observaciones, tiene_consignacion,
        numero_consignacion, banco,
        descuento, motivo_descuento, agotados,
        cuadrado_por, created_at
      ) VALUES (
        ${planilla.entregador},
        NOW()::date,
        ${planilla.fecha},
        ${planilla.fecha},
        ARRAY[${planillaId}]::text[],
        ARRAY[${planilla.tipo_ruta}],
        'individual',
        0,
        ${esperadoAjust},
        ${efectivoReal},
        ${consignadoVal},
        ${diferencia},
        ${estado},
        ${observaciones || null},
        ${tieneConsignacion || false},
        ${numeroConsignacion || null},
        ${banco || null},
        ${descuentoVal},
        ${motivoDescuento || null},
        ${Number(agotados || 0)},
        ${session.user.id},
        NOW()
      )
      RETURNING id
    `

    // ── 7. Marcar planilla como cuadrada ──────────────────────────────────────
    await sql`
      UPDATE planillas SET
        cuadrado_en_caja  = true,
        cuadre_caja_id    = ${cuadre.id},
        fecha_cuadre_caja = NOW(),
        updated_at        = NOW()
      WHERE id = ${planillaId}
    `

    // ── 8. Comisión ───────────────────────────────────────────────────────────
    const [config] = await sql`
      SELECT porcentaje_comision FROM comisiones_config
      WHERE entregador = ${planilla.entregador} AND activo = true
      LIMIT 1
    `

    if (config) {
      const porcentaje       = Number(config.porcentaje_comision)
      const baseComisionable = Math.round(efectivoReal * 100) / 100
      const montoComision    = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100

      const [yaExisteComision] = await sql`
        SELECT id FROM comisiones WHERE cuadre_agrupado_id = ${cuadre.id} LIMIT 1
      `

      if (!yaExisteComision) {
        await sql`
          INSERT INTO comisiones (
            entregador, fecha, planilla_id,
            total_entregas_efectivas, total_devoluciones,
            base_comisionable, porcentaje_aplicado,
            monto_comision, estado, cuadre_agrupado_id
          ) VALUES (
            ${planilla.entregador},
            (NOW() AT TIME ZONE 'America/Bogota')::date,
            ${planillaId},
            ${efectivoReal},
            ${Number(planilla.total_devolucion) || 0},
            ${baseComisionable},
            ${porcentaje},
            ${montoComision},
            'pendiente',
            ${cuadre.id}
          )
        `
      }
    }

    return NextResponse.json({
      success: true,
      cuadreId: cuadre.id,
      // Mantener compatibilidad con el frontend que espera "recepcion"
      recepcion: {
        id: cuadre.id,
        planilla_id: planillaId,
        efectivo_esperado: esperadoAjust,
        efectivo_recibido: efectivoReal,
        diferencia_efectivo: diferencia,
        estado,
      },
      mensaje: diferencia === 0
        ? 'Efectivo cuadrado correctamente'
        : `Recepción registrada con diferencia de ${diferencia > 0 ? '+' : ''}${diferencia}`,
    })

  } catch (error) {
    console.error('[recibir-efectivo] Error:', error)
    return NextResponse.json(
      { error: 'Error al registrar recepción', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()

    // Leer desde cuadres_caja — fuente única
    const recepciones = await sql`
      SELECT
        c.*,
        c.planillas_ids[1] as planilla_id,
        c.total_efectivo    as efectivo_recibido,
        c.total_esperado    as efectivo_esperado,
        c.diferencia        as diferencia_efectivo,
        c.total_consignado  as monto_consignacion,
        u.nombre            as recibido_por_nombre
      FROM cuadres_caja c
      LEFT JOIN usuarios u ON u.id::text = c.cuadrado_por::text
      WHERE c.tipo_cuadre = 'individual'
      ORDER BY c.fecha_cuadre DESC
      LIMIT 100
    `

    return NextResponse.json({ recepciones })

  } catch (error) {
    console.error('[recibir-efectivo GET] Error:', error)
    return NextResponse.json({ error: 'Error al cargar historial' }, { status: 500 })
  }
}
