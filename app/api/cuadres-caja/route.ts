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
      observaciones
    } = body

    // Validación
    if (!planillaIds || !Array.isArray(planillaIds) || planillaIds.length === 0) {
      return NextResponse.json(
        { error: 'No se recibieron planillas válidas' },
        { status: 400 }
      )
    }

    // Cálculos corregidos
    const totalConsignado = Number(montoConsignacion || 0)
    const totalEfectivo = Number(efectivoRecibido) || 0
    const totalEsperadoNum = Number(totalEsperado) || 0
    const totalRecibido = totalEfectivo + totalConsignado
    const diferencia = Math.round((totalRecibido - totalEsperadoNum) * 100) / 100
    const estado = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    console.log('[CUADRE CAJA] Registrando cuadre:', {
      entregador,
      planillas: planillaIds.length,
      totalEsperado: totalEsperadoNum,
      totalRecibido,
      diferencia,
      estado
    })

    // Insertar cuadre
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
        banco
      ) VALUES (
        ${entregador},
        NOW(),
        ${planillaIds},
        ${totalEsperadoNum},
        ${totalEfectivo},
        ${totalConsignado || 0},
        ${diferencia},
        ${estado},
        ${observaciones || null},
        ${tieneConsignacion || false},
        ${numeroConsignacion || null},
        ${banco || null}
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

      // Obtener fecha de la primera planilla
      const primeraFecha = await sql`
        SELECT fecha FROM planillas WHERE id = ${planillaIds[0]}
      `

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
          ${primeraFecha[0].fecha},
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
        base: baseComisionable,
        porcentaje,
        comision: montoComision
      })
    }

    console.log('[CUADRE CAJA] ✓ Cuadre registrado:', cuadreId)

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
