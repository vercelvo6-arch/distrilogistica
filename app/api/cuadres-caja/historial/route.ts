import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: Request) {
  try {
    // Consultar cuadres agrupados
    const cuadres = await sql`
      SELECT 
        id,
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
      FROM cuadres_caja
      ORDER BY fecha_cuadre DESC
      LIMIT 100
    `

    return NextResponse.json({
      success: true,
      cuadres
    })

  } catch (error) {
    console.error('[HISTORIAL CUADRES] ERROR:', error)
    return NextResponse.json(
      { error: 'Error al cargar historial' },
      { status: 500 }
    )
  }
}
