import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"

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

export async function PATCH(request: Request) {
  try {
    const sql = getDB()
    const body = await request.json()
    const { userId, updates } = body

    if (!userId || !updates) {
      return NextResponse.json({ error: "Missing userId or updates" }, { status: 400 })
    }

    const updateFields = Object.keys(updates)
      .map((key) => `${key} = $${key}`)
      .join(", ")

    const data = await sql`
      UPDATE usuarios 
      SET ${sql(updates)}
      WHERE id = ${userId}
      RETURNING *
    `

    return NextResponse.json({ usuario: data[0] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
