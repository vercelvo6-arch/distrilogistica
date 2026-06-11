import { NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(
  request: NextRequest,
  { params }: { params: { fiadoId: string } }
) {
  try {
    const fiadoId = params.fiadoId

    if (!fiadoId || isNaN(Number(fiadoId))) {
      return NextResponse.json({ error: "ID de fiado inválido" }, { status: 400 })
    }

    // 1. Datos del fiado principal
    const fiados = await sql`
      SELECT
        id,
        cliente,
        tipo_ruta AS ruta,
        monto_total,
        monto_pagado,
        saldo_pendiente,
        estado,
        entregador,
        entregador_asignado,
        cobrado_por,
        created_at
      FROM fiados
      WHERE id = ${Number(fiadoId)}
    `

    const fiado = fiados[0] ?? null

    if (!fiado) {
      return NextResponse.json({ error: "Fiado no encontrado" }, { status: 404 })
    }

    // 2. Abonos con join a planillas para ruta_cobro y entregador que llevó
    // pedido_id en abonos_fiados es texto que corresponde a fiados.id (integer)
    const abonos = await sql`
      SELECT
        af.id,
        af.pedido_id,
        af.monto_abono,
        af.monto_nequi,
        af.metodo_pago,
        af.referencia_pago,
        af.fecha_abono,
        af.entregador_cobro,
        af.planilla_cobro_id,
        af.registrado_por,
        pl.tipo_ruta   AS ruta_cobro,
        pl.fecha       AS fecha_planilla_cobro,
        pl.entregador  AS entregador_planilla
      FROM abonos_fiados af
      LEFT JOIN planillas pl
             ON pl.id::text = af.planilla_cobro_id::text
      WHERE af.pedido_id = ${String(fiadoId)}
      ORDER BY af.fecha_abono ASC
    `

    // Normalizar fecha_abono a ISO válido (Neon puede devolver "2026-06-09 21:55:13" sin T)
    const abonosNormalizados = abonos.map((a: any) => {
      let fecha_abono_iso: string | null = null
      if (a.fecha_abono) {
        const raw = String(a.fecha_abono)
        const iso = raw.includes("T") ? raw : raw.replace(" ", "T")
        const d = new Date(iso)
        fecha_abono_iso = isNaN(d.getTime()) ? null : d.toISOString()
      }
      return { ...a, fecha_abono_iso }
    })

    return NextResponse.json({ fiado, abonos: abonosNormalizados })
  } catch (error) {
    console.error("[API] Error en historial fiado:", error)
    return NextResponse.json(
      { error: "Error al obtener historial del fiado" },
      { status: 500 }
    )
  }
}
