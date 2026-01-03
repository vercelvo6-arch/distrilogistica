import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'

export async function GET() {
  try {
    const session = await getSession()
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // Obtener datos actualizados del usuario desde la BD
    const sql = getDB()
    const users = await sql`
      SELECT id, nombre, email, rol, estado 
      FROM usuarios 
      WHERE id = ${session.user.id}
    `

    if (users.length === 0) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const user = users[0]

    // Verificar si el usuario está activo
    if (user.estado !== 'activo') {
      return NextResponse.json({ error: 'Usuario inactivo' }, { status: 403 })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        estado: user.estado
      }
    })
  } catch (error) {
    console.error('[API session] Error:', error)
    return NextResponse.json({ error: 'Error al obtener sesión' }, { status: 500 })
  }
}
