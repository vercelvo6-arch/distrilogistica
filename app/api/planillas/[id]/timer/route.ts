import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const sql = neon(process.env.DATABASE_URL!)
export const dynamic = "force-dynamic"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const { id } = await params
    const { accion, motivo, entregador } = await request.json()

    const [planilla] = await sql`SELECT id, timer_inicio, timer_fin, timer_pausa, timer_segundos_pausados FROM planillas WHERE id = ${id}`
    if (!planilla) return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 })

    const ahora = new Date().toISOString()
    let cambio = false

    switch (accion) {
      case 'iniciar':
        if (planilla.timer_inicio) break // ya inició
        await sql`UPDATE planillas SET timer_inicio = ${ahora}, timer_segundos_pausados = 0 WHERE id = ${id}`
        cambio = true
        break

      case 'pausar':
        if (!planilla.timer_inicio || planilla.timer_fin || planilla.timer_pausa) break
        await sql`UPDATE planillas SET timer_pausa = ${ahora} WHERE id = ${id}`
        cambio = true
        break

      case 'reanudar':
        if (!planilla.timer_pausa) break
        const pausaInicio = new Date(planilla.timer_pausa).getTime()
        const pausaFin = new Date(ahora).getTime()
        const segundosPausados = Math.round((pausaFin - pausaInicio) / 1000)
        const totalPausados = (planilla.timer_segundos_pausados || 0) + segundosPausados
        await sql`UPDATE planillas SET timer_pausa = NULL, timer_segundos_pausados = ${totalPausados} WHERE id = ${id}`
        cambio = true
        break

      case 'finalizar':
        if (!planilla.timer_inicio || planilla.timer_fin) break
        let pausadosFinales = planilla.timer_segundos_pausados || 0
        if (planilla.timer_pausa) {
          const p = new Date(planilla.timer_pausa).getTime()
          pausadosFinales += Math.round((new Date(ahora).getTime() - p) / 1000)
        }
        await sql`UPDATE planillas SET timer_fin = ${ahora}, timer_pausa = NULL, timer_segundos_pausados = ${pausadosFinales} WHERE id = ${id}`
        cambio = true
        break

      default:
        return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
    }

    // Bitácora de quién hizo qué y por qué (audit_log existía sin uso). Es un
    // registro auxiliar: si falla no debe impedir que el cronómetro funcione.
    if (cambio) {
      try {
        await sql`
          INSERT INTO audit_log (user_id, user_email, action, details)
          VALUES (
            ${String(session.user.id)},
            ${session.user.email ?? null},
            ${`timer_${accion}`},
            ${JSON.stringify({ planilla_id: id, entregador: entregador || null, motivo: motivo || null })}::jsonb
          )
        `
      } catch (e) {
        console.error('[TIMER] No se pudo registrar en audit_log:', e)
      }
    }

    const [updated] = await sql`SELECT timer_inicio, timer_fin, timer_pausa, timer_segundos_pausados FROM planillas WHERE id = ${id}`
    return NextResponse.json({ success: true, timer: updated })

  } catch (error: any) {
    return NextResponse.json({ error: 'Error en timer', details: error.message }, { status: 500 })
  }
}
