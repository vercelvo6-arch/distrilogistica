import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"

// PATCH - Editar comisión (ajustar porcentaje/monto)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin puede editar comisiones
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()
    const { id } = params
    const body = await request.json()
    const { porcentaje_ajustado, monto_ajustado, nota_ajuste, ajustado_por } = body

    console.log('[API PATCH comision] Ajustando comisión:', {
      id,
      porcentaje_ajustado,
      monto_ajustado,
      nota_ajuste,
      ajustado_por
    })

    // Verificar que la comisión existe y está en estado pendiente
    const comisionActual = await sql`
      SELECT * FROM comisiones WHERE id = ${id}
    `

    if (comisionActual.length === 0) {
      return NextResponse.json({ error: 'Comisión no encontrada' }, { status: 404 })
    }

    if (comisionActual[0].estado !== 'pendiente') {
      return NextResponse.json({ 
        error: 'Solo se pueden editar comisiones en estado pendiente' 
      }, { status: 400 })
    }

    // Actualizar comisión con valores ajustados
    const result = await sql`
      UPDATE comisiones 
      SET porcentaje_ajustado = ${porcentaje_ajustado},
          monto_ajustado = ${monto_ajustado},
          nota_ajuste = ${nota_ajuste || null},
          ajustado_por = ${ajustado_por || null},
          ajustado_en = NOW(),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `

    console.log('[API PATCH comision] ✅ Comisión ajustada:', result[0])

    return NextResponse.json({ 
      success: true, 
      comision: result[0] 
    })
  } catch (error: any) {
    console.error("[API PATCH comision] ❌ ERROR:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
