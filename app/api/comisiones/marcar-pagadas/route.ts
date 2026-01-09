import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"

// POST - Marcar comisiones como pagadas
export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Solo admin puede marcar como pagadas
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()
    const { comisionIds, usuarioId } = await request.json()

    if (!comisionIds || !Array.isArray(comisionIds) || comisionIds.length === 0) {
      return NextResponse.json({ 
        error: 'comisionIds debe ser un array no vacío' 
      }, { status: 400 })
    }

    console.log('[API marcar-pagadas] Marcando como pagadas:', comisionIds)

    const result = await sql`
      UPDATE comisiones
      SET estado = 'pagado',
          pagado_en = NOW(),
          pagado_por = ${usuarioId || session.user.id},
          updated_at = NOW()
      WHERE id = ANY(${comisionIds})
        AND estado = 'pendiente'
      RETURNING *
    `

    console.log('[API marcar-pagadas] ✅ Marcadas como pagadas:', result.length)

    return NextResponse.json({ 
      success: true, 
      count: result.length,
      comisiones: result
    })
  } catch (error: any) {
    console.error("[API marcar-pagadas] ❌ ERROR:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
