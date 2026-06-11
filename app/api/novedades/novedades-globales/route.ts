import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

// GET /api/novedades-globales?entregador=X&fecha=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const entregador = searchParams.get('entregador')
    const fecha      = searchParams.get('fecha') || new Date().toISOString().split('T')[0]

    if (!entregador) return NextResponse.json({ error: 'entregador requerido' }, { status: 400 })

    const sql = getDB()

    const [row] = await sql`
      SELECT * FROM novedades_globales_entregador
      WHERE entregador = ${entregador}
        AND fecha = ${fecha}::date
    `

    // Si no existe, devolver valores en 0
    return NextResponse.json({
      success: true,
      novedades: row || {
        entregador,
        fecha,
        agotados:     0,
        devoluciones: 0,
        descuentos:   0,
        fiados:       0,
      }
    })
  } catch (error) {
    console.error('[GET novedades-globales]', error)
    return NextResponse.json({ error: 'Error al cargar novedades' }, { status: 500 })
  }
}

// POST /api/novedades-globales — upsert
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const body = await request.json()
    const { entregador, fecha, agotados, devoluciones, descuentos, fiados } = body

    if (!entregador) return NextResponse.json({ error: 'entregador requerido' }, { status: 400 })

    const fechaFinal = fecha || new Date().toISOString().split('T')[0]
    const sql = getDB()

    const [row] = await sql`
      INSERT INTO novedades_globales_entregador
        (entregador, fecha, agotados, devoluciones, descuentos, fiados, updated_at)
      VALUES
        (${entregador}, ${fechaFinal}::date,
         ${Number(agotados)     || 0},
         ${Number(devoluciones) || 0},
         ${Number(descuentos)   || 0},
         ${Number(fiados)       || 0},
         NOW())
      ON CONFLICT (entregador, fecha) DO UPDATE SET
        agotados     = ${Number(agotados)     || 0},
        devoluciones = ${Number(devoluciones) || 0},
        descuentos   = ${Number(descuentos)   || 0},
        fiados       = ${Number(fiados)       || 0},
        updated_at   = NOW()
      RETURNING *
    `

    return NextResponse.json({ success: true, novedades: row })
  } catch (error) {
    console.error('[POST novedades-globales]', error)
    return NextResponse.json({ error: 'Error al guardar novedades' }, { status: 500 })
  }
}
