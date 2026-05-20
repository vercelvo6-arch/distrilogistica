import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden eliminar fiados' }, { status: 403 })
    }

    const body = await request.json()
    const { fiadoId, pedidoId } = body

    console.log('[FIADOS ELIMINAR] Datos recibidos:', { fiadoId, pedidoId })

    if (!fiadoId && !pedidoId) {
      return NextResponse.json({ error: 'Se requiere fiadoId o pedidoId' }, { status: 400 })
    }

    const sql = getDB()

    // ── Eliminar por fiadoId (tabla fiados) ──
    if (fiadoId) {
      // ✅ Castear a número — la tabla fiados usa id integer
      const idNum = Number(fiadoId)
      if (!idNum || isNaN(idNum)) {
        return NextResponse.json({ error: 'fiadoId inválido' }, { status: 400 })
      }

      const fiado = await sql`
        SELECT id, estado, eliminado FROM fiados WHERE id = ${idNum}
      `

      if (fiado.length === 0) {
        console.log('[FIADOS ELIMINAR] ❌ Fiado no encontrado:', idNum)
        return NextResponse.json({ error: 'Fiado no encontrado' }, { status: 404 })
      }

      if (fiado[0].eliminado === true || fiado[0].eliminado === 't') {
        return NextResponse.json({ error: 'Este fiado ya fue eliminado' }, { status: 400 })
      }

      await sql`
        UPDATE fiados
        SET
          eliminado = true,
          eliminado_por = ${session.user.id},
          fecha_eliminacion = NOW()
        WHERE id = ${idNum}
      `

      console.log(`[FIADOS ELIMINAR] ✓ Fiado ${idNum} eliminado por ${session.user.nombre}`)

      return NextResponse.json({
        success: true,
        mensaje: 'Fiado eliminado correctamente'
      })
    }

    // ── Eliminar por pedidoId (tabla pedidos) ──
    if (pedidoId) {
      const pedido = await sql`
        SELECT id, estado, cliente FROM pedidos WHERE id = ${pedidoId}
      `

      if (pedido.length === 0) {
        console.log('[FIADOS ELIMINAR] ❌ Pedido no encontrado:', pedidoId)
        return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
      }

      await sql`
        UPDATE pedidos
        SET
          estado = 'eliminado',
          updated_at = NOW()
        WHERE id = ${pedidoId}
      `

      console.log(`[FIADOS ELIMINAR] ✓ Pedido fiado ${pedidoId} eliminado por ${session.user.nombre}`)

      return NextResponse.json({
        success: true,
        mensaje: 'Fiado eliminado correctamente'
      })
    }

  } catch (error) {
    console.error('[FIADOS ELIMINAR] ERROR:', error)
    return NextResponse.json(
      { error: 'Error al eliminar fiado', details: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
