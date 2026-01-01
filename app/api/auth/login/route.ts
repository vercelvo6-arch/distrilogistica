import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"
import { createSession } from "@/lib/session"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    console.log("[API register] Registration request received")
    
    const body = await request.json()
    const { nombre, email, password, rol } = body

    // Validaciones
    if (!nombre || !email || !password) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: nombre, email, password" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      )
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400 }
      )
    }

    const sql = getDB()

    // Verificar si el email ya existe
    const existing = await sql`
      SELECT id FROM usuarios WHERE email = ${email}
    `

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "El email ya está registrado" },
        { status: 400 }
      )
    }

    // Generar ID único tipo TEXT
    const timestamp = Date.now()
    const random = Math.floor(Math.random() * 1000)
    const userId = `USR${timestamp}${random}`

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(password, 10)

    // Rol por defecto si no se especifica (por seguridad, solo permitir ciertos roles)
    const allowedRoles = ['coordinador', 'alistador', 'entregador', 'caja']
    const userRole = rol && allowedRoles.includes(rol) ? rol : 'coordinador'

    console.log("[API register] Creating user:", { userId, nombre, email, rol: userRole })

    // Crear usuario
    const result = await sql`
      INSERT INTO usuarios (
        id,
        nombre,
        email,
        password_hash,
        rol,
        estado,
        created_at,
        updated_at
      )
      VALUES (
        ${userId},
        ${nombre},
        ${email},
        ${passwordHash},
        ${userRole},
        'activo',
        NOW(),
        NOW()
      )
      RETURNING id, nombre, email, rol, estado
    `

    const newUser = result[0]

    console.log("[API register] User created successfully:", newUser.id)

    // Crear sesión automáticamente
    await createSession(newUser.id)

    console.log("[API register] Session created, returning response")

    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        nombre: newUser.nombre,
        email: newUser.email,
        rol: newUser.rol,
        estado: newUser.estado,
      },
    })
  } catch (error: any) {
    console.error("[API register] Error:", error)
    return NextResponse.json(
      { error: "Error al registrar usuario: " + error.message },
      { status: 500 }
    )
  }
}
