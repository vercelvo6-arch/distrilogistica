import { NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user || session.user.rol !== 'administrador') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const sql = getDB()

    // ✅ Obtener comisiones CON los datos de recepción/cuadre
    const comisiones = await sql`
      SELECT 
        c.*,
        COALESCE(r.efectivo_recibido, cc.total_efectivo, 0) as efectivo_real,
        COALESCE(r.planilla_id, cc.id) as origen_id,
        CASE 
          WHEN r.id IS NOT NULL THEN 'individual'
          WHEN cc.id IS NOT NULL THEN 'agrupado'
          ELSE 'sin_cuadre'
        END as tipo_cuadre
      FROM comisiones c
      LEFT JOIN recepciones_caja r ON c.planilla_id = r.planilla_id
      LEFT JOIN cuadres_caja cc ON c.cuadre_agrupado_id = cc.id
      WHERE c.estado = 'pendiente'
    `

    console.log(`[RECALCULAR] Encontradas ${comisiones.length} comisiones pendientes`)

    let actualizadas = 0
    let errores = 0

    for (const comision of comisiones) {
      const efectivoReal = Number(comision.efectivo_real)

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
