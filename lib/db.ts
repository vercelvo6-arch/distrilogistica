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
      })
    } catch (error) {
      console.error("Error creating database connection:", error)
      throw error
    }
  }
  return sql
}
