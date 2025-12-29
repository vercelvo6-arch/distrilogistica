"use server"

import { getDB } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { User } from "@/lib/types"

export async function getUsuarios(): Promise<User[]> {
  const sql = getDB()
  const usuarios = await sql`
    SELECT * FROM usuarios 
    ORDER BY created_at DESC
  `
  return usuarios as User[]
}

export async function aprobarUsuario(userId: string, rol: string) {
  const sql = getDB()
  await sql`
    UPDATE usuarios 
    SET rol = ${rol}, estado = 'activo' 
    WHERE id = ${userId}
  `
  revalidatePath("/")
  return { success: true }
}

export async function rechazarUsuario(userId: string) {
  const sql = getDB()
  await sql`
    UPDATE usuarios 
    SET estado = 'inactivo' 
    WHERE id = ${userId}
  `
  revalidatePath("/")
  return { success: true }
}

export async function toggleUsuarioEstado(userId: string, nuevoEstado: "activo" | "inactivo") {
  const sql = getDB()
  await sql`
    UPDATE usuarios 
    SET estado = ${nuevoEstado} 
    WHERE id = ${userId}
  `
  revalidatePath("/")
  return { success: true }
}

export async function updateUsuarioRol(userId: string, rol: string) {
  const sql = getDB()
  await sql`
    UPDATE usuarios 
    SET rol = ${rol}, estado = 'activo' 
    WHERE id = ${userId}
  `
  revalidatePath("/")
  return { success: true }
}

export async function updateUsuarioEstado(userId: string, estado: "pendiente" | "activo" | "inactivo") {
  const sql = getDB()
  await sql`
    UPDATE usuarios 
    SET estado = ${estado} 
    WHERE id = ${userId}
  `
  revalidatePath("/")
  return { success: true }
}
