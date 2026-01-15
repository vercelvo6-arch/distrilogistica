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

    if (!planillaIds || planillaIds.length === 0) {
      return NextResponse.json(
        { error: 'No se recibieron planillas' },
        { status: 400 }
      )
    }

    const totalConsignado = Number(montoConsignacion || 0)
    const totalEfectivo = Number(efectivoRecibido)
    const totalEsperadoNum = Number(totalEsperado)

    const totalRecibido = totalEfectivo + totalConsignado
    const diferencia = totalRecibido - totalEsperadoNum

    const estado = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

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

    await sql`
      UPDATE planillas
      SET cuadrado_en_caja = true
      WHERE id = ANY(${planillaIds})
    `

    return NextResponse.json({
      success: true,
      cuadreId: result[0].id,
      mensaje: `✅ Cuadre registrado para ${planillaIds.length} rutas`
    })

  } catch (error) {
    console.error('[CUADRE CAJA]', error)
    return NextResponse.json(
      { error: 'Error interno al registrar cuadre' },
      { status: 500 }
    )
  }
}
