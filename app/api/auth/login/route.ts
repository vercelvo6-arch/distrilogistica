import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { createSession } from "@/lib/session"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    console.log("[v0] Login request received")
    const { email, password } = await request.json()

    console.log("[v0] Login attempt for email:", email)

    const sql = getDB()

    const users = await sql`
      SELECT * FROM usuarios WHERE email = ${email}
    `

    console.log("[v0] User query result:", users.length > 0 ? "found" : "not found")

    if (users.length === 0) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 })
    }

    const user = users[0]
    console.log("[v0] User found:", user.email, "rol:", user.rol, "estado:", user.estado)

    if (!user.password_hash) {
      console.log("[v0] User has no password hash")
      return NextResponse.json({ error: "Cuenta inválida" }, { status: 401 })
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash)
    console.log("[v0] Password valid:", isValidPassword)

    if (!isValidPassword) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 })
    }

    if (user.estado !== "activo") {
      console.log("[v0] User is not active, estado:", user.estado)
      return NextResponse.json({ error: "Cuenta no activa" }, { status: 403 })
    }

    console.log("[v0] Creating session for user:", user.id)
    await createSession(user.id)

    console.log("[v0] Login successful, returning response")

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        rol: user.rol,
        estado: user.estado,
      },
    })
  } catch (error) {
    console.error("[v0] Error in login route:", error)
    return NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 })
  }
}
