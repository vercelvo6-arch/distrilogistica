import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    console.log('[IMPORTAR] === INICIO ===')
    
    const session = await getSession()
    if (!session?.user) {
      console.log('[IMPORTAR] ERROR: No autenticado')
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    console.log('[IMPORTAR] Usuario:', session.user.username || session.user.email)

    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      console.log('[IMPORTAR] ERROR: No se recibió archivo')
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    }

    console.log('[IMPORTAR] Archivo:', file.name, 'Tamaño:', file.size, 'bytes')

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ 
        error: 'Solo se aceptan archivos CSV (.csv)' 
      }, { status: 400 })
    }

    // Leer CSV
    const text = await file.text()
    console.log('[IMPORTAR] Contenido leído, longitud:', text.length)
    
    const lines = text.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      console.log('[IMPORTAR] ERROR: Archivo vacío o solo tiene headers')
      return NextResponse.json({ error: 'El archivo está vacío o no tiene datos' }, { status: 400 })
    }

    // ✅ USAR PUNTO Y COMA como delimitador
    const delimiter = ';'
    
    // Parsear headers
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/["\r\n]/g, ''))
    console.log('[IMPORTAR] Headers detectados:', headers)

    // Parsear filas
    const rows: any[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(delimiter).map(v => v.trim().replace(/["\r\n]/g, ''))
      const row: any = {}
      headers.forEach((header, index) => {
        row[header] = values[index] || ''
      })
      rows.push(row)
    }

    console.log('[IMPORTAR] Total filas a procesar:', rows.length)
    if (rows.length > 0) {
      console.log('[IMPORTAR] Ejemplo primera fila:', JSON.stringify(rows[0], null, 2))
    }

    let importados = 0
    let errores = 0
    const erroresDetalle: string[] = []

    for (let i = 0; i < rows.length; i++) {
      try {
        const r = rows[i]

        // ✅ VALIDACIÓN MÍNIMA: Solo cliente y total son obligatorios
        if (!r.Cliente || !r.Total) {
          errores++
          const mensaje = `Fila ${i + 2}: Faltan datos CRÍTICOS - Cliente: ${r.Cliente ? '✓' : '✗'}, Total: ${r.Total ? '✓' : '✗'}`
          erroresDetalle.push(mensaje)
          console.log('[IMPORTAR]', mensaje)
          continue
        }

        // Limpiar y parsear números
        const totalStr = String(r.Total).replace(/[\$\s\.]/g, '').replace(',', '.')
        const total = parseFloat(totalStr) || 0

        if (total <= 0) {
          errores++
          const mensaje = `Fila ${i + 2}: Total inválido (${r.Total})`
          erroresDetalle.push(mensaje)
          console.log('[IMPORTAR]', mensaje)
          continue
        }

        // Parsear monto pagado (puede ser vacío o con guión)
        const pagadoStr = String(r.Pagado || '0').replace(/[\$\s\.,\-]/g, '')
        const montoPagado = parseFloat(pagadoStr) || 0
        const saldoPendiente = total - montoPagado

        // ✅ Fecha OPCIONAL - usar fecha actual si no hay
        let fechaParsed = new Date()
        if (r.Fecha && r.Fecha.trim() !== '') {
          const fechaStr = String(r.Fecha).trim()
          if (fechaStr.includes('/')) {
            const [day, month, year] = fechaStr.split('/')
            const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
            if (!isNaN(parsedDate.getTime())) {
              fechaParsed = parsedDate
            }
          }
        }

        // ✅ Entregador OPCIONAL - "Sin asignar" si está vacío
        const entregador = r.Entregador && r.Entregador.trim() !== '' 
          ? String(r.Entregador).trim() 
          : 'Sin asignar'

        // ✅ Ruta OPCIONAL
        const ruta = r.Ruta && r.Ruta.trim() !== '' 
          ? String(r.Ruta).trim() 
          : 'N/A'

        console.log(`[IMPORTAR] Procesando fila ${i + 2}:`, {
          cliente: r.Cliente,
          total,
          montoPagado,
          saldoPendiente,
          fecha: fechaParsed.toISOString(),
          entregador,
          ruta
        })

        // Generar ID único
        const pedidoId = `FIA${Date.now()}${Math.random().toString(36).substr(2, 9)}`

        // Insertar en tabla "fiados"
        await sql`
          INSERT INTO fiados (
            pedido_id,
            cliente,
            direccion,
            telefono,
            fecha_fiado,
            entregador,
            ruta,
            monto_total,
            monto_pagado,
            saldo_pendiente,
            estado,
            importado,
            created_at
          ) VALUES (
            ${pedidoId},
            ${String(r.Cliente).trim()},
            ${r.Direccion || r.Dirección || null},
            ${r.Telefono || r.Teléfono || null},
            ${fechaParsed.toISOString()},
            ${entregador},
            ${ruta},
            ${total},
            ${montoPagado},
            ${saldoPendiente},
            ${saldoPendiente > 0 ? 'fiado' : 'pagado'},
            true,
            NOW()
          )
        `

        // Guardar en historial
        await sql`
          INSERT INTO fiados_historial (
            pedido_id,
            cliente,
            ruta,
            fecha_pedido,
            total,
            monto_pagado,
            saldo_pendiente,
            fecha_importacion,
            importado_por
          ) VALUES (
            ${pedidoId},
            ${String(r.Cliente).trim()},
            ${ruta},
            ${fechaParsed.toISOString()},
            ${total},
            ${montoPagado},
            ${saldoPendiente},
            NOW(),
            ${session.user.username || session.user.email}
          )
        `

        importados++
        console.log(`[IMPORTAR] ✓ Fila ${i + 2} importada exitosamente`)

      } catch (err) {
        errores++
        const mensaje = `Fila ${i + 2}: ${(err as Error).message}`
        console.error(`[IMPORTAR] ✗ ${mensaje}`)
        erroresDetalle.push(mensaje)
      }
    }

    console.log('[IMPORTAR] === RESUMEN ===')
    console.log('[IMPORTAR] Importados:', importados)
    console.log('[IMPORTAR] Errores:', errores)

    return NextResponse.json({
      success: true,
      mensaje: `✅ ${importados} fiado(s) importado(s)${errores > 0 ? ` (${errores} con problemas)` : ''}`,
      importados,
      errores,
      erroresDetalle: errores > 0 ? erroresDetalle.slice(0, 20) : undefined
    })

  } catch (error) {
    console.error('[IMPORTAR] ERROR CRÍTICO:', error)
    console.error('[IMPORTAR] Stack:', error instanceof Error ? error.stack : 'No stack')
    return NextResponse.json(
      { 
        error: 'Error al importar',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
