"use server"

import { getDB } from "./db"
import { createSession, deleteSession } from "./session"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"

export async function signInAction(prevState: any, formData: FormData) {
  if (!formData) {
    return { error: "Error: No se recibieron datos del formulario" }
  }

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Por favor ingresa correo y contraseña" }
  }

  try {
    const sql = getDB()

    const users = await sql`
      SELECT * FROM usuarios WHERE email = ${email}
    `

    if (users.length === 0) {
      return { error: "Correo o contraseña incorrectos" }
    }

    const user = users[0]

    if (!user.password_hash) {
      return { error: "Cuenta inválida. Contacta al administrador" }
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash)

    if (!isValidPassword) {
      return { error: "Correo o contraseña incorrectos" }
    }

    if (user.estado !== "activo") {
      return { error: "Tu cuenta no está activa. Contacta al administrador" }
    }

    await createSession(user.id)
    redirect("/")
  } catch (error: any) {
    console.error("[v0] Error en signInAction:", error)
    return { error: "Error al iniciar sesión" }
  }
}

export async function signUpAction(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const nombre = formData.get("nombre") as string

  if (!email || !password || !nombre) {
    return { error: "Todos los campos son requeridos" }
  }

  try {
    const sql = getDB()

    const existingUsers = await sql`
      SELECT id FROM usuarios WHERE email = ${email}
    `

    if (existingUsers.length > 0) {
      return { error: "Este correo ya está registrado" }
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userId = crypto.randomUUID()

    await sql`
      INSERT INTO usuarios (id, email, nombre, password_hash, rol, estado, created_at)
      VALUES (
        ${userId},
        ${email},
        ${nombre},
        ${passwordHash},
        NULL,
        'pendiente',
        NOW()
      )
    `

    return {
      success: true,
      message: "Registro exitoso. Espera la aprobación del administrador.",
    }
  } catch (error: any) {
    console.error("[v0] Error en signUpAction:", error)
    return { error: "Error al registrarse" }
  }
}

export async function signOutAction() {
  try {
    await deleteSession()
    redirect("/auth/login")
  } catch (error: any) {
    return { error: error.message }
  }
}
