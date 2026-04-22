import { neon } from "@neondatabase/serverless"

let sql: ReturnType<typeof neon> | null = null

export function getDB() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL no está configurada.")
    }
    sql = neon(process.env.DATABASE_URL, {
      fetchConnectionCache: true,
      fullResults: false,
      arrayMode: false,
    })
  }
  return sql
}

export function resetDBConnection() {
  sql = null
}
