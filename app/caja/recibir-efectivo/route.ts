import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo caja y admin pueden recibir efectivo
    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const {
      planillaId,
      efectivoEsperado,
      efectivoRecibido,
      tieneConsignacion,
      numeroConsignacion,
      banco,
      montoConsignacion,
      fechaConsignacion,
      observaciones
    } = body

    // Validaciones
    if (!planillaId || efectivoEsperado === undefined || efectivoRecibido === undefined) {
      return NextResponse.json(
        { error: 'Datos incompletos' },
        { status: 400 }
      )
    }

    if (tieneConsignacion && (!numeroConsignacion || !banco || !montoConsignacion)) {
      return NextResponse.json(
        { error: 'Datos de consignación incompletos' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Verificar que la planilla existe y está completada
    const planilla = await sql`
      SELECT id, estado, entregador, tipo_ruta
      FROM planillas 
      WHERE id = ${planillaId}
    `

    if (planilla.length === 0) {
      return NextResponse.json(
        { error: 'Planilla no encontrada' },
        { status: 404 }
      )
    }

    if (planilla[0].estado !== 'completado') {
      return NextResponse.json(
        { error: 'La planilla debe estar completada para cuadrar en caja' },
        { status: 400 }
      )
    }

    // Verificar que no haya sido cuadrada ya
    const yaCuadrada = await sql`
      SELECT id FROM recepciones_caja WHERE planilla_id = ${planillaId}
    `

    if (yaCuadrada.length > 0) {
      return NextResponse.json(
        { error: 'Esta planilla ya fue cuadrada en caja' },
        { status: 400 }
      )
    }

    // Si hay consignación, verificar que el número no exista
    if (tieneConsignacion && numeroConsignacion) {
      const consignacionExiste = await sql`
        SELECT id FROM recepciones_caja 
        WHERE numero_consignacion = ${numeroConsignacion}
      `

      if (consignacionExiste.length > 0) {
        return NextResponse.json(
          { error: 'Este número de consignación ya fue registrado' },
          { status: 400 }
        )
      }
    }

    // Calcular diferencia
    const diferenciaEfectivo = Number(efectivoRecibido) - Number(efectivoEsperado)
    const estado = diferenciaEfectivo === 0 ? 'cuadrado' : 'con_diferencia'

    // Generar ID
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    const recepcionId = `REC${timestamp}${random}`

    console.log('[API recibir-efectivo] Creando recepción:', {
      recepcionId,
      planillaId,
      efectivoEsperado,
      efectivoRecibido,
      diferencia: diferenciaEfectivo,
      tieneConsignacion
    })

    // Insertar recepción
    const recepcion = await sql`
      INSERT INTO recepciones_caja (
        id,
        planilla_id,
        efectivo_esperado,
        efectivo_recibido,
        diferencia_efectivo,
        tiene_consignacion,
        numero_consignacion,
        banco,
        monto_consignacion,
        fecha_consignacion,
        observaciones,
        recibido_por,
        estado
      ) VALUES (
        ${recepcionId},
        ${planillaId},
        ${efectivoEsperado},
        ${efectivoRecibido},
        ${diferenciaEfectivo},
        ${tieneConsignacion || false},
        ${numeroConsignacion || null},
        ${banco || null},
        ${montoConsignacion || null},
        ${fechaConsignacion || null},
        ${observaciones || null},
        ${session.user.id},
        ${estado}
      )
      RETURNING *
    `

    // Actualizar planilla como cuadrada
    await sql`
      UPDATE planillas 
      SET 
        cuadrado_en_caja = true,
        fecha_cuadre_caja = NOW(),
        updated_at = NOW()
      WHERE id = ${planillaId}
    `

    console.log('[API recibir-efectivo] ✓ Recepción creada exitosamente')

    return NextResponse.json({
      success: true,
      recepcion: recepcion[0],
      mensaje: diferenciaEfectivo === 0 
        ? 'Efectivo cuadrado correctamente' 
        : `Recepción registrada con diferencia de ${diferenciaEfectivo > 0 ? '+' : ''}${diferenciaEfectivo}`
    })

  } catch (error) {
    console.error('[API recibir-efectivo] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al registrar recepción',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

// GET - Obtener historial de recepciones
export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (!['caja', 'administrador'].includes(session.user.rol)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const fechaInicio = searchParams.get('fechaInicio')
    const fechaFin = searchParams.get('fechaFin')

    const sql = getDB()

    let query = sql`
      SELECT 
        r.*,
        p.entregador,
        p.tipo_ruta,
        p.fecha as fecha_planilla,
        u.nombre as recibido_por_nombre
      FROM recepciones_caja r
      JOIN planillas p ON r.planilla_id = p.id
      JOIN usuarios u ON r.recibido_por = u.id
      WHERE 1=1
    `

    if (fechaInicio && fechaFin) {
      query = sql`
        ${query}
        AND r.fecha_recepcion >= ${fechaInicio}
        AND r.fecha_recepcion <= ${fechaFin}
      `
    }

    query = sql`
      ${query}
      ORDER BY r.fecha_recepcion DESC
    `

    const recepciones = await query

    return NextResponse.json({
      recepciones
    })

  } catch (error) {
    console.error('[API recibir-efectivo GET] Error:', error)
    return NextResponse.json(
      { error: 'Error al cargar historial' },
      { status: 500 }
    )
  }
}
```

### **3.4 - Commit**
```
Commit message: feat: agregar endpoint de recepción de efectivo
Clic en "Commit changes"
