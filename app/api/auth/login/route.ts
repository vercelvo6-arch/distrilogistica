import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { createSession } from "@/lib/session"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    const sql = getDB()

    const users = await sql`
      SELECT * FROM usuarios WHERE email = ${email}
    `

    if (users.length === 0) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 })
    }

    const user = users[0]

    if (!user.password_hash) {
      return NextResponse.json({ error: "Cuenta inválida" }, { status: 401 })
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash)

    if (!isValidPassword) {
      return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 })
    }

    if (user.estado !== "activo") {
      return NextResponse.json({ error: "Cuenta no activa" }, { status: 403 })
    }

    await createSession(user.id)

    return NextResponse.json({ success: true, user })
  } catch (error) {
    console.error("[v0] Error in login route:", error)
    return NextResponse.json({ error: "Error al iniciar sesión" }, { status: 500 })
  }
}
