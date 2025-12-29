"use server"

import { getDB } from "@/lib/db"
import type { Comision, ComisionConfig, ComisionReporte } from "@/lib/types"

export async function getComisionesConfig() {
  const sql = getDB()
  const data = await sql`
    SELECT * FROM comisiones_config 
    ORDER BY entregador
  `
  return data as ComisionConfig[]
}

export async function updateComisionConfig(entregador: string, porcentaje: number) {
  const sql = getDB()
  const result = await sql`
    UPDATE comisiones_config 
    SET porcentaje_comision = ${porcentaje}, updated_at = NOW()
    WHERE entregador = ${entregador}
    RETURNING *
  `
  return result[0]
}

export async function calcularComisionPlanilla(planillaId: string) {
  const sql = getDB()

  // Obtener planilla con pedidos y productos
  const planillaResult = await sql`
    SELECT 
      p.*,
      json_agg(
        json_build_object(
          'id', ped.id,
          'estado', ped.estado,
          'pedido_productos', (
            SELECT json_agg(
              json_build_object('total', pp.total, 'devuelto', pp.devuelto)
            )
            FROM pedido_productos pp
            WHERE pp.pedido_id = ped.id
          )
        )
      ) as pedidos
    FROM planillas p
    LEFT JOIN pedidos ped ON p.id = ped.planilla_id
    WHERE p.id = ${planillaId}
    GROUP BY p.id
  `

  if (planillaResult.length === 0) {
    throw new Error("Planilla no encontrada")
  }

  const planilla = planillaResult[0]

  // Obtener configuración de comisión del entregador
  const configResult = await sql`
    SELECT * FROM comisiones_config 
    WHERE entregador = ${planilla.entregador} AND activo = true
  `

  if (configResult.length === 0) {
    throw new Error(`No hay configuración de comisión para ${planilla.entregador}`)
  }

  const config = configResult[0]

  // Calcular totales
  let totalEntregas = 0
  let totalDevoluciones = 0

  planilla.pedidos?.forEach((pedido: any) => {
    if (pedido.estado === "entregado") {
      pedido.pedido_productos?.forEach((producto: any) => {
        if (producto.devuelto) {
          totalDevoluciones += Number(producto.total)
        } else {
          totalEntregas += Number(producto.total)
        }
      })
    }
  })

  const baseComisionable = totalEntregas - totalDevoluciones
  const montoComision = (baseComisionable * config.porcentaje_comision) / 100

  // Guardar o actualizar comisión (upsert manual)
  const existingComision = await sql`
    SELECT id FROM comisiones 
    WHERE entregador = ${planilla.entregador} 
      AND fecha = ${planilla.fecha} 
      AND planilla_id = ${planillaId}
  `

  if (existingComision.length > 0) {
    const result = await sql`
      UPDATE comisiones 
      SET total_entregas_efectivas = ${totalEntregas},
          total_devoluciones = ${totalDevoluciones},
          base_comisionable = ${baseComisionable},
          porcentaje_aplicado = ${config.porcentaje_comision},
          monto_comision = ${montoComision},
          estado = 'pendiente',
          updated_at = NOW()
      WHERE id = ${existingComision[0].id}
      RETURNING *
    `
    return result[0]
  } else {
    const result = await sql`
      INSERT INTO comisiones (
        entregador, fecha, planilla_id, total_entregas_efectivas,
        total_devoluciones, base_comisionable, porcentaje_aplicado,
        monto_comision, estado
      ) VALUES (
        ${planilla.entregador}, ${planilla.fecha}, ${planillaId},
        ${totalEntregas}, ${totalDevoluciones}, ${baseComisionable},
        ${config.porcentaje_comision}, ${montoComision}, 'pendiente'
      )
      RETURNING *
    `
    return result[0]
  }
}

export async function getComisionesPorPeriodo(fechaInicio: string, fechaFin: string, entregador?: string) {
  const sql = getDB()

  if (entregador && entregador !== "all") {
    const data = await sql`
      SELECT * FROM comisiones 
      WHERE fecha >= ${fechaInicio} 
        AND fecha <= ${fechaFin}
        AND entregador = ${entregador}
      ORDER BY fecha DESC
    `
    return data as Comision[]
  } else {
    const data = await sql`
      SELECT * FROM comisiones 
      WHERE fecha >= ${fechaInicio} AND fecha <= ${fechaFin}
      ORDER BY fecha DESC
    `
    return data as Comision[]
  }
}

export async function generarReporteComisiones(
  fechaInicio: string,
  fechaFin: string,
  entregador?: string,
): Promise<ComisionReporte[]> {
  const comisiones = await getComisionesPorPeriodo(fechaInicio, fechaFin, entregador)

  // Agrupar por entregador
  const reporteMap = new Map<string, ComisionReporte>()

  comisiones.forEach((comision) => {
    if (!reporteMap.has(comision.entregador)) {
      reporteMap.set(comision.entregador, {
        entregador: comision.entregador,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        total_entregas: 0,
        total_devoluciones: 0,
        base_comisionable: 0,
        monto_comision: 0,
        dias_trabajados: 0,
        comisiones: [],
      })
    }

    const reporte = reporteMap.get(comision.entregador)!
    reporte.total_entregas += Number(comision.total_entregas_efectivas)
    reporte.total_devoluciones += Number(comision.total_devoluciones)
    reporte.base_comisionable += Number(comision.base_comisionable)
    reporte.monto_comision += Number(comision.monto_comision)
    reporte.dias_trabajados += 1
    reporte.comisiones.push(comision)
  })

  return Array.from(reporteMap.values())
}

export async function marcarComisionPagada(comisionId: string, usuarioId: string) {
  const sql = getDB()

  const result = await sql`
    UPDATE comisiones 
    SET estado = 'pagado',
        pagado_en = NOW(),
        pagado_por = ${usuarioId},
        updated_at = NOW()
    WHERE id = ${comisionId}
    RETURNING *
  `

  return result[0]
}

export async function marcarComisionesPagadas(comisionIds: string[], usuarioId: string) {
  const sql = getDB()

  const result = await sql`
    UPDATE comisiones 
    SET estado = 'pagado',
        pagado_en = NOW(),
        pagado_por = ${usuarioId},
        updated_at = NOW()
    WHERE id = ANY(${comisionIds})
    RETURNING *
  `

  return result
}
