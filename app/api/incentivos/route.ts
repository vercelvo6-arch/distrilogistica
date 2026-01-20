import { NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { entregador, monto, fechaInicio, fechaFin, motivo } = await request.json()

    const sql = getDB()

    await sql`
      INSERT INTO incentivos (
        entregador,
        monto,
        fecha_inicio,
        fecha_fin,
        motivo,
        creado_por,
        fecha_creacion
      ) VALUES (
        ${entregador},
        ${monto},
        ${fechaInicio},
        ${fechaFin},
        ${motivo || 'Bajo porcentaje de devoluciones'},
        ${session.user.id},
        NOW()
      )
    `

    return NextResponse.json({
      success: true,
      mensaje: 'Incentivo registrado correctamente'
    })

  } catch (error) {
    console.error('[API incentivos] Error:', error)
    return NextResponse.json(
      { error: 'Error al guardar incentivo' },
      { status: 500 }
    )
  }
}
