import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import * as XLSX from 'xlsx'

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

    // Leer archivo Excel
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(worksheet)

    console.log('[IMPORTAR FIADOS] Total de filas:', data.length)

    let importados = 0
    let errores = 0
    const detallesErrores: string[] = []

    for (const row of data) {
      try {
        const fiado: any = row

        // Validar campos requeridos
        if (!fiado.Cliente || !fiado.Fecha || !fiado.Entregador || !fiado.Total) {
          detallesErrores.push(`Fila con cliente "${fiado.Cliente || 'desconocido'}" le faltan campos requeridos`)
          errores++
          continue
        }

        // Convertir fecha de Excel a formato válido
        let fechaFiado: Date
        if (typeof fiado.Fecha === 'number') {
          // Excel guarda fechas como números (días desde 1900-01-01)
          fechaFiado = new Date((fiado.Fecha - 25569) * 86400 * 1000)
        } else {
          fechaFiado = new Date(fiado.Fecha)
        }

        // Limpiar valores monetarios (quitar $, comas, espacios)
        const limpiarMonto = (valor: any): number => {
          if (typeof valor === 'number') return valor
          if (typeof valor === 'string') {
            return parseFloat(valor.replace(/[$,\s]/g, '')) || 0
          }
          return 0
        }

        const montoTotal = limpiarMonto(fiado.Total)
        const montoPagado = limpiarMonto(fiado.Pagado)
        const saldoPendiente = limpiarMonto(fiado.Saldo)

        // Determinar estado
        let estado = 'fiado'
        if (montoPagado > 0 && saldoPendiente > 0) {
          estado = 'parcial'
        } else if (saldoPendiente === 0) {
          estado = 'cobrado'
        }

        // Insertar en la base de datos
        await sql`
          INSERT INTO fiados (
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
            pedido_id,
            planilla_id,
            importado
          ) VALUES (
            ${fiado.Cliente},
            ${fiado.Dirección || fiado.Direccion || null},
            ${fiado.Teléfono || fiado.Telefono || null},
            ${fechaFiado.toISOString()},
            ${fiado.Entregador},
            ${fiado.Ruta || null},
            ${montoTotal},
            ${montoPagado},
            ${saldoPendiente},
            ${estado},
            NULL,
            NULL,
            true
          )
        `

        importados++
      } catch (error) {
        console.error('[IMPORTAR FIADOS] Error en fila:', error)
        detallesErrores.push(`Error procesando cliente "${(row as any).Cliente}": ${error instanceof Error ? error.message : 'error desconocido'}`)
        errores++
      }
    }

    console.log('[IMPORTAR FIADOS] Resultado:', { importados, errores })

    return NextResponse.json({
      success: true,
      mensaje: `✅ ${importados} fiados importados exitosamente`,
      importados,
      errores,
      detallesErrores: errores > 0 ? detallesErrores : undefined
    })

  } catch (error) {
    console.error('[IMPORTAR FIADOS] Error general:', error)
    return NextResponse.json(
      { 
        error: 'Error al importar fiados',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
