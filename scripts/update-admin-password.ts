import { neon } from "@neondatabase/serverless"
import bcrypt from "bcryptjs"

async function updateAdminPassword() {
  const sql = neon(process.env.DATABASE_URL!)

  const email = "distrisantysas@gmail.com"
  const password = "Distrilogistica2026*"

  console.log("[v0] Generating password hash...")
  const passwordHash = await bcrypt.hash(password, 10)
  console.log("[v0] Hash generated:", passwordHash.substring(0, 20) + "...")

  console.log("[v0] Updating user in database...")
  const result = await sql`
    UPDATE usuarios 
    SET password_hash = ${passwordHash}
    WHERE email = ${email}
    RETURNING id, email, nombre, rol, estado
  `

  if (result.length > 0) {
    console.log("[v0] SUCCESS! User updated:")
    console.log(result[0])
  } else {
    console.log("[v0] ERROR: User not found")
  }
}

updateAdminPassword().catch(console.error)
