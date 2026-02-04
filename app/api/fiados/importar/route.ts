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

    let rows: any[] = []

    // Detectar tipo de archivo
    if (file.name.endsWith('.csv')) {
      // Procesar CSV
      const text = await file.text()
      const lines = text.split('\n').filter(line => line.trim())

      if (lines.length < 2) {
        return NextResponse.json({ error: 'El archivo está vacío' }, { status: 400 })
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
        const row: any = {}
        headers.forEach((header, index) => {
          row[header] = values[index] || ''
        })
        rows.push(row)
      }

    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // Procesar Excel
      const XLSX = require('xlsx')
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      
      rows = XLSX.utils.sheet_to_json(worksheet)

    } else {
      return NextResponse.json({ 
        error: 'Formato no soportado. Use .csv, .xlsx o .xls' 
      }, { status: 400 })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No hay datos para importar' }, { status: 400 })
    }

    console.log('[IMPORTAR] Procesando', rows.length, 'registros')

    let importados = 0
    let errores = 0
    const erroresDetalle: string[] = []

    for (let i = 0; i < rows.length; i++) {
      try {
        const r = rows[i]

        // Validar datos requeridos
        if (!r.Cliente || !r.Total || !r.Entregador) {
          errores++
          erroresDetalle.push(`Fila ${i + 2}: Faltan Cliente, Total o Entregador`)
          continue
        }

        // Parsear números
        const total = parseFloat(String(r.Total).replace(/[^0-9.-]/g, '')) || 0
        const montoPagado = parseFloat(String(r['Monto Pagado'] || r.Pagado || 0).replace(/[^0-9.-]/g, '')) || 0
        const saldoPendiente = r['Saldo Pendiente']
          ? parseFloat(String(r['Saldo Pendiente']).replace(/[^0-9.-]/g, ''))
          : total - montoPagado

        // Parsear fecha
        let fechaParsed = new Date()
        if (r.Fecha) {
          if (typeof r.Fecha === 'number') {
            // Excel serial date
            const excelEpoch = new Date(1899, 11, 30)
            fechaParsed = new Date(excelEpoch.getTime() + r.Fecha * 86400000)
          } else if (typeof r.Fecha === 'string') {
            if (r.Fecha.includes('/')) {
              const [day, month, year] = r.Fecha.split('/')
              fechaParsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
            } else {
              fechaParsed = new Date(r.Fecha)
            }
          }
        }

        // Generar ID
        const pedidoId = `FIA${Date.now()}${Math.random().toString(36).substr(2, 9)}`

        // Insertar pedido
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
            ${String(r.Cliente).trim()},
            ${r.Direccion || r.Dirección || null},
            ${r.Telefono || r.Teléfono || null},
            ${r.Barrio || null},
            ${saldoPendiente > 0 ? 'fiado' : 'pagado'},
            ${total},
            ${montoPagado},
            ${saldoPendiente},
            ${r.Observaciones || null},
            false,
            true
          )
        `

        // Historial
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
            ${String(r.Entregador).trim()},
            ${r.Ruta || 'N/A'},
            ${fechaParsed.toISOString()},
            ${session.user.id},
            NOW()
          )
        `

        importados++

      } catch (err) {
        errores++
        console.error(`[IMPORTAR] Error fila ${i + 2}:`, err)
        erroresDetalle.push(`Fila ${i + 2}: ${(err as Error).message}`)
      }
    }

    return NextResponse.json({
      success: true,
      mensaje: `✅ ${importados} fiado(s) importado(s)${errores > 0 ? ` (${errores} errores)` : ''}`,
      importados,
      errores,
      erroresDetalle: errores > 0 ? erroresDetalle.slice(0, 10) : undefined
    })

  } catch (error) {
    console.error('[IMPORTAR] ERROR:', error)
    return NextResponse.json(
      { 
        error: 'Error al importar',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
