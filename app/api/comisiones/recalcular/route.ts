import { NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'
import { efectivoPagosAdministrativosDelCuadre } from '@/lib/comision-cuadre'

// Desde aquí los cuadres agrupados calculan la comisión sobre lo Recibido (ver /api/cuadres-caja).
const AGRUPADO_BASE_RECIBIDO_DESDE = new Date('2026-10-29T00:00:00-05:00')

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()

    // ✅ Obtener comisiones CON los datos de su cuadre. La tabla recepciones_caja ya no
    // existe: el cuadre individual también vive en cuadres_caja (tipo_cuadre 'individual',
    // con la planilla dentro de planillas_ids).
    const comisiones = await sql`
      SELECT
        c.*,
        COALESCE(ci.total_efectivo, cc.total_efectivo, 0) as efectivo_real,
        COALESCE(ci.id, cc.id) as origen_id,
        COALESCE(ci.created_at, cc.created_at) as cuadre_creado,
        CASE
          WHEN ci.id IS NOT NULL THEN 'individual'
          WHEN cc.id IS NOT NULL THEN 'agrupado'
          ELSE 'sin_cuadre'
        END as tipo_cuadre
      FROM comisiones c
      LEFT JOIN LATERAL (
        SELECT id, total_efectivo, created_at FROM cuadres_caja
        WHERE c.planilla_id IS NOT NULL
          AND tipo_cuadre = 'individual'
          AND c.planilla_id = ANY(planillas_ids)
        ORDER BY id DESC LIMIT 1
      ) ci ON true
      LEFT JOIN cuadres_caja cc ON c.cuadre_agrupado_id = cc.id
      WHERE c.estado = 'pendiente'
    `

    console.log(`[RECALCULAR] Encontradas ${comisiones.length} comisiones pendientes`)

    let actualizadas = 0
    let errores = 0

    for (const comision of comisiones) {
      // Sin cuadre = comisión de un pago administrativo confirmado en Cuadre Administrativo:
      // su base es el monto del pago y no hay cuadre contra el cual recalcularla.
      if (comision.tipo_cuadre === 'sin_cuadre') continue

      // Los cuadres agrupados de antes del cambio de base (hasta el 28-oct-2026) se calcularon
      // sobre lo Entregado y se dejan como quedaron: recalcular no los toca.
      if (comision.tipo_cuadre === 'agrupado' && new Date(comision.cuadre_creado) < AGRUPADO_BASE_RECIBIDO_DESDE) continue

      // En un cuadre agrupado también cuenta el efectivo de pagos administrativos
      // (no lo trae el entregador, pero es cobro suyo). Misma base que al crear el cuadre.
      const efectivoAdministrativo = comision.tipo_cuadre === 'agrupado'
        ? await efectivoPagosAdministrativosDelCuadre(Number(comision.origen_id))
        : 0
      const efectivoReal = Number(comision.efectivo_real) + efectivoAdministrativo

      if (efectivoReal === 0) {
        console.log(`[RECALCULAR] ⚠️ No se encontró efectivo real para comisión ${comision.id}`)
        errores++
        continue
      }

      // ✅ RECALCULAR con el efectivo REAL del cuadre
      const baseCorrecta = Math.round(efectivoReal * 100) / 100
      const porcentaje = Number(comision.porcentaje_aplicado)
      const montoCorrect = Math.round(baseCorrecta * (porcentaje / 100) * 100) / 100

      // Actualizar solo si cambió
      if (baseCorrecta !== Number(comision.base_comisionable) || montoCorrect !== Number(comision.monto_comision)) {
        await sql`
          UPDATE comisiones
          SET 
            total_entregas_efectivas = ${baseCorrecta},
            base_comisionable = ${baseCorrecta},
            monto_comision = ${montoCorrect},
            updated_at = NOW()
          WHERE id = ${comision.id}
        `

        console.log(`[RECALCULAR] ✓ Comisión ${comision.id} (${comision.tipo_cuadre}):`, {
          entregador: comision.entregador,
          baseAnterior: Number(comision.base_comisionable),
          baseNueva: baseCorrecta,
          montoAnterior: Number(comision.monto_comision),
          montoNuevo: montoCorrect,
          efectivoReal
        })

        actualizadas++
      }
    }

    return NextResponse.json({
      success: true,
      mensaje: `✅ ${actualizadas} comisiones recalculadas correctamente${errores > 0 ? `. ${errores} con errores.` : ''}`,
      total: comisiones.length,
      actualizadas,
      errores
    })

  } catch (error) {
    console.error('[RECALCULAR] Error:', error)
    return NextResponse.json(
      { 
        error: 'Error al recalcular comisiones',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
