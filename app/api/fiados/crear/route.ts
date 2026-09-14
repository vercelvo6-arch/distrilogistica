import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { handleDBError } from '@/lib/db-helpers'

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/fiados/crear
// Registra un fiado directamente, sin pasar por un pedido de ruta ni por
// importación de CSV — para una deuda que se descubre o se acuerda por fuera
// del flujo normal (ej. saldo de un cliente antiguo, un acuerdo verbal que hay
// que dejar por escrito en el sistema).
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    if (session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'Solo administradores pueden crear un fiado manualmente' }, { status: 403 })
    }

    const body = await request.json()
    const cliente = String(body.cliente || '').trim()
    const entregador = String(body.entregador || '').trim()
    const montoTotal = Number(body.montoTotal)
    const direccion = String(body.direccion || '').trim() || null
    const telefono = String(body.telefono || '').trim() || null
    const ruta = String(body.ruta || '').trim() || null
    const observaciones = String(body.observaciones || '').trim() || null
    const fechaFiado = body.fechaFiado ? String(body.fechaFiado) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

    if (!cliente) {
      return NextResponse.json({ error: 'El cliente es requerido' }, { status: 400 })
    }
    if (!entregador) {
      return NextResponse.json({ error: 'El entregador es requerido' }, { status: 400 })
    }
    if (!montoTotal || montoTotal <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })
    }

    const sql = getDB()

    const [fiado] = await sql`
      INSERT INTO fiados (
        cliente, direccion, telefono, monto_total, monto_pagado, saldo_pendiente,
        fecha_fiado, entregador, ruta, estado, observaciones
      ) VALUES (
        ${cliente}, ${direccion}, ${telefono}, ${montoTotal}, 0, ${montoTotal},
        ${fechaFiado}::date, ${entregador}, ${ruta},
        'pendiente',
        ${observaciones ? `Creado manualmente por ${session.user.nombre}: ${observaciones}` : `Creado manualmente por ${session.user.nombre}`}
      )
      RETURNING *
    `

    return NextResponse.json({ success: true, fiado, mensaje: `Fiado de ${cliente} registrado correctamente` })
  } catch (error) {
    return handleDBError(error, 'FIADOS_CREAR')
  }
}
