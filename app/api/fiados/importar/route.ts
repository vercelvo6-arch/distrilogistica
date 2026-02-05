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

    console.log('[IMPORTAR] Usuario:', session.user.username)

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

    // 🔧 CORRECCIÓN: Usar punto y coma como delimitador
    const delimiter = ';'
    
    // Parsear headers (elimina comillas y espacios)
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

        // Validar datos requeridos
        if (!r.Cliente || !r.Total || !r.Entregador) {
          errores++
          const mensaje = `Fila ${i + 2}: Faltan datos - Cliente: ${r.Cliente || 'NO'}, Total: ${r.Total || 'NO'}, Entregador: ${r.Entregador || 'NO'}`
          erroresDetalle.push(mensaje)
          console.log('[IMPORTAR]', mensaje)
          continue
        }

        // 🔧 CORRECCIÓN: Limpiar $ y espacios correctamente
        const total = parseFloat(String(r.Total).replace(/[\$\s,\.]/g, '').replace(/,/g, '.')) || 0
        const montoPagado = parseFloat(String(r.Pagado || '0').replace(/[\$\s,\-]/g, '')) || 0
        const saldoPendiente = total - montoPagado

        // Parsear fecha (formato DD/MM/YYYY)
        let fechaParsed = new Date()
        if (r.Fecha && r.Fecha.trim() !== '') {
          const fechaStr = String(r.Fecha).trim()
          if (fechaStr.includes('/')) {
            const [day, month, year] = fechaStr.split('/')
            fechaParsed = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
          } else {
            fechaParsed = new Date(fechaStr)
          }
        }

        console.log(`[IMPORTAR] Fila ${i + 2}:`, {
          cliente: r.Cliente,
          total,
          montoPagado,
          saldoPendiente,
          fecha: fechaParsed.toISOString()
        })

        // Generar ID único
        const pedidoId = `FIA${Date.now()}${Math.random().toString(36).substr(2, 9)}`

        // 🔧 CORRECCIÓN: Insertar en tabla "fiados" (no "pedidos")
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
            ${r.Direccion || null},
            ${r.Telefono || null},
            ${fechaParsed.toISOString()},
            ${String(r.Entregador).trim()},
            ${r.Ruta || null},
            ${total},
            ${montoPagado},
            ${saldoPendiente},
            ${r.Estado?.trim() || 'fiado'},
            true,
            NOW()
          )
        `

        // Guardar historial
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
            ${r.Ruta || null},
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
    if (erroresDetalle.length > 0) {
      console.log('[IMPORTAR] Detalle de errores:', erroresDetalle)
    }

    return NextResponse.json({
      success: true,
      mensaje: `✅ ${importados} fiado(s) importado(s)${errores > 0 ? ` (${errores} errores)` : ''}`,
      importados,
      errores,
      erroresDetalle: errores > 0 ? erroresDetalle.slice(0, 10) : undefined
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
