import { neon } from "@neondatabase/serverless"

let sql: ReturnType<typeof neon> | null = null

export function getDB() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set. Please connect Neon integration.")
    }
    try {
      sql = neon(process.env.DATABASE_URL, {
        fetchConnectionCache: true,
        // ✅ Añade estas opciones importantes
        fullResults: false, // Más eficiente, solo devuelve rows
        arrayMode: false,   // Devuelve objetos en lugar de arrays
      })
    } catch (error) {
      console.error("Error creating database connection:", error)
      throw error
    }
  }
  return sql
}

// ✅ AÑADE ESTA FUNCIÓN PARA REINICIAR LA CONEXIÓN SI HAY ERRORES
export function resetDBConnection() {
  sql = null
  console.log('[DB] Conexión reiniciada')
}
