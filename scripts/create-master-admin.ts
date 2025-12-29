import { neon } from "@neondatabase/serverless"
import bcrypt from "bcryptjs"

async function createMasterAdmin() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL environment variable is not set")
    console.error("Please connect Neon integration first")
    process.exit(1)
  }

  const sql = neon(process.env.DATABASE_URL)

  try {
    console.log("🔧 Creating master admin user...")

    const email = "distrisantysas@gmail.com"
    const password = "Distrilogistica2026*"
    const nombre = "Administrador Maestro"

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10)

    // Check if user exists
    const existing = await sql`
      SELECT id FROM usuarios WHERE email = ${email}
    `

    if (existing.length > 0) {
      // Update existing user to ensure correct password and role
      await sql`
        UPDATE usuarios 
        SET password_hash = ${passwordHash},
            nombre = ${nombre},
            rol = 'administrador',
            estado = 'activo',
            updated_at = NOW()
        WHERE email = ${email}
      `
      console.log("✅ Master admin user updated successfully")
    } else {
      // Create new master admin user
      const userId = crypto.randomUUID()
      await sql`
        INSERT INTO usuarios (
          id, email, nombre, password_hash, rol, estado, created_at
        ) VALUES (
          ${userId}, ${email}, ${nombre}, ${passwordHash}, 
          'administrador', 'activo', NOW()
        )
      `
      console.log("✅ Master admin user created successfully")
    }

    console.log("\n🎉 Master Admin Credentials:")
    console.log(`📧 Email: ${email}`)
    console.log(`🔑 Password: ${password}`)
    console.log(`👤 Role: administrador`)
    console.log("\n✨ You can now login at /auth/login")
  } catch (error) {
    console.error("❌ Error creating master admin user:", error)
    process.exit(1)
  }
}

createMasterAdmin()
