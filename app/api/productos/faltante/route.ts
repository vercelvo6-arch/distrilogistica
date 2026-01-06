import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    console.log('[API FALTANTE] Request body:', body)

    const { 
      codigo, 
      entregador, 
      cantidadSolicitada,
      cantidadDisponible, 
      cantidadFaltante,
      unidadIncompleta,
      observaciones,
      usuarioId 
    } = body

    if (!codigo || !entregador || cantidadDisponible === undefined) {
      console.error('[API FALTANTE] Datos incompletos:', { codigo, entregador, cantidadDisponible })
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    const sql = getDB()

    // Obtener planillas del entregador que están en proceso de alistamiento
    const planillas = await sql`
      SELECT id FROM planillas 
      WHERE entregador = ${entregador} 
      AND estado IN ('pendiente', 'alistando')
    `

    console.log('[API FALTANTE] Planillas encontradas:', planillas.length)

    if (planillas.length === 0) {
      return NextResponse.json({ error: 'No hay planillas activas para este entregador' }, { status: 404 })
    }

    const planillaIds = planillas.map(p => p.id)

    // Actualizar productos en la tabla correcta: "productos"
    const result = await sql`
      UPDATE productos
      SET 
        cantidad_disponible = ${cantidadDisponible},
        cantidad_faltante = ${cantidadFaltante || 0},
        unidad_incompleta = ${unidadIncompleta || false},
        observaciones_faltante = ${observaciones || null},
        updated_at = NOW()
      WHERE codigo = ${codigo}
      AND pedido_id IN (
        SELECT id FROM pedidos 
        WHERE planilla_id = ANY(${planillaIds})
      )
    `

    console.log(`[API FALTANTE] ✓ Producto ${codigo}:`)
    console.log(`  - Disponible: ${cantidadDisponible}/${cantidadSolicitada}`)
    console.log(`  - Faltante: ${cantidadFaltante || 0}`)
    console.log(`  - Incompleta: ${unidadIncompleta || false}`)
    console.log(`  - Observaciones: ${observaciones || 'N/A'}`)
    console.log(`  - Registros actualizados: ${result.count}`)

    return NextResponse.json({ 
      success: true,
      message: unidadIncompleta 
        ? `Registrado como incompleto: ${observaciones}`
        : (cantidadFaltante || 0) > 0 
          ? `Faltante: ${cantidadFaltante} unidades` 
          : 'Cantidad completa registrada',
      updated: result.count,
      data: {
        cantidadDisponible,
        cantidadFaltante: cantidadFaltante || 0,
        unidadIncompleta: unidadIncompleta || false,
        observaciones
      }
    })

  } catch (error) {
    console.error('[API FALTANTE] Error completo:', error)
    console.error('[API FALTANTE] Stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al registrar cantidad' },
      { status: 500 }
    )
  }
}
