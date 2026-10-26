// app/api/assign-entregador/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (session.user.rol !== 'coordinador' && session.user.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'No tienes permisos para asignar entregadores' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { planillaId, entregador, fechaAlistamiento, esAsesor, nombreAsesor } = body

    // Validaciones
    if (!planillaId || typeof planillaId !== 'string') {
      return NextResponse.json(
        { error: 'planillaId es requerido' },
        { status: 400 }
      )
    }

    if (!fechaAlistamiento || typeof fechaAlistamiento !== 'string') {
      return NextResponse.json(
        { error: 'fechaAlistamiento es requerida (formato: YYYY-MM-DD)' },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Verificar planilla existe
    const planillaExists = await sql`
      SELECT id, estado FROM planillas WHERE id = ${planillaId}
    `

    if (planillaExists.length === 0) {
      return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 })
    }

    let result

    if (esAsesor) {
      // Planilla de asesor: nombre libre, no valida contra usuarios/entregador
      const nombreAsesorLimpio = typeof nombreAsesor === 'string' ? nombreAsesor.trim() : ''
      if (!nombreAsesorLimpio) {
        return NextResponse.json(
          { error: 'nombreAsesor es requerido cuando esAsesor es true' },
          { status: 400 }
        )
      }

      result = await sql`
        UPDATE planillas
        SET
          entregador       = ${nombreAsesorLimpio},
          es_asesor         = true,
          nombre_asesor     = ${nombreAsesorLimpio},
          fecha_alistamiento = ${fechaAlistamiento},
          estado            = 'pendiente',
          updated_at        = NOW()
        WHERE id = ${planillaId}
        RETURNING id, entregador, fecha_alistamiento, tipo_ruta, fecha, estado, es_asesor, nombre_asesor
      `
    } else {
      if (!entregador || typeof entregador !== 'string') {
        return NextResponse.json(
          { error: 'entregador es requerido' },
          { status: 400 }
        )
      }

      // Verificar entregador existe y está activo
      const entregadorExists = await sql`
        SELECT id, nombre, rol, estado
        FROM usuarios
        WHERE nombre = ${entregador}
          AND rol = 'entregador'
          AND estado = 'activo'
      `

      if (entregadorExists.length === 0) {
        return NextResponse.json(
          { error: `El entregador "${entregador}" no existe o no está activo` },
          { status: 400 }
        )
      }

      // 🔥 ACTUALIZAR CON FECHA DE ALISTAMIENTO
      result = await sql`
        UPDATE planillas
        SET
          entregador        = ${entregador},
          es_asesor          = false,
          nombre_asesor      = NULL,
          fecha_alistamiento = ${fechaAlistamiento},
          estado             = 'pendiente',
          updated_at         = NOW()
        WHERE id = ${planillaId}
        RETURNING id, entregador, fecha_alistamiento, tipo_ruta, fecha, estado, es_asesor, nombre_asesor
      `
    }

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Error al actualizar la planilla' },
        { status: 500 }
      )
    }

    console.log('[API assign] ✓ Planilla asignada:', result[0])

    return NextResponse.json({
      success: true,
      message: `${result[0].entregador} asignado para alistar el ${fechaAlistamiento}`,
      planilla: result[0]
    }, { status: 200 })

  } catch (error) {
    console.error('[API assign] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}

