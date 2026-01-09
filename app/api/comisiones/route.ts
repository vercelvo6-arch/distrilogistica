import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { getSession } from "@/lib/session"

// GET - Obtener comisiones por período
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const fechaInicio = searchParams.get('fechaInicio')
    const fechaFin = searchParams.get('fechaFin')
    const entregador = searchParams.get('entregador')

    if (!fechaInicio || !fechaFin) {
      return NextResponse.json({ 
        error: 'fechaInicio y fechaFin son requeridos' 
      }, { status: 400 })
    }

    const sql = getDB()

    let comisiones
    if (entregador && entregador !== 'all') {
      comisiones = await sql`
        SELECT * FROM comisiones
        WHERE fecha >= ${fechaInicio}
          AND fecha <= ${fechaFin}
          AND entregador = ${entregador}
        ORDER BY fecha DESC, entregador ASC
      `
    } else {
      comisiones = await sql`
        SELECT * FROM comisiones
        WHERE fecha >= ${fechaInicio}
          AND fecha <= ${fechaFin}
        ORDER BY fecha DESC, entregador ASC
      `
    }

    console.log('[API comisiones] ✅ Comisiones obtenidas:', comisiones.length)

    return NextResponse.json({ comisiones })
  } catch (error: any) {
    console.error("[API comisiones] ❌ ERROR:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
