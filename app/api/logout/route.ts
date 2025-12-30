import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"

const SESSION_COOKIE_NAME = "session_token"

export async function POST() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
    
    if (sessionToken) {
      const sql = getDB()
      await sql`DELETE FROM sessions WHERE id = ${sessionToken}`
    }
    
    cookieStore.delete(SESSION_COOKIE_NAME)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Logout error:", error)
    const cookieStore = await cookies()
    cookieStore.delete(SESSION_COOKIE_NAME)
    return NextResponse.json({ success: true })
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
    
    if (sessionToken) {
      const sql = getDB()
      await sql`DELETE FROM sessions WHERE id = ${sessionToken}`
    }
    
    cookieStore.delete(SESSION_COOKIE_NAME)
    
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_URL || "https://v0-salesprocessoptimization11.vercel.app"))
  } catch (error) {
    console.error("Logout error:", error)
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_URL || "https://v0-salesprocessoptimization11.vercel.app"))
  }
}
