import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { parseNurturingCSV, parsePlanillaCSV, generateOrdersFromSales, generateRouteSheets } from '@/lib/csv-parser'

const BATCH_SIZE = 200 // Procesar 200 pedidos por lote

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { action, nurturingCSV, planillaCSV, offset } = body

    // ACCIÓN 1: PARSE - Contar filas
    if (action === 'parse') {
      const sales = parseNurturingCSV(nurturingCSV)
      
      return NextResponse.json({
        success: true,
        totalRows: sales.length,
        message: `Se encontraron ${sales.length} ventas en el archivo`
      })
    }

    // ACCIÓN 2: IMPORT-BATCH - Procesar lote
    if (action === 'import-batch') {
      const sales = parseNurturingCSV(nurturingCSV)
      const products = parsePlanillaCSV(planillaCSV)

      if (sales.length === 0) {
        return NextResponse.json({ error: 'No se encontraron ventas' }, { status: 400 })
      }

      if (products.length === 0) {
        return NextResponse.json({ error: 'No se encontró inventario' }, { status: 400 })
      }

      // Obtener el lote actual
      const currentOffset = offset || 0
      const salesBatch = sales.slice(currentOffset, currentOffset + BATCH_SIZE)

      if (salesBatch.length === 0) {
        return NextResponse.json({
          success: true,
          imported: 0,
          hasMore: false,
          offset: currentOffset,
          progress: 100
        })
      }

      // Generar pedidos del lote
      const fecha = new Date().toISOString().split('T')[0]
      const orders = generateOrdersFromSales(salesBatch, products, fecha)
      const sheets = generateRouteSheets(orders)

      // Guardar en BD
      const sql = getDB()
      let insertedCount = 0

      for (const sheet of sheets) {
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
                total
              ) VALUES (
                ${pedidoId},
                ${item.codigo},
                ${item.descripcion},
                ${item.categoria || null},
                ${item.cantidad},
                ${item.valorUnidad},
                ${item.subtotal}
              )
            `
          }
        }

        insertedCount++
      }

      const nextOffset = currentOffset + BATCH_SIZE
      const hasMore = nextOffset < sales.length
      const progress = Math.round((nextOffset / sales.length) * 100)

      return NextResponse.json({
        success: true,
        imported: salesBatch.length,
        insertedSheets: insertedCount,
        hasMore,
        offset: nextOffset,
        progress: Math.min(progress, 100),
        totalRows: sales.length
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
