import { NextResponse } from "next/server"
import { getSession } from "@/lib/session"

// El módulo de inventario es solo para el administrador (control sobre la operación).
export async function exigirAdministrador() {
  const session = await getSession()
  if (!session?.user) {
    return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) } as const
  }
  if (session.user.rol !== "administrador") {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 403 }) } as const
  }
  return { session } as const
}

export function fechaBogota(desplazarDias = 0): string {
  const d = new Date(Date.now() + desplazarDias * 24 * 60 * 60 * 1000)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d) // YYYY-MM-DD
}

export function leerRango(url: string): { desde: string; hasta: string } {
  const { searchParams } = new URL(url)
  const valida = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  return {
    desde: valida(searchParams.get("desde")) || fechaBogota(-7),
    hasta: valida(searchParams.get("hasta")) || fechaBogota(0),
  }
}

export function enBloques<T>(lista: T[], tamano: number): T[][] {
  const bloques: T[][] = []
  for (let i = 0; i < lista.length; i += tamano) bloques.push(lista.slice(i, i + tamano))
  return bloques
}
