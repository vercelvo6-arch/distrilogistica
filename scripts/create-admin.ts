import { neon } from "@neondatabase/serverless"
import bcrypt from "bcryptjs"

async function createAdminUser() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL environment variable is not set")
    process.exit(1)
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    console.log("Creating admin user...")

    const email = "admin@distrisanty.com"
    const password = "admin123"
    const nombre = "Administrador"

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10)

    // Check if user exists
    const existing = await sql`
      SELECT id FROM usuarios WHERE email = ${email}
    `

    if (existing.length > 0) {
      // Update existing user
      await sql`
        UPDATE usuarios 
        SET password_hash = ${passwordHash},
            rol = 'administrador',
            estado = 'activo'
        WHERE email = ${email}
      `
      console.log("✓ Admin user updated successfully")
    } else {
      // Create new user
      const userId = crypto.randomUUID()
      await sql`
        INSERT INTO usuarios (
          id, email, nombre, password_hash, rol, estado, created_at
        ) VALUES (
          ${userId}, ${email}, ${nombre}, ${passwordHash}, 
          'administrador', 'activo', NOW()
        )
      `
      console.log("✓ Admin user created successfully")
    }

    console.log("\nAdmin credentials:")
    console.log(`Email: ${email}`)
    console.log(`Password: ${password}`)
    console.log("\n⚠️  Change the password after first login!")
  } catch (error) {
    console.error("Error creating admin user:", error)
    process.exit(1)
  }
}

createAdminUser()
