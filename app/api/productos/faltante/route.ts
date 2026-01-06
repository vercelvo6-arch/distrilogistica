import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  console.log('🔵 [FALTANTE API] Endpoint alcanzado!')
  
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

    // Validaciones
    if (!codigo || !entregador || cantidadDisponible === undefined) {
      console.error('[API FALTANTE] Datos incompletos:', { codigo, entregador, cantidadDisponible })
      return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
    }

    // Validación: si es incompleta debe tener observaciones
    if (unidadIncompleta && !observaciones) {
      return NextResponse.json(
        { error: 'Las unidades incompletas requieren observaciones' },
        { status: 400 }
      )
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
      return NextResponse.json(
        { error: 'No hay planillas activas para este entregador' },
        { status: 404 }
      )
    }

    // Actualizar productos iterando sobre cada planilla
    let totalUpdated = 0
    for (const planilla of planillas) {
      try {
        const updated = await sql`
          UPDATE producto
          SET 
            cantidad_disponible = ${cantidadDisponible},
            cantidad_faltante = ${cantidadFaltante || 0},
            unidad_incompleta = ${unidadIncompleta || false},
            observaciones_faltante = ${observaciones || null},
            updated_at = NOW()
          WHERE codigo = ${codigo}
          AND pedido_id IN (
            SELECT id FROM pedidos 
            WHERE planilla_id = ${planilla.id}
          )
        `
        
        totalUpdated += updated.count || 0
      } catch (error) {
        console.error('[API FALTANTE] Error actualizando planilla', planilla.id, ':', error)
      }
    }

    console.log(`[API FALTANTE] ✓ Producto ${codigo}:`)
    console.log(`  - Disponible: ${cantidadDisponible}/${cantidadSolicitada}`)
    console.log(`  - Faltante: ${cantidadFaltante || 0}`)
    console.log(`  - Incompleta: ${unidadIncompleta || false}`)
    console.log(`  - Observaciones: ${observaciones || 'N/A'}`)
    console.log(`  - Registros actualizados: ${totalUpdated}`)

    if (totalUpdated === 0) {
      return NextResponse.json(
        { error: 'No se encontraron productos para actualizar' },
        { status: 404 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: unidadIncompleta 
        ? `Registrado como incompleto: ${observaciones}`
        : (cantidadFaltante || 0) > 0 
          ? `Faltante: ${cantidadFaltante} unidades` 
          : 'Cantidad completa registrada',
      updated: totalUpdated,
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
      { 
        error: 'Error al registrar cantidad disponible',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
