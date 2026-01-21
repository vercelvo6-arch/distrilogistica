import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[CUADRE CAJA] Body recibido:', JSON.stringify(body, null, 2))

    const {
      planillaIds,
      entregador,
      totalEsperado,
      efectivoRecibido,
      tieneConsignacion,
      numeroConsignacion,
      banco,
      montoConsignacion,
      observaciones,
      descuento,
      motivoDescuento,
      agotados
    } = body

    // Validación
    if (!planillaIds || !Array.isArray(planillaIds) || planillaIds.length === 0) {
      console.error('[CUADRE CAJA] Error: planillaIds inválido:', planillaIds)
      return NextResponse.json(
        { error: 'No se recibieron planillas válidas' },
        { status: 400 }
      )
    }

    if (!entregador) {
      console.error('[CUADRE CAJA] Error: entregador faltante')
      return NextResponse.json(
        { error: 'Entregador es requerido' },
        { status: 400 }
      )
    }

    if (!efectivoRecibido && efectivoRecibido !== 0) {
      console.error('[CUADRE CAJA] Error: efectivoRecibido faltante')
      return NextResponse.json(
        { error: 'Efectivo recibido es requerido' },
        { status: 400 }
      )
    }

    // Cálculos
    const totalConsignado = Number(montoConsignacion || 0)
    const totalEfectivo = Number(efectivoRecibido) || 0
    const totalEsperadoNum = Number(totalEsperado) || 0
    const descuentoNum = Number(descuento || 0)
    const agotadosNum = Number(agotados || 0)
    
    const totalRecibido = totalEfectivo + totalConsignado
    const diferencia = Math.round((totalRecibido - totalEsperadoNum) * 100) / 100
    const estado = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    console.log('[CUADRE CAJA] Valores calculados:', {
      entregador,
      planillas: planillaIds.length,
      totalEsperado: totalEsperadoNum,
      descuento: descuentoNum,
      agotados: agotadosNum,
      efectivo: totalEfectivo,
      consignacion: totalConsignado,
      totalRecibido,
      diferencia,
      estado
    })

    // Insertar cuadre
    console.log('[CUADRE CAJA] Insertando cuadre...')
    const result = await sql`
      INSERT INTO cuadres_caja (
        entregador,
        fecha_cuadre,
        planillas_ids,
        total_esperado,
        total_efectivo,
        total_consignado,
        diferencia,
        estado,
        observaciones,
        tiene_consignacion,
        numero_consignacion,
        banco,
        descuento,
        motivo_descuento
      ) VALUES (
        ${entregador},
        NOW(),
        ${planillaIds},
        ${totalEsperadoNum},
        ${totalEfectivo},
        ${totalConsignado},
        ${diferencia},
        ${estado},
        ${observaciones || null},
        ${tieneConsignacion || false},
        ${numeroConsignacion || null},
        ${banco || null},
        ${descuentoNum},
        ${motivoDescuento || null}
      )
      RETURNING id
    `

    if (!result || result.length === 0) {
      throw new Error('No se pudo insertar el cuadre en la base de datos')
    }

    const cuadreId = result[0].id
    console.log('[CUADRE CAJA] ✓ Cuadre insertado con ID:', cuadreId)

    // Actualizar planillas
    console.log('[CUADRE CAJA] Actualizando planillas:', planillaIds)
    for (const planillaId of planillaIds) {
      await sql`
        UPDATE planillas
        SET cuadrado_en_caja = true,
            updated_at = NOW()
        WHERE id = ${planillaId}
      `
    }
    console.log('[CUADRE CAJA] ✓ Planillas actualizadas:', planillaIds.length)

    // Crear comisión agrupada
    console.log('[CUADRE CAJA] Buscando config de comisión para:', entregador)
    const configComision = await sql`
      SELECT porcentaje_comision 
      FROM comisiones_config 
      WHERE entregador = ${entregador} 
        AND activo = true
    `

    if (configComision.length > 0) {
      const porcentaje = Number(configComision[0].porcentaje_comision)
      const baseComisionable = Math.round(totalEfectivo * 100) / 100
      const montoComision = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100

      console.log('[CUADRE CAJA] Creando comisión:', {
        porcentaje,
        base: baseComisionable,
        monto: montoComision
      })

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
          cuadre_agrupado_id
        ) VALUES (
          ${entregador},
          (NOW() AT TIME ZONE 'America/Bogota')::date,
          ${planillaIds[0]},
          ${totalEfectivo},
          ${0},
          ${baseComisionable},
          ${porcentaje},
          ${montoComision},
          'pendiente',
          ${cuadreId}
        )
      `

      console.log('[CUADRE CAJA] ✓ Comisión creada')
    } else {
      console.log('[CUADRE CAJA] ⚠️ No hay config de comisión para:', entregador)
    }

    console.log('[CUADRE CAJA] ✓✓✓ Proceso completado exitosamente')

    return NextResponse.json({
      success: true,
      cuadreId,
      mensaje: `✅ Cuadre registrado para ${planillaIds.length} ruta${planillaIds.length > 1 ? 's' : ''}`
    })

  } catch (error) {
    console.error('[CUADRE CAJA] ❌ ERROR:', error)
    console.error('[CUADRE CAJA] Stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { 
        error: 'Error al registrar cuadre',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    console.log('[CUADRE CAJA] Obteniendo historial...')

    const cuadres = await sql`
      SELECT 
        c.id,
        c.entregador,
        c.fecha_cuadre,
        c.planillas_ids,
        c.total_esperado,
        c.total_efectivo,
        c.total_consignado,
        c.diferencia,
        c.estado,
        c.observaciones,
        c.tiene_consignacion,
        c.numero_consignacion,
        c.banco,
        c.descuento,
        c.motivo_descuento,
        array_agg(DISTINCT p.tipo_ruta) FILTER (WHERE p.tipo_ruta IS NOT NULL) as rutas_nombres
      FROM cuadres_caja c
      LEFT JOIN planillas p ON p.id = ANY(c.planillas_ids)
      GROUP BY c.id
      ORDER BY c.fecha_cuadre DESC
      LIMIT 100
    `

    console.log('[CUADRE CAJA] ✓ Historial obtenido:', cuadres.length, 'registros')

    return NextResponse.json({
      success: true,
      cuadres
    })

  } catch (error) {
    console.error('[CUADRE CAJA] ERROR al obtener historial:', error)
    return NextResponse.json(
      { 
        error: 'Error al cargar historial',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
