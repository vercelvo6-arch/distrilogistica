// Respaldo de filas antes de borrarlas (pedidos / planillas / novedades_pedido).
// Debe llamarse DENTRO de la misma transacción (BEGIN...COMMIT) que el DELETE posterior,
// usando el mismo cliente `sql`, para que el snapshot y el borrado sean atómicos.

type Usuario = { id: string; nombre: string }

export async function registrarSnapshotPlanilla(
  sql: any,
  planillaId: string,
  usuario: Usuario,
  motivo: string
) {
  const [planillaRow] = await sql`
    SELECT to_jsonb(p) AS row FROM planillas p WHERE id = ${planillaId}
  `
  const pedidosRows = await sql`
    SELECT
      to_jsonb(pe) AS pedido,
      COALESCE(
        (SELECT jsonb_agg(to_jsonb(pp)) FROM pedido_productos pp WHERE pp.pedido_id = pe.id),
        '[]'::jsonb
      ) AS productos
    FROM pedidos pe
    WHERE pe.planilla_id = ${planillaId}
  `

  const snapshot = {
    planilla: planillaRow?.row || null,
    pedidos: pedidosRows.map((r: any) => ({ pedido: r.pedido, productos: r.productos })),
  }
  const contexto = {
    planilla_id: planillaId,
    ruta: planillaRow?.row?.tipo_ruta || null,
    entregador: planillaRow?.row?.entregador || null,
    num_pedidos: pedidosRows.length,
  }

  await sql`
    INSERT INTO eliminaciones_historial (
      tipo_entidad, entidad_id, contexto, snapshot, motivo, eliminado_por, eliminado_por_nombre
    ) VALUES (
      'planilla', ${planillaId}, ${JSON.stringify(contexto)}::jsonb, ${JSON.stringify(snapshot)}::jsonb,
      ${motivo}, ${usuario.id}, ${usuario.nombre}
    )
  `
}

export async function registrarSnapshotPedido(
  sql: any,
  pedidoId: string,
  usuario: Usuario,
  motivo: string
) {
  const [pedidoRow] = await sql`
    SELECT to_jsonb(pe) AS row FROM pedidos pe WHERE pe.id = ${pedidoId}
  `
  if (!pedidoRow) return // nada que respaldar

  const productosRows = await sql`
    SELECT COALESCE(jsonb_agg(to_jsonb(pp)), '[]'::jsonb) AS productos
    FROM pedido_productos pp
    WHERE pp.pedido_id = ${pedidoId}
  `

  const snapshot = {
    pedido: pedidoRow.row,
    productos: productosRows[0]?.productos || [],
  }
  const contexto = {
    pedido_id: pedidoId,
    planilla_id: pedidoRow.row?.planilla_id || null,
    cliente: pedidoRow.row?.cliente || null,
  }

  await sql`
    INSERT INTO eliminaciones_historial (
      tipo_entidad, entidad_id, contexto, snapshot, motivo, eliminado_por, eliminado_por_nombre
    ) VALUES (
      'pedido', ${pedidoId}, ${JSON.stringify(contexto)}::jsonb, ${JSON.stringify(snapshot)}::jsonb,
      ${motivo}, ${usuario.id}, ${usuario.nombre}
    )
  `
}

export async function registrarSnapshotNovedad(
  sql: any,
  novedadId: string,
  usuario: Usuario,
  motivo: string
) {
  const [novedadRow] = await sql`
    SELECT to_jsonb(n) AS row FROM novedades_pedido n WHERE n.id = ${novedadId}
  `
  if (!novedadRow) return

  const snapshot = { novedad: novedadRow.row }
  const contexto = {
    novedad_id: novedadId,
    pedido_id: novedadRow.row?.pedido_id || null,
    tipo_novedad: novedadRow.row?.tipo_novedad || null,
  }

  await sql`
    INSERT INTO eliminaciones_historial (
      tipo_entidad, entidad_id, contexto, snapshot, motivo, eliminado_por, eliminado_por_nombre
    ) VALUES (
      'novedad', ${novedadId}, ${JSON.stringify(contexto)}::jsonb, ${JSON.stringify(snapshot)}::jsonb,
      ${motivo}, ${usuario.id}, ${usuario.nombre}
    )
  `
}
