import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'

const BATCH_SIZE = 10 // Procesar 10 rutas completas por lote

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { action, routeSheets, offset } = body

    // ACCIÓN 1: PARSE - Contar rutas
    if (action === 'parse') {
      return NextResponse.json({
        success: true,
        totalRoutes: routeSheets.length,
        message: `Se generaron ${routeSheets.length} rutas`
      })
    }

    // ACCIÓN 2: IMPORT-BATCH - Procesar lote de rutas completas
    if (action === 'import-batch') {
      if (!Array.isArray(routeSheets) || routeSheets.length === 0) {
        return NextResponse.json({ error: 'No se recibieron rutas' }, { status: 400 })
      }

      // Obtener el lote actual de RUTAS COMPLETAS
      const currentOffset = offset || 0
      const sheetsBatch = routeSheets.slice(currentOffset, currentOffset + BATCH_SIZE)

      if (sheetsBatch.length === 0) {
        return NextResponse.json({
          success: true,
          imported: 0,
          hasMore: false,
          offset: currentOffset,
          progress: 100
        })
      }

      // Guardar en BD
      const sql = getDB()
      let insertedCount = 0
      const fecha = new Date().toISOString().split('T')[0]

      for (const sheet of sheetsBatch) {
        const timestamp = Date.now()
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
        const planillaId = `PLN${timestamp}${random}`

        await sql`
          INSERT INTO planillas (
            id,
            tipo_ruta,
            fecha,
            entregador,
            estado,
            total_cargue,
            created_at
          ) VALUES (
            ${planillaId},
            ${sheet.ruta},
            ${fecha},
            NULL,
            'pendiente',
            ${sheet.totalAmount},
            NOW()
          )
        `

        let secuencia = 1
        for (const order of sheet.orders) {
          const pedidoTimestamp = Date.now()
          const pedidoRandom = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
          const pedidoId = `PED${pedidoTimestamp}${pedidoRandom}`

          await sql`
            INSERT INTO pedidos (
              id,
              planilla_id,
              cliente,
              direccion,
              telefono,
              barrio,
              estado,
              total,
              observaciones,
              secuencia
            ) VALUES (
              ${pedidoId},
              ${planillaId},
              ${order.cliente},
              ${order.direccion || null},
              ${order.telefono || null},
              ${order.barrio || null},
              'pendiente',
              ${order.total},
              ${order.comentarios || null},
              ${secuencia}
            )
          `

          secuencia++

          for (const item of order.items) {
            await sql`
              INSERT INTO pedido_productos (
                pedido_id,
                codigo,
                nombre,
                categoria,
                cantidad,
                precio_unitario,
                total,
                comentario
              ) VALUES (
                ${pedidoId},
                ${item.codigo},
                ${item.descripcion},
                ${item.categoria || null},
                ${item.cantidad},
                ${item.valorUnidad},
                ${item.subtotal},
                ${item.comentario || null}
              )
            `
          }
        }

        insertedCount++
      }

      const nextOffset = currentOffset + BATCH_SIZE
      const hasMore = nextOffset < routeSheets.length
      const progress = Math.round((nextOffset / routeSheets.length) * 100)

      return NextResponse.json({
        success: true,
        imported: sheetsBatch.length,
        insertedSheets: insertedCount,
        hasMore,
        offset: nextOffset,
        progress: Math.min(progress, 100),
        totalRoutes: routeSheets.length
      })
    }

    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })

  } catch (error) {
    console.error('[IMPORT-CSV] Error:', error)
    return NextResponse.json(
      { error: 'Error al procesar: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
