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
      motivoDescuento
    } = body

    if (!planillaId || efectivoEsperado === undefined || efectivoRecibido === undefined) {
      return NextResponse.json(
        { error: 'Datos incompletos' },
        { status: 400 }
      )
    }

    if (tieneConsignacion && (!numeroConsignacion || !banco || !montoConsignacion)) {
      return NextResponse.json(
        { error: 'Datos de consignación incompletos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    const planilla = await sql`
      SELECT id, estado, entregador, tipo_ruta, fecha, total_devolucion
      FROM planillas 
      WHERE id = ${planillaId}
    `

    if (planilla.length === 0) {
      return NextResponse.json(
        { error: 'Planilla no encontrada' },
        { status: 404 }
      )
    }

    if (planilla[0].estado !== 'completado' && planilla[0].estado !== 'alistado') {
        return NextResponse.json(
        { error: 'La planilla debe estar completada o alistada para cuadrar en caja' },
        { status: 400 }
      )
    }

    const yaCuadrada = await sql`
      SELECT id FROM recepciones_caja WHERE planilla_id = ${planillaId}
    `

    if (yaCuadrada.length > 0) {
      return NextResponse.json(
        { error: 'Esta planilla ya fue cuadrada en caja' },
        { status: 400 }
      )
    }

    if (tieneConsignacion && numeroConsignacion) {
      const consignacionExiste = await sql`
        SELECT id FROM recepciones_caja 
        WHERE numero_consignacion = ${numeroConsignacion}
      `

      if (consignacionExiste.length > 0) {
        return NextResponse.json(
          { error: 'Este número de consignación ya fue registrado' },
          { status: 400 }
        )
      }
    }

    const efectivoEsperadoAjustado = Number(efectivoEsperado) - Number(descuento || 0)
    const diferenciaEfectivo = Number(efectivoRecibido) - efectivoEsperadoAjustado
    const estado = diferenciaEfectivo === 0 ? 'cuadrado' : 'con_diferencia'

    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const recepcionId = `REC${timestamp}${random}`

    const recepcion = await sql`
      INSERT INTO recepciones_caja (
        id,
        planilla_id,
        efectivo_esperado,
        efectivo_recibido,
        diferencia_efectivo,
        tiene_consignacion,
        numero_consignacion,
        banco,
        monto_consignacion,
        fecha_consignacion,
        observaciones,
        recibido_por,
        estado,
        descuento,              
        motivo_descuento 
      ) VALUES (
        ${recepcionId},
        ${planillaId},
        ${efectivoEsperadoAjustado},
        ${efectivoRecibido},
        ${diferenciaEfectivo},
        ${tieneConsignacion || false},
        ${numeroConsignacion || null},
        ${banco || null},
        ${montoConsignacion || null},
        ${fechaConsignacion || null},
        ${observaciones || null},
        ${session.user.id},
        ${estado},
        ${descuento || 0},              
        ${motivoDescuento || null}  
      )
      RETURNING *
    `

    await sql`
      UPDATE planillas 
      SET 
        cuadrado_en_caja = true,
        fecha_cuadre_caja = NOW(),
        updated_at = NOW()
      WHERE id = ${planillaId}
    `

    console.log('[API recibir-efectivo] ✓ Planilla actualizada como cuadrada')

    const configComision = await sql`
      SELECT porcentaje_comision 
      FROM comisiones_config 
      WHERE entregador = ${planilla[0].entregador} 
        AND activo = true
    `

    if (configComision.length > 0) {
      const porcentaje = Number(configComision[0].porcentaje_comision)
      const totalDevoluciones = Number(planilla[0].total_devolucion) || 0
      const baseComisionable = Math.round((Number(efectivoRecibido) - totalDevoluciones) * 100) / 100
      const montoComision = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100

      const yaExisteComision = await sql`
        SELECT id FROM comisiones WHERE planilla_id = ${planillaId}
      `

      if (yaExisteComision.length === 0) {
        await sql`
          INSERT INTO comisiones (
            entregador,
            fecha,
            planilla_id,
            total_entregas_efectivas,
            total_devoluciones,
            base_comisionable,
            porcentaje_aplicado,
            monto_comision,
            estado,
          ) VALUES (
            ${planilla[0].entregador},
            ${planilla[0].fecha},
            ${planillaId},
            ${efectivoRecibido},
            ${totalDevoluciones},
            ${baseComisionable},
            ${porcentaje},
            ${montoComision},
            'pendiente'
          )
        `

        console.log('[API recibir-efectivo] ✓ Comisión calculada y registrada:', {
          entregador: planilla[0].entregador,
          base: baseComisionable,
          porcentaje: porcentaje,
          comision: montoComision
        })
      } else {
        console.log('[API recibir-efectivo] ℹ Comisión ya existe para esta planilla')
      }
    } else {
      console.log('[API recibir-efectivo] ⚠ No hay configuración de comisión para:', planilla[0].entregador)
    }

    return NextResponse.json({
      success: true,
      recepcion: recepcion[0],
      mensaje: diferenciaEfectivo === 0 
        ? 'Efectivo cuadrado correctamente' 
        : `Recepción registrada con diferencia de ${diferenciaEfectivo > 0 ? '+' : ''}${diferenciaEfectivo}`
    })

  } catch (error) {
    console.error('[API recibir-efectivo] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al registrar recepción',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
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

    const recepciones = await sql`
      SELECT 
        r.*,
        p.entregador,
        p.tipo_ruta,
        p.fecha as fecha_planilla,
        u.nombre as recibido_por_nombre
      FROM recepciones_caja r
      JOIN planillas p ON r.planilla_id = p.id
      JOIN usuarios u ON r.recibido_por = u.id
      ORDER BY r.fecha_recepcion DESC
    `

    return NextResponse.json({
      recepciones
    })

  } catch (error) {
    console.error('[API recibir-efectivo GET] Error:', error)
    return NextResponse.json(
      { error: 'Error al cargar historial' },
      { status: 500 }
    )
  }
}
