import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { createSession } from "@/lib/session"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    console.log("[API login] Login request received")

    const body = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: email, password" },
        { status: 400 }
      )
    }

    const sql = getDB()

    const users = await sql`
      SELECT id, nombre, nombre_grupo, email, password_hash, rol, estado
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

    if (user.estado !== "activo") {
      return NextResponse.json(
        { error: "Usuario inactivo. Contacte al administrador" },
        { status: 403 }
      )
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash)
    if (!passwordMatch) {
      return NextResponse.json(
        { error: "Credenciales inválidas" },
        { status: 401 }
      )
    }

    console.log("[API login] User authenticated:", user.id)

    // Si tiene nombre_grupo → buscar otros usuarios del mismo grupo
    let mismoGrupo: any[] = []
    if (user.nombre_grupo) {
      mismoGrupo = await sql`
        SELECT id, nombre, nombre_grupo, email, rol
        FROM usuarios
        WHERE nombre_grupo = ${user.nombre_grupo}
          AND estado = 'activo'
          AND id != ${user.id}
      `
    }

    // Si hay más usuarios en el mismo grupo → pedir al frontend que elija recorrido
    if (mismoGrupo.length > 0) {
      return NextResponse.json({
        success: true,
        requiereSeleccion: true,
        usuariosDisponibles: [
          { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol },
          ...mismoGrupo.map((u: any) => ({
            id: u.id,
            nombre: u.nombre,
            email: u.email,
            rol: u.rol,
          })),
        ],
      })
    }

    // Un solo usuario → login normal
    await createSession(user.id)

    console.log("[API login] Session created, returning response")

    return NextResponse.json({
      success: true,
      requiereSeleccion: false,
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
