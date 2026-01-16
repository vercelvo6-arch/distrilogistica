import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
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

    // Cálculos
    const totalConsignado = Number(montoConsignacion || 0)
    const totalEfectivo = Number(efectivoRecibido)
    const totalEsperadoNum = Number(totalEsperado)
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
        ${totalConsignado},
        ${diferencia},
        ${estado},
        ${observaciones || null},
        ${tieneConsignacion},
        ${numeroConsignacion || null},
        ${banco || null}
      )
      RETURNING id
    `

    // 🔥 FIX: Actualizar planillas una por una
    for (const planillaId of planillaIds) {
      await sql`
        UPDATE planillas
        SET cuadrado_en_caja = true,
            updated_at = NOW()
        WHERE id = ${planillaId}
      `
    }

    console.log('[CUADRE CAJA] ✓ Cuadre registrado:', result[0].id)

    return NextResponse.json({
      success: true,
      cuadreId: result[0].id,
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
