import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { getDB } from "@/lib/db"

export async function POST() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("session_token")?.value
    
    if (sessionToken) {
      const sql = getDB()
      await sql`DELETE FROM sessions WHERE id = ${sessionToken}`
    }
    
    cookieStore.delete("session_token")
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in logout:", error)
    return NextResponse.json({ success: true })
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("session_token")?.value
    
    if (sessionToken) {
      const sql = getDB()
      await sql`DELETE FROM sessions WHERE id = ${sessionToken}`
    }
    
    cookieStore.delete("session_token")
    
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_URL || "https://v0-salesprocessoptimization11.vercel.app"))
  } catch (error) {
    console.error("Error in logout:", error)
    return NextResponse.redirect(new URL("/auth/login", process.env.NEXT_PUBLIC_URL || "https://v0-salesprocessoptimization11.vercel.app"))
  }
}
