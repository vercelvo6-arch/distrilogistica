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
      descuento,           // ✅ NUEVO
      motivoDescuento      // ✅ NUEVO
    } = body

    // Validación
    if (!planillaIds || !Array.isArray(planillaIds) || planillaIds.length === 0) {
      return NextResponse.json(
        { error: 'No se recibieron planillas válidas' },
        { status: 400 }
      )
    }

    // Cálculos corregidos con descuento
    const totalConsignado = Number(montoConsignacion || 0)
    const totalEfectivo = Number(efectivoRecibido) || 0
    const totalEsperadoNum = Number(totalEsperado) || 0
    const descuentoNum = Number(descuento || 0)
    
    // ✅ Ajustar el total esperado restando el descuento
    const totalEsperadoAjustado = totalEsperadoNum - descuentoNum
    
    const totalRecibido = totalEfectivo + totalConsignado
    const diferencia = Math.round((totalRecibido - totalEsperadoAjustado) * 100) / 100
    const estado = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    console.log('[CUADRE CAJA] Registrando cuadre:', {
      entregador,
      planillas: planillaIds.length,
      totalEsperado: totalEsperadoNum,
      descuento: descuentoNum,
      totalEsperadoAjustado,
      totalRecibido,
      diferencia,
      estado
    })

    // Insertar cuadre con campos de descuento
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
        ${totalEsperadoAjustado},
        ${totalEfectivo},
        ${totalConsignado || 0},
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

    const cuadreId = result[0].id

    // Actualizar planillas
    for (const planillaId of planillaIds) {
      await sql`
        UPDATE planillas
        SET cuadrado_en_caja = true,
            updated_at = NOW()
        WHERE id = ${planillaId}
      `
    }

    console.log('[CUADRE CAJA] ✓ Planillas actualizadas:', planillaIds.length)

    // ✅ CREAR COMISIÓN PARA CUADRE AGRUPADO
    const configComision = await sql`
      SELECT porcentaje_comision 
      FROM comisiones_config 
      WHERE entregador = ${entregador} 
        AND activo = true
    `

    if (configComision.length > 0) {
      const porcentaje = Number(configComision[0].porcentaje_comision)
      
      // ✅ Base = efectivo recibido (sin restar devoluciones)
      const baseComisionable = Math.round(totalEfectivo * 100) / 100
      const montoComision = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100

      // ✅ CREAR COMISIÓN CON FECHA ACTUAL DEL CUADRE EN ZONA HORARIA DE COLOMBIA
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

      console.log('[CUADRE CAJA] ✓ Comisión agrupada creada:', {
        entregador,
        fechaCuadre: 'NOW() - fecha actual',
        planillasIncluidas: planillaIds.length,
        base: baseComisionable,
        porcentaje,
        comision: montoComision,
        descuento: descuentoNum
      })
    } else {
      console.log('[CUADRE CAJA] ⚠️ No hay configuración de comisión para:', entregador)
    }

    console.log('[CUADRE CAJA] ✓ Cuadre registrado exitosamente:', cuadreId)

    return NextResponse.json({
      success: true,
      cuadreId,
      mensaje: `✅ Cuadre registrado para ${planillaIds.length} ruta${planillaIds.length > 1 ? 's' : ''}`
    })

  } catch (error) {
    console.error('[CUADRE CAJA] ERROR:', error)
    return NextResponse.json(
      { 
        error: 'Error al registrar cuadre',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
