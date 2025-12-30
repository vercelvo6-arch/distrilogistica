import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { getDB } from "@/lib/db"

const SESSION_COOKIE_NAME = "session_token"

export async function POST() {
  try {
    console.log("[v0] Logout request received")
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value
    
    console.log("[v0] Session token:", sessionToken ? "exists" : "missing")
    
    if (sessionToken) {
      const sql = getDB()
      await sql`DELETE FROM sessions WHERE id = ${sessionToken}`
      console.log("[v0] Session deleted from database")
    }
    
    cookieStore.delete(SESSION_COOKIE_NAME)
    console.log("[v0] Cookie deleted")
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error in logout:", error)
    const cookieStore = await cookies()
    cookieStore.delete(SESSION_COOKIE_NAME)
    return NextResponse.json({ success: true })
  }
}
