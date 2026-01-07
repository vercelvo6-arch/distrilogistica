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
    if (unidadIncompleta && !observaciones?.trim()) {
      return NextResponse.json(
        { error: 'Las unidades incompletas requieren observaciones' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Obtener planillas del entregador que están pendientes o en proceso de alistamiento
    const planillas = await sql`
      SELECT id FROM planillas 
      WHERE entregador = ${entregador} 
      AND estado IN ('pendiente', 'alistando', 'alistándose')
    `

    console.log('[API FALTANTE] Planillas encontradas:', planillas.length)

    if (planillas.length === 0) {
      return NextResponse.json(
        { error: 'No hay planillas activas para este entregador' },
        { status: 404 }
      )
    }

    // Calcular valores con defaults seguros
    const disponible = Number(cantidadDisponible) || 0
    const faltante = Number(cantidadFaltante) || 0
    const esIncompleta = Boolean(unidadIncompleta)
    const obs = esIncompleta && observaciones ? observaciones.trim() : null

    console.log('[API FALTANTE] Valores a actualizar:', {
      disponible,
      faltante,
      esIncompleta,
      obs
    })

    // Actualizar productos iterando sobre cada planilla
    let totalUpdated = 0
    const planillaIds = planillas.map(p => p.id)

    try {
      // Hacer una sola actualización para todos los productos del código en todas las planillas
      const updated = await sql`
        UPDATE pedido_productos
        SET 
          cantidad_disponible = ${disponible},
          cantidad_faltante = ${faltante},
          unidad_incompleta = ${esIncompleta},
          observaciones_faltante = ${obs}
        WHERE codigo = ${codigo}
        AND pedido_id IN (
          SELECT id FROM pedidos 
          WHERE planilla_id = ANY(${planillaIds})
        )
      `
      
      totalUpdated = updated.count || 0
      console.log(`[API FALTANTE] Registros actualizados: ${totalUpdated}`)

    } catch (updateError) {
      console.error('[API FALTANTE] Error en UPDATE:', updateError)
      throw updateError
    }

    if (totalUpdated === 0) {
      // Verificar si existen los productos
      const existingProducts = await sql`
        SELECT pp.* 
        FROM pedido_productos pp
        JOIN pedidos p ON pp.pedido_id = p.id
        WHERE pp.codigo = ${codigo}
        AND p.planilla_id = ANY(${planillaIds})
      `
      
      console.log('[API FALTANTE] Productos encontrados:', existingProducts.length)
      
      return NextResponse.json(
        { 
          error: 'No se encontraron productos para actualizar',
          debug: {
            codigo,
            planillas: planillaIds,
            productosEncontrados: existingProducts.length
          }
        },
        { status: 404 }
      )
    }

    console.log(`[API FALTANTE] ✓ Producto ${codigo}:`)
    console.log(`  - Disponible: ${disponible}/${cantidadSolicitada}`)
    console.log(`  - Faltante: ${faltante}`)
    console.log(`  - Incompleta: ${esIncompleta}`)
    console.log(`  - Observaciones: ${obs || 'N/A'}`)
    console.log(`  - Registros actualizados: ${totalUpdated}`)

    return NextResponse.json({ 
      success: true,
      message: esIncompleta 
        ? `Registrado como incompleto: ${obs}`
        : faltante > 0 
          ? `Faltante: ${faltante} unidades` 
          : 'Cantidad completa registrada',
      updated: totalUpdated,
      data: {
        cantidadDisponible: disponible,
        cantidadFaltante: faltante,
        unidadIncompleta: esIncompleta,
        observaciones: obs
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
