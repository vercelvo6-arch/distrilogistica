import { cookies } from "next/headers"
import { getDB } from "./db"

const SESSION_COOKIE_NAME = "session_token"
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function createSession(userId: string) {
  console.log("[v0] Creating session for user:", userId)

  const sessionToken = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_DURATION)

  const sql = getDB()

  await sql`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (${sessionToken}, ${userId}, ${expiresAt.toISOString()})
  `

  console.log("[v0] Session created in DB, setting cookie:", sessionToken)

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  })

  console.log("[v0] Cookie set successfully")
  return sessionToken
}

export async function getSession() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

    console.log("[v0] Getting session, token:", sessionToken ? "exists" : "missing")

    if (!sessionToken) {
      return null
    }

    const sql = getDB()

    // FIX: incluir nombre_grupo para filtrar planillas de todos los recorridos del entregador
    const sessions = await sql`
      SELECT
        s.id,
        s.user_id,
        s.expires_at,
        u.id AS uid,
        u.email,
        u.nombre,
        u.nombre_grupo,
        u.rol,
        u.estado
      FROM sessions s
      JOIN usuarios u ON s.user_id = u.id
      WHERE s.id = ${sessionToken}
        AND s.expires_at > NOW()
    `

    console.log("[v0] Session query result:", sessions.length > 0 ? "found" : "not found")

    if (sessions.length === 0) {
      return null
    }

    const session = sessions[0]
    console.log("[v0] Session user:", session.email, "rol:", session.rol, "estado:", session.estado)

    return {
      id: session.id,
      userId: session.user_id,
      user: {
        id: session.uid,
        email: session.email,
        nombre: session.nombre,
        nombreGrupo: session.nombre_grupo || null,
        rol: session.rol,
        estado: session.estado,
      },
    }
  } catch (error) {
    console.error("[v0] Error getting session:", error)
    return null
  }
}

export async function deleteSession() {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (sessionToken) {
    const sql = getDB()
    await sql`DELETE FROM sessions WHERE id = ${sessionToken}`
  }

  cookieStore.delete(SESSION_COOKIE_NAME)
}

export async function cleanupExpiredSessions() {
  const sql = getDB()
  await sql`DELETE FROM sessions WHERE expires_at < NOW()`
}

export { SESSION_COOKIE_NAME }
