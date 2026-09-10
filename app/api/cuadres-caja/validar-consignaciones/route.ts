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
    // La columna consignaciones es jsonb — buscamos dentro del array, junto con el cliente y
    // la fecha que quedaron guardados en ese elemento y el entregador/fecha del cuadre que lo registró,
    // para poder mostrarle a caja cuándo y con qué cliente se usó esa referencia.
    const resultadoConsignaciones = await sql`
      SELECT DISTINCT ON (LOWER(elem->>'numero'))
        elem->>'numero' as numero,
        elem->>'cliente' as cliente,
        elem->>'fecha' as fecha,
        cc.entregador as entregador,
        cc.fecha_cuadre as fecha_cuadre,
        'consignacion' as origen
      FROM cuadres_caja cc,
      jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(cc.consignaciones) = 'array' THEN cc.consignaciones
          ELSE '[]'::jsonb
        END
      ) AS elem
      WHERE LOWER(elem->>'numero') = ANY(
        SELECT LOWER(n) FROM unnest(${numeros}::text[]) n
      )
      AND elem->>'numero' IS NOT NULL
      AND elem->>'numero' != ''
      ORDER BY LOWER(elem->>'numero'), cc.fecha_cuadre DESC
    `

    // Buscar también en abonos_fiados (referencias de cobros CxC ya registrados),
    // con el cliente resuelto desde fiados o pedidos según de dónde vino el abono.
    const resultadoCobrosCxC = await sql`
      SELECT DISTINCT ON (LOWER(af.referencia_pago))
        af.referencia_pago as numero,
        COALESCE(f.cliente, p.cliente) as cliente,
        af.fecha_abono as fecha,
        af.entregador_cobro as entregador,
        'cobro' as origen
      FROM abonos_fiados af
      LEFT JOIN fiados f ON af.origen_tabla = 'fiados' AND f.id::text = af.pedido_id
      LEFT JOIN pedidos p ON af.origen_tabla = 'pedidos' AND p.id = af.pedido_id
      WHERE LOWER(af.referencia_pago) = ANY(
        SELECT LOWER(n) FROM unnest(${numeros}::text[]) n
      )
      AND af.referencia_pago IS NOT NULL
      AND af.referencia_pago != ''
      ORDER BY LOWER(af.referencia_pago), af.fecha_abono DESC
    `

    // Una referencia puede aparecer en ambas fuentes — nos quedamos con un registro
    // por número, dando prioridad a la consignación (trae la fecha del abono real,
    // no la del cuadre) cuando exista en las dos.
    const porNumero = new Map<string, any>()
    for (const r of [...resultadoCobrosCxC, ...resultadoConsignaciones]) {
      porNumero.set(String(r.numero).toLowerCase(), {
        numero: r.numero,
        cliente: r.cliente || null,
        fecha: r.fecha || r.fecha_cuadre || null,
        entregador: r.entregador || null,
        origen: r.origen,
      })
    }

    const duplicados = Array.from(porNumero.values())

    return NextResponse.json({ duplicados })

  } catch (error) {
    console.error('[VALIDAR CONSIGNACIONES] ERROR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al validar' },
      { status: 500 }
    )
  }
}
