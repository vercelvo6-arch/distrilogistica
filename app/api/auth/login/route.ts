import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { createSession } from "@/lib/session"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    console.log("[API login] Login request received")
    
    const body = await request.json()
    const { email, password } = body

    // Validaciones - SOLO email y password
    if (!email || !password) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: email, password" },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Buscar usuario por email
    const users = await sql`
      SELECT id, nombre, email, password_hash, rol, estado 
      FROM usuarios 
      WHERE email = ${email}
    `

    if (users.length === 0) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      )
    }

    const user = users[0]

    // Verificar si el usuario está activo
    if (user.estado !== 'activo') {
      return NextResponse.json(
        { error: "Usuario inactivo. Contacte al administrador" },
        { status: 403 }
      )
    }

    // Verificar contraseña
    const passwordMatch = await bcrypt.compare(password, user.password_hash)

    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      )
    }

    console.log("[API login] User authenticated:", user.id)

    // Crear sesión
    await createSession(user.id)

    console.log("[API login] Session created, returning response")

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        estado: user.estado,
      },
    })
  } catch (error: any) {
    console.error("[API login] Error:", error)
    return NextResponse.json(
      { error: "Error al iniciar sesión: " + error.message },
      { status: 500 }
    )
  }
}
