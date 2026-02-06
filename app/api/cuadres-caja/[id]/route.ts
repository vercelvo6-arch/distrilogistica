import { neon } from '@neondatabase/serverless'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

const sql = neon(process.env.DATABASE_URL!)

// GET BY ID - Para cargar un cuadre específico
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const cuadreId = parseInt(params.id)

    console.log('[CUADRE EDIT] Obteniendo cuadre ID:', cuadreId)

    const cuadres = await sql`
      SELECT 
        c.id,
        c.entregador,
        c.fecha_cuadre,
        c.planillas_ids,
        COALESCE(c.total_esperado, 0) as total_esperado,
        COALESCE(c.total_efectivo, 0) as total_efectivo,
        COALESCE(c.total_consignado, 0) as total_consignado,
        COALESCE(c.diferencia, 0) as diferencia,
        c.estado,
        c.observaciones,
        COALESCE(c.tiene_consignacion, false) as tiene_consignacion,
        c.numero_consignacion,
        c.banco,
        COALESCE(c.descuento, 0) as descuento,
        c.motivo_descuento,
        COALESCE(c.agotados, 0) as agotados,
        COALESCE(c.fiado, 0) as fiado,
        COALESCE(c.devoluciones, 0) as devoluciones,
        COALESCE(c.repasos, 0) as repasos,
        COALESCE(c.errores_facturacion, 0) as errores_facturacion,
        c.created_at,
        array_agg(DISTINCT p.tipo_ruta) FILTER (WHERE p.tipo_ruta IS NOT NULL) as rutas_nombres
      FROM cuadres_caja c
      LEFT JOIN planillas p ON p.id = ANY(c.planillas_ids)
      WHERE c.id = ${cuadreId}
      GROUP BY c.id
    `

    if (cuadres.length === 0) {
      return NextResponse.json({ error: 'Cuadre no encontrado' }, { status: 404 })
    }

    console.log('[CUADRE EDIT] ✓ Cuadre encontrado')

    return NextResponse.json({
      success: true,
      cuadre: cuadres[0]
    })

  } catch (error) {
    console.error('[CUADRE EDIT] ERROR:', error)
    return NextResponse.json(
      { 
        error: 'Error al cargar cuadre',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    )
  }
}

// PATCH - Para editar un cuadre existente
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    console.log('[CUADRE EDIT] === INICIO EDICIÓN ===')
    
    const session = await getSession()
    if (!session?.user) {
      console.log('[CUADRE EDIT] ERROR: Usuario no autenticado')
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const cuadreId = parseInt(params.id)
    console.log('[CUADRE EDIT] Editando cuadre ID:', cuadreId)
    console.log('[CUADRE EDIT] Usuario:', session.user.username || session.user.email)

    const body = await request.json()
    console.log('[CUADRE EDIT] Body recibido:', JSON.stringify(body, null, 2))

    const {
      efectivoRecibido,
      montoConsignacion,
      tieneConsignacion,
      numeroConsignacion,
      banco,
      observaciones,
      descuento,
      motivoDescuento,
      agotados,
      fiado,
      devoluciones,
      repasos,
      erroresFacturacion
    } = body

    // Validaciones
    if (efectivoRecibido === undefined || efectivoRecibido === null) {
      return NextResponse.json(
        { error: 'Efectivo recibido es requerido' },
        { status: 400 }
      )
    }

    // Obtener cuadre actual para comparar cambios
    const cuadreActual = await sql`
      SELECT * FROM cuadres_caja WHERE id = ${cuadreId}
    `

    if (cuadreActual.length === 0) {
      return NextResponse.json({ error: 'Cuadre no encontrado' }, { status: 404 })
    }

    const cuadreAnterior = cuadreActual[0]

    // Recalcular valores
    const totalConsignado = Number(montoConsignacion || 0)
    const totalEfectivo = Number(efectivoRecibido) || 0
    const totalEsperadoNum = Number(cuadreAnterior.total_esperado) || 0
    const descuentoNum = Number(descuento || 0)
    const agotadosNum = Number(agotados || 0)
    const fiadoNum = Number(fiado || 0)
    const devolucionesNum = Number(devoluciones || 0)
    const repasosNum = Number(repasos || 0)
    const erroresFacturacionNum = Number(erroresFacturacion || 0)
    
    const totalRecibido = totalEfectivo + totalConsignado
    const diferencia = Math.round((totalRecibido - totalEsperadoNum) * 100) / 100
    const estado = diferencia === 0 ? 'cuadrado' : 'con_diferencia'

    console.log('[CUADRE EDIT] Valores recalculados:', {
      totalEsperado: totalEsperadoNum,
      efectivo: totalEfectivo,
      consignacion: totalConsignado,
      totalRecibido,
      diferencia,
      estado
    })

    // Actualizar cuadre
    console.log('[CUADRE EDIT] Actualizando cuadre...')
    
    await sql`
      UPDATE cuadres_caja
      SET 
        total_efectivo = ${totalEfectivo},
        total_consignado = ${totalConsignado},
        diferencia = ${diferencia},
        estado = ${estado},
        observaciones = ${observaciones || null},
        tiene_consignacion = ${tieneConsignacion || false},
        numero_consignacion = ${numeroConsignacion || null},
        banco = ${banco || null},
        descuento = ${descuentoNum},
        motivo_descuento = ${motivoDescuento || null},
        agotados = ${agotadosNum},
        fiado = ${fiadoNum},
        devoluciones = ${devolucionesNum},
        repasos = ${repasosNum},
        errores_facturacion = ${erroresFacturacionNum},
        updated_at = NOW()
      WHERE id = ${cuadreId}
    `

    console.log('[CUADRE EDIT] ✓ Cuadre actualizado')

    // Registrar en historial de cambios
    const cambios = {
      efectivo_anterior: cuadreAnterior.total_efectivo,
      efectivo_nuevo: totalEfectivo,
      consignacion_anterior: cuadreAnterior.total_consignado,
      consignacion_nuevo: totalConsignado,
      diferencia_anterior: cuadreAnterior.diferencia,
      diferencia_nueva: diferencia,
      descuento_anterior: cuadreAnterior.descuento,
      descuento_nuevo: descuentoNum,
      agotados_anterior: cuadreAnterior.agotados,
      agotados_nuevo: agotadosNum,
      fiado_anterior: cuadreAnterior.fiado,
      fiado_nuevo: fiadoNum,
      devoluciones_anterior: cuadreAnterior.devoluciones,
      devoluciones_nuevo: devolucionesNum,
      repasos_anterior: cuadreAnterior.repasos,
      repasos_nuevo: repasosNum,
      errores_anterior: cuadreAnterior.errores_facturacion,
      errores_nuevo: erroresFacturacionNum
    }

    console.log('[CUADRE EDIT] Registrando historial de cambios...')

    await sql`
      INSERT INTO cuadres_caja_historial (
        cuadre_id,
        usuario_id,
        usuario_nombre,
        fecha_cambio,
        cambios,
        observacion_cambio
      ) VALUES (
        ${cuadreId},
        ${session.user.id},
        ${session.user.username || session.user.email},
        NOW(),
        ${JSON.stringify(cambios)},
        ${'Edición manual del cuadre'}
      )
    `

    console.log('[CUADRE EDIT] ✓ Historial registrado')

    // Recalcular comisión si existe
    console.log('[CUADRE EDIT] Verificando si hay comisión asociada...')
    
    const comisionExistente = await sql`
      SELECT id, porcentaje_aplicado
      FROM comisiones
      WHERE cuadre_agrupado_id = ${cuadreId}
    `

    if (comisionExistente.length > 0) {
      const porcentaje = Number(comisionExistente[0].porcentaje_aplicado)
      const baseComisionable = Math.round(totalEfectivo * 100) / 100
      const montoComision = Math.round(baseComisionable * (porcentaje / 100) * 100) / 100

      console.log('[CUADRE EDIT] Actualizando comisión:', {
        base: baseComisionable,
        porcentaje,
        monto: montoComision
      })

      await sql`
        UPDATE comisiones
        SET 
          total_entregas_efectivas = ${totalEfectivo},
          total_devoluciones = ${devolucionesNum},
          base_comisionable = ${baseComisionable},
          monto_comision = ${montoComision},
          updated_at = NOW()
        WHERE id = ${comisionExistente[0].id}
      `

      console.log('[CUADRE EDIT] ✓ Comisión recalculada')
    } else {
      console.log('[CUADRE EDIT] ⚠️ No hay comisión asociada')
    }

    console.log('[CUADRE EDIT] ✓✓✓ EDICIÓN COMPLETADA EXITOSAMENTE')

    return NextResponse.json({
      success: true,
      mensaje: '✅ Cuadre actualizado correctamente',
      diferencia,
      estado
    })

  } catch (error) {
    console.error('[CUADRE EDIT] ❌❌❌ ERROR CRÍTICO:', error)
    console.error('[CUADRE EDIT] Stack:', error instanceof Error ? error.stack : 'No stack')
    
    return NextResponse.json(
      { 
        error: 'Error al editar cuadre',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    )
  }
}
