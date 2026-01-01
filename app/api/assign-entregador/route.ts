// app/api/assign-entregador/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    // 1. Verificar sesión y permisos
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      )
    }

    // Solo coordinadores y administradores pueden asignar entregadores
    if (session.user.rol !== 'coordinador' && session.user.rol !== 'administrador') {
      return NextResponse.json(
        { error: 'No tienes permisos para asignar entregadores' },
        { status: 403 }
      )
    }

    // 2. Obtener datos del body
    const body = await request.json()
    const { planillaId, entregador } = body

    console.log('Datos recibidos:', { planillaId, entregador })

    // Validar datos
    if (!planillaId || typeof planillaId !== 'string') {
      return NextResponse.json(
        { error: 'planillaId es requerido y debe ser string' },
        { status: 400 }
      )
    }

    if (!entregador || typeof entregador !== 'string') {
      return NextResponse.json(
        { error: 'entregador es requerido y debe ser string' },
        { status: 400 }
      )
    }

    // Validar que el entregador sea válido
    const ENTREGADORES_VALIDOS = ['Alfonso', 'Miguel', 'Carlos', 'Mateo']
    if (!ENTREGADORES_VALIDOS.includes(entregador)) {
      return NextResponse.json(
        { error: `Entregador debe ser uno de: ${ENTREGADORES_VALIDOS.join(', ')}` },
        { status: 400 }
      )
    }

    // 3. Conectar a la base de datos
    const sql = getDB()

    // 4. Verificar que la planilla existe
    const planillaExists = await sql`
      SELECT id, estado, tipo_ruta FROM planillas WHERE id = ${planillaId}
    `

    console.log('Planilla encontrada:', planillaExists)

    if (planillaExists.length === 0) {
      return NextResponse.json(
        { error: 'Planilla no encontrada' },
        { status: 404 }
      )
    }

    // 5. Actualizar la planilla con el entregador asignado
    const result = await sql`
      UPDATE planillas 
      SET 
        entregador = ${entregador},
        updated_at = NOW()
      WHERE id = ${planillaId}
      RETURNING id, entregador, tipo_ruta, fecha, estado
    `

    console.log('Resultado de actualización:', result)

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Error al actualizar la planilla' },
        { status: 500 }
      )
    }

    // 6. Retornar éxito con estructura completa
    const response = {
      success: true,
      message: `Entregador ${entregador} asignado correctamente`,
      planilla: {
        id: result[0].id,
        entregador: result[0].entregador,
        tipo_ruta: result[0].tipo_ruta,
        fecha: result[0].fecha,
        estado: result[0].estado
      }
    }

    console.log('Respuesta enviada:', response)

    return NextResponse.json(response, { status: 200 })

  } catch (error) {
    console.error('Error en assign-entregador API:', error)
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}
