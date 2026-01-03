import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"

// GET - Listar entregadores activos
export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const sql = getDB()
    
    // Obtener solo entregadores activos
    const entregadores = await sql`
      SELECT 
        id,
        nombre,
        email,
        rol,
        estado
      FROM usuarios 
      WHERE rol = 'entregador' 
        AND estado = 'activo'
      ORDER BY nombre ASC
    `
    
    return NextResponse.json({ entregadores })
  } catch (error: any) {
    console.error("[API entregadores] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
