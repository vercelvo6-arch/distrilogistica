import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

// POST - Verificar si alguna referencia de consignación ya fue usada en un cuadre anterior
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { numeros } = body

    if (!numeros || !Array.isArray(numeros) || numeros.length === 0) {
      return NextResponse.json({ duplicados: [] })
    }

    const sql = getDB()

    // Buscar en cuadres_caja si alguno de estos números ya existe en consignaciones guardadas
    // La columna consignaciones es jsonb — buscamos dentro del array
    const resultadoConsignaciones = await sql`
      SELECT DISTINCT elem->>'numero' as numero
      FROM cuadres_caja,
      jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(consignaciones) = 'array' THEN consignaciones
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE LOWER(elem->>'numero') = ANY(
        SELECT LOWER(n) FROM unnest(${numeros}::text[]) n
      )
      AND elem->>'numero' IS NOT NULL
      AND elem->>'numero' != ''
    `

    // Buscar también en abonos_fiados (referencias de cobros CxC ya registrados)
    const resultadoCobrosCxC = await sql`
      SELECT DISTINCT referencia_pago as numero
      FROM abonos_fiados
      WHERE LOWER(referencia_pago) = ANY(
        SELECT LOWER(n) FROM unnest(${numeros}::text[]) n
      )
      AND referencia_pago IS NOT NULL
      AND referencia_pago != ''
    `

    const duplicados = Array.from(new Set([
      ...resultadoConsignaciones.map((r: any) => r.numero),
      ...resultadoCobrosCxC.map((r: any) => r.numero),
    ]))

    return NextResponse.json({ duplicados })

  } catch (error) {
    console.error('[VALIDAR CONSIGNACIONES] ERROR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al validar' },
      { status: 500 }
    )
  }
}
