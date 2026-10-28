import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const sql = neon(process.env.DATABASE_URL!)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params
    const cuadreId = parseInt(id, 10)
    if (isNaN(cuadreId) || cuadreId <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

    const cuadres = await sql`
      SELECT 
        c.id, c.entregador, c.fecha_cuadre, c.planillas_ids,
        COALESCE(c.total_cargue, 0)        as total_cargue,
        COALESCE(c.total_esperado, 0)      as total_esperado,
        COALESCE(c.total_efectivo, 0)      as total_efectivo,
        COALESCE(c.total_consignado, 0)    as total_consignado,
        c.billetes,
        c.monedas,
        c.nequi_recibido,
        COALESCE(c.diferencia, 0)          as diferencia,
        c.estado, c.observaciones,
        COALESCE(c.tiene_consignacion, false) as tiene_consignacion,
        c.numero_consignacion, c.banco,
        COALESCE(c.descuento, 0)           as descuento,
        c.motivo_descuento,
        COALESCE(c.agotados, 0)            as agotados,
        COALESCE(c.fiado, 0)               as fiado,
        COALESCE(c.devoluciones, 0)        as devoluciones,
        COALESCE(c.repasos, 0)             as repasos,
        COALESCE(c.errores_facturacion, 0) as errores_facturacion,
        COALESCE(c.cobros_efectivo, 0)     as cobros_efectivo,
        COALESCE(c.cobros_nequi, 0)        as cobros_nequi,
        COALESCE(c.consignaciones, '[]'::jsonb) as consignaciones,
        c.created_at,
        array_agg(DISTINCT p.tipo_ruta) FILTER (WHERE p.tipo_ruta IS NOT NULL) as rutas_nombres
      FROM cuadres_caja c
      LEFT JOIN planillas p ON p.id = ANY(c.planillas_ids)
      WHERE c.id = ${cuadreId}
      GROUP BY c.id
    `

    if (cuadres.length === 0) return NextResponse.json({ error: 'Cuadre no encontrado' }, { status: 404 })
    return NextResponse.json({ success: true, cuadre: cuadres[0] })

  } catch (error) {
    return NextResponse.json({ error: 'Error al cargar cuadre', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params
    const cuadreId = parseInt(id, 10)
    if (isNaN(cuadreId) || cuadreId <= 0) return NextResponse.json({ error: 'ID inválido' }, { status: 400 })

    const body = await request.json()
    const {
      efectivoRecibido,
      montoConsignacion,
      tieneConsignacion,
      numeroConsignacion,
      banco,
      observaciones,
      descuento,
      motivoDescuento,
      agotados,
      fiado,
      devoluciones,
      repasos,
      erroresFacturacion,
      cobrosEfectivo,
      cobrosNequi,
      // ✅ Recibir totalEsperado calculado por el frontend
      totalEsperado: totalEsperadoFrontend,
      diferencia: diferenciaFrontend,
      estado: estadoFrontend,
    } = body

    const cuadreActual = await sql`SELECT * FROM cuadres_caja WHERE id = ${cuadreId}`
    if (cuadreActual.length === 0) return NextResponse.json({ error: 'Cuadre no encontrado' }, { status: 404 })
    const cuadreAnterior = cuadreActual[0]

    const totalConsignado    = Number(montoConsignacion  || 0)
    const totalEfectivo      = Number(efectivoRecibido   || 0)
    const descuentoNum       = Number(descuento          || 0)
    const agotadosNum        = Number(agotados           || 0)
    const fiadoNum           = Number(fiado              || 0)
    const devolucionesNum    = Number(devoluciones       || 0)
    const repasosNum         = Number(repasos            || 0)
    const erroresNum         = Number(erroresFacturacion || 0)
    const cobrosEfectivoNum  = Number(cobrosEfectivo     || 0)
    const cobrosNequiNum     = Number(cobrosNequi        || 0)

    // ✅ Usar el esperado calculado por el frontend (ya incluye novedades correctas)
    // Fallback: recalcular si el frontend no lo envía
    const totalCargue    = Number(cuadreAnterior.total_cargue) || 0
    const totalEsperado  = totalEsperadoFrontend !== undefined
      ? Number(totalEsperadoFrontend)
      : totalCargue - fiadoNum - devolucionesNum - agotadosNum - repasosNum - erroresNum - descuentoNum + cobrosEfectivoNum

    const totalRecibido  = totalEfectivo + totalConsignado
    const diferencia     = Math.round((totalRecibido - totalEsperado) * 100) / 100
    const estado         = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    // ✅ El formulario de edición junta billetes+monedas en un solo campo
    // (efectivoRecibido) — se guarda todo en billetes y monedas en 0, para que el
    // desglose del historial ("Billetes/Monedas/Cobros CxC") quede coherente con el
    // total editado en vez de mostrar el desglose viejo de antes de la edición.
    // Lo mismo con total_cobros: es la suma que lee el historial, y antes se quedaba
    // con el valor de antes de editar porque solo se actualizaban cobros_efectivo y
    // cobros_nequi por separado.
    const totalCobros = cobrosEfectivoNum + cobrosNequiNum

    await sql`
      UPDATE cuadres_caja SET
        total_esperado      = ${totalEsperado},
        total_efectivo      = ${totalEfectivo},
        total_consignado    = ${totalConsignado},
        diferencia          = ${diferencia},
        estado              = ${estado},
        observaciones       = ${observaciones       || null},
        tiene_consignacion  = ${tieneConsignacion   || false},
        numero_consignacion = ${numeroConsignacion  || null},
        banco               = ${banco              || null},
        descuento           = ${descuentoNum},
        motivo_descuento    = ${motivoDescuento     || null},
        agotados            = ${agotadosNum},
        fiado               = ${fiadoNum},
        devoluciones        = ${devolucionesNum},
        repasos             = ${repasosNum},
        errores_facturacion = ${erroresNum},
        cobros_efectivo     = ${cobrosEfectivoNum},
        cobros_nequi        = ${cobrosNequiNum},
        total_cobros        = ${totalCobros},
        billetes            = ${totalEfectivo},
        monedas             = 0,
        consignaciones      = ${JSON.stringify(body.consignacionesDetalle || [])},
        updated_at          = NOW()
      WHERE id = ${cuadreId}
    `

    // Registrar historial
    const cambios = {
      total_esperado_anterior: cuadreAnterior.total_esperado,
      total_esperado_nuevo:    totalEsperado,
      efectivo_anterior:       cuadreAnterior.total_efectivo,
      efectivo_nuevo:          totalEfectivo,
      diferencia_anterior:     cuadreAnterior.diferencia,
      diferencia_nueva:        diferencia,
      fiado_anterior:          cuadreAnterior.fiado,
      fiado_nuevo:             fiadoNum,
      devoluciones_anterior:   cuadreAnterior.devoluciones,
      devoluciones_nuevo:      devolucionesNum,
      agotados_anterior:       cuadreAnterior.agotados,
      agotados_nuevo:          agotadosNum,
    }

    await sql`
      INSERT INTO cuadres_caja_historial (
        cuadre_id, usuario_id, usuario_nombre, fecha_cambio, cambios, observacion_cambio
      ) VALUES (
        ${cuadreId},
        ${session.user.id},
        ${session.user.username || session.user.email},
        NOW(),
        ${JSON.stringify(cambios)},
        ${'Edición manual del cuadre'}
      )
    `

    // Recalcular comisión si existe
    const comision = await sql`
      SELECT id, porcentaje_aplicado FROM comisiones WHERE cuadre_agrupado_id = ${cuadreId}
    `
    if (comision.length > 0) {
      const porcentaje   = Number(comision[0].porcentaje_aplicado)
      const montoComision = Math.round(totalEfectivo * (porcentaje / 100) * 100) / 100
      await sql`
        UPDATE comisiones SET
          total_entregas_efectivas = ${totalEfectivo},
          total_devoluciones       = ${devolucionesNum},
          base_comisionable        = ${totalEfectivo},
          monto_comision           = ${montoComision},
          updated_at               = NOW()
        WHERE id = ${comision[0].id}
      `
    }

    return NextResponse.json({ success: true, mensaje: '✅ Cuadre actualizado correctamente', diferencia, estado })

  } catch (error) {
    return NextResponse.json({ error: 'Error al editar cuadre', details: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
