import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/pedidos/registrar-consignacion/[id]
// Elimina una consignación (de ruta o anticipada) mal digitada, siempre que
// ningún cuadre la haya usado todavía — una vez vinculada a un cuadre ya es
// parte de un cierre contable y no se puede borrar desde aquí.
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const id = Number(params.id)
    if (!id) {
      return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    }

    const sql = getDB()

    const [borrada] = await sql`
      DELETE FROM consignaciones_pedido
      WHERE id = ${id} AND cuadre_caja_id IS NULL
      RETURNING id
    `

    if (!borrada) {
      return NextResponse.json(
        { error: 'No se encontró la consignación, o ya quedó incluida en un cuadre y no se puede eliminar' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleDBError(error, 'REGISTRAR_CONSIGNACION_DELETE')
  }
}
