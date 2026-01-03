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

    // 3. Conectar a la base de datos
    const sql = getDB()

    // 4. ✅ VALIDACIÓN DINÁMICA: Verificar que el entregador EXISTE en la BD
    console.log('[API assign] Verificando entregador:', entregador)
    
    const entregadorExists = await sql`
      SELECT id, nombre, rol, estado 
      FROM usuarios 
      WHERE nombre = ${entregador} 
        AND rol = 'entregador' 
        AND estado = 'activo'
    `

    if (entregadorExists.length === 0) {
      console.error('[API assign] Entregador no encontrado:', entregador)
      return NextResponse.json(
        { error: `El entregador "${entregador}" no existe o no está activo` },
        { status: 400 }
      )
    }

    console.log('[API assign] ✓ Entregador válido:', entregadorExists[0])

    // 5. Verificar que la planilla existe
    const planillaExists = await sql`
      SELECT id, estado FROM planillas WHERE id = ${planillaId}
    `

    if (planillaExists.length === 0) {
      return NextResponse.json(
        { error: 'Planilla no encontrada' },
        { status: 404 }
      )
    }

    // 6. Actualizar la planilla con el entregador asignado
    const result = await sql`
      UPDATE planillas 
      SET 
        entregador = ${entregador},
        updated_at = NOW()
      WHERE id = ${planillaId}
      RETURNING id, entregador, tipo_ruta, fecha, estado
    `

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Error al actualizar la planilla' },
        { status: 500 }
      )
    }

    console.log('[API assign] ✓ Planilla actualizada:', result[0])

    // 7. Retornar éxito
    return NextResponse.json({
      success: true,
      message: `Entregador ${entregador} asignado correctamente`,
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
