import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"

// GET - Obtener configuraciones de comisiones
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const sql = getDB()
    const configs = await sql`
      SELECT * FROM comisiones_config
      WHERE activo = true
      ORDER BY entregador ASC
    `

    console.log('[API comisiones/config] ✅ Configs obtenidas:', configs.length)

    return NextResponse.json({ configs })
  } catch (error: any) {
    console.error("[API comisiones/config] ❌ ERROR:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Actualizar configuración de comisión
export async function PUT(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin puede actualizar configuraciones
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()
    const { entregador, porcentaje } = await request.json()

    if (!entregador || porcentaje === undefined) {
      return NextResponse.json({ 
        error: 'entregador y porcentaje son requeridos' 
      }, { status: 400 })
    }

    console.log('[API comisiones/config PUT] Actualizando:', { entregador, porcentaje })

    const result = await sql`
      UPDATE comisiones_config
      SET porcentaje_comision = ${porcentaje},
          updated_at = NOW()
      WHERE entregador = ${entregador}
      RETURNING *
    `

    if (result.length === 0) {
      return NextResponse.json({ 
        error: 'Configuración no encontrada' 
      }, { status: 404 })
    }

    console.log('[API comisiones/config PUT] ✅ Actualizado:', result[0])

    return NextResponse.json({ 
      success: true, 
      config: result[0] 
    })
  } catch (error: any) {
    console.error("[API comisiones/config PUT] ❌ ERROR:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
