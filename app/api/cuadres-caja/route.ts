import { sql } from '@vercel/postgres'
import { NextResponse } from 'next/server'

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

    const totalConsignado = montoConsignacion ? Number(montoConsignacion) : 0
    const totalRecibido = Number(efectivoRecibido) + totalConsignado
    const diferencia = totalRecibido - Number(totalEsperado)

    // Insertar cuadre agrupado
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
        ${totalEsperado},
        ${efectivoRecibido},
        ${totalConsignado},
        ${diferencia},
        ${diferencia === 0 ? 'cuadrado' : 'con_diferencia'},
        ${observaciones || null},
        ${tieneConsignacion},
        ${numeroConsignacion || null},
        ${banco || null}
      )
      RETURNING id
    `

    // Marcar todas las planillas como cuadradas
    await sql`
      UPDATE planillas 
      SET cuadrado_en_caja = true 
      WHERE id = ANY(${planillaIds})
    `

    return NextResponse.json({ 
      success: true,
      cuadreId: result.rows[0].id,
      mensaje: `✅ Cuadre agrupado registrado: ${planillaIds.length} rutas`
    })

  } catch (error) {
    console.error('[API] Error al crear cuadre agrupado:', error)
    return NextResponse.json(
      { error: 'Error al registrar cuadre agrupado' },
      { status: 500 }
    )
  }
}
