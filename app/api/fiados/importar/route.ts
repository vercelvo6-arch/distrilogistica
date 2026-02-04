import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    }

    // Leer el CSV como texto
    const text = await file.text()
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return NextResponse.json({ error: 'El archivo está vacío o no tiene datos' }, { status: 400 })
    }

    // Parsear el header
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    console.log('[IMPORTAR FIADOS] Headers:', headers)

    let importados = 0
    let errores = 0
    const erroresDetalle: string[] = []

    // Procesar cada línea (saltando el header)
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
        const row: any = {}
        
        // Crear objeto de la fila
        headers.forEach((header, index) => {
          row[header] = values[index] || ''
        })

        // Validaciones
        if (!row.Cliente || !row.Total || !row.Entregador) {
          errores++
          erroresDetalle.push(`Línea ${i + 1}: Faltan datos requeridos`)
          continue
        }

        // Parsear números
        const total = parseFloat(row.Total.replace(/[^0-9.-]/g, '')) || 0
        const montoPagado = parseFloat((row['Monto Pagado'] || row.Pagado || '0').replace(/[^0-9.-]/g, '')) || 0
        const saldoPendiente = row['Saldo Pendiente']
          ? parseFloat(row['Saldo Pendiente'].replace(/[^0-9.-]/g, ''))
          : total - montoPagado

        // Parsear fecha (formato: YYYY-MM-DD o DD/MM/YYYY)
        let fechaParsed = new Date()
        if (row.Fecha) {
          if (row.Fecha.includes('/')) {
            // DD/MM/YYYY
            const [day, month, year] = row.Fecha.split('/')
            fechaParsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          } else if (row.Fecha.includes('-')) {
            // YYYY-MM-DD
            fechaParsed = new Date(row.Fecha)
          }
        }

        // Generar ID único
        const pedidoId = `FIA${Date.now()}${Math.random().toString(36).substr(2, 9)}`

        // Insertar en pedidos
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
            monto_pagado,
            saldo_pendiente,
            observaciones,
            es_cobro,
            fiado_importado
          ) VALUES (
            ${pedidoId},
            NULL,
            ${row.Cliente},
            ${row.Direccion || row.Dirección || null},
            ${row.Telefono || row.Teléfono || null},
            ${row.Barrio || null},
            ${saldoPendiente > 0 ? 'fiado' : 'pagado'},
            ${total},
            ${montoPagado},
            ${saldoPendiente},
            ${row.Observaciones || null},
            false,
            true
          )
        `

        // Registro en historial
        await sql`
          INSERT INTO fiados_historial (
            pedido_id,
            entregador,
            tipo_ruta,
            fecha_original,
            importado_por,
            importado_en
          ) VALUES (
            ${pedidoId},
            ${row.Entregador},
            ${row.Ruta || 'N/A'},
            ${fechaParsed.toISOString()},
            ${session.user.id},
            NOW()
          )
        `

        importados++

      } catch (err) {
        errores++
        console.error(`[IMPORTAR FIADOS] Error línea ${i + 1}:`, err)
        erroresDetalle.push(`Línea ${i + 1}: ${(err as Error).message}`)
      }
    }

    return NextResponse.json({
      success: true,
      mensaje: `✅ ${importados} fiado(s) importado(s)${errores > 0 ? ` | ${errores} error(es)` : ''}`,
      importados,
      errores,
      erroresDetalle: errores > 0 ? erroresDetalle.slice(0, 10) : undefined
    })

  } catch (error) {
    console.error('[IMPORTAR FIADOS] ERROR:', error)
    return NextResponse.json(
      { 
        error: 'Error al importar fiados',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
