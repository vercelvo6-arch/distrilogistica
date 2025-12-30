import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import bcrypt from "bcryptjs"

export async function GET() {
  try {
    const sql = getDB()
    const usuarios = await sql`
      SELECT * FROM usuarios 
      ORDER BY created_at DESC
    `
    return NextResponse.json({ usuarios })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { nombre, email, password, rol, estado } = await request.json()
    const sql = getDB()

    // Verificar si el email ya existe
    const existing = await sql`
      SELECT id FROM usuarios WHERE email = ${email}
    `

    if (existing.length > 0) {
      return NextResponse.json({ error: "El email ya está registrado" }, { status: 400 })
    }

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(password, 10)

    // Crear usuario
    const result = await sql`
      INSERT INTO usuarios (nombre, email, password_hash, rol, estado)
      VALUES (${nombre}, ${email}, ${passwordHash}, ${rol}, ${estado || 'activo'})
      RETURNING id
    `

    return NextResponse.json({ success: true, userId: result[0].id })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json({ error: "Error al crear usuario" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const sql = getDB()
    const body = await request.json()
    const { userId, updates } = body

    if (!userId || !updates) {
      return NextResponse.json({ error: "Missing userId or updates" }, { status: 400 })
    }

    const data = await sql`
      UPDATE usuarios 
      SET ${sql(updates)}
      WHERE id = ${userId}::uuid
      RETURNING *
    `

    return NextResponse.json({ usuario: data[0] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await request.json()
    const sql = getDB()

    await sql`DELETE FROM usuarios WHERE id = ${userId}::uuid`

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json({ error: "Error al eliminar usuario" }, { status: 500 })
  }
}
