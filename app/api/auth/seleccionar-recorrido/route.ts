import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { createSession } from "@/lib/session"

export async function POST(request: Request) {
  try {
    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: "userId requerido" },
        { status: 400 }
      )
    }

    const sql = getDB()

    const [user] = await sql`
      SELECT id, nombre, email, rol, estado
      FROM usuarios
      WHERE id = ${userId}
        AND estado = 'activo'
    `

    if (!user) {
      return NextResponse.json(
        { error: "Usuario no encontrado o inactivo" },
        { status: 404 }
      )
    }

    await createSession(user.id)

    console.log("[seleccionar-recorrido] Sesión creada para:", user.email)

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
      },
    })
  } catch (error: any) {
    console.error("[seleccionar-recorrido] Error:", error)
    return NextResponse.json(
      { error: "Error al seleccionar recorrido: " + error.message },
      { status: 500 }
    )
  }
}
