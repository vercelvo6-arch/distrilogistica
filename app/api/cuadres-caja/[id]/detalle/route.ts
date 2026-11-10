import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'

// GET /api/cuadres-caja/[id]/detalle — las planillas de un cuadre ya cerrado con cada pedido y
// sus productos. Al cuadrar, los pedidos salen de la tabla de trabajo pero se copian antes al
// archivo (script 020): de ahí se leen. Solo se consulta cuando alguien pulsa "Ver planilla"
// en el Historial (no se carga sola), con los índices del archivo por planilla y por pedido.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }
    const { id } = await params
    const cuadreId = parseInt(id, 10)
    if (isNaN(cuadreId) || cuadreId <= 0) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 })
    }

    const sql = getDB()
    const [cuadre] = (await sql`
      SELECT id, entregador, planillas_ids, created_at FROM cuadres_caja WHERE id = ${cuadreId}
    `) as any[]
    if (!cuadre) {
      return NextResponse.json({ error: 'Cuadre no encontrado' }, { status: 404 })
    }
    const ids: string[] = Array.isArray(cuadre.planillas_ids) ? cuadre.planillas_ids : []

    const planillas = (await sql`
      SELECT id, tipo_ruta, fecha, fecha_alistamiento, alistado_en, total_cargue
      FROM planillas WHERE id = ANY(${ids}::text[])
    `) as any[]

    // Archivo primero; si un pedido todavía está en la tabla de trabajo (cuadres de antes del
    // archivo no lo tienen en ninguna), se toma de ahí.
    const pedidos = (await sql`
      SELECT DISTINCT ON (id) id, planilla_id, secuencia, cliente, total, estado
      FROM (
        SELECT id, planilla_id, secuencia, cliente, total, estado, 1 AS prioridad FROM pedidos_archivo WHERE planilla_id = ANY(${ids}::text[])
        UNION ALL
        SELECT id, planilla_id, secuencia, cliente, total, estado, 2 AS prioridad FROM pedidos WHERE planilla_id = ANY(${ids}::text[])
      ) t
      ORDER BY id, prioridad
    `) as any[]
    const pedidoIds = pedidos.map((p) => String(p.id))

    const productos = pedidoIds.length === 0 ? [] : ((await sql`
      SELECT DISTINCT ON (id) pedido_id, codigo, nombre, cantidad, precio_unitario, total,
             estado_alistamiento, cantidad_faltante, observaciones_faltante
      FROM (
        SELECT id, pedido_id, codigo, nombre, cantidad, precio_unitario, total, estado_alistamiento, cantidad_faltante, observaciones_faltante, 1 AS prioridad
        FROM pedido_productos_archivo WHERE pedido_id = ANY(${pedidoIds}::text[])
        UNION ALL
        SELECT id, pedido_id, codigo, nombre, cantidad, precio_unitario, total, estado_alistamiento, cantidad_faltante, observaciones_faltante, 2 AS prioridad
        FROM pedido_productos WHERE pedido_id = ANY(${pedidoIds}::text[])
      ) t
      ORDER BY id, prioridad
    `) as any[])

    const porPedido = new Map<string, any[]>()
    for (const pr of productos) {
      const k = String(pr.pedido_id)
      if (!porPedido.has(k)) porPedido.set(k, [])
      porPedido.get(k)!.push({
        codigo: pr.codigo,
        nombre: pr.nombre,
        cantidad: Number(pr.cantidad) || 0,
        precio: Number(pr.precio_unitario) || 0,
        total: Number(pr.total) || 0,
        alistamiento: pr.estado_alistamiento || null,
        faltante: Number(pr.cantidad_faltante) || 0,
        comentario: pr.observaciones_faltante || null,
      })
    }

    const resultado = planillas
      .map((pl) => ({
        id: pl.id,
        ruta: pl.tipo_ruta,
        fecha: pl.fecha,
        fechaAlistamiento: pl.fecha_alistamiento,
        alistadoEn: pl.alistado_en,
        cargue: Number(pl.total_cargue) || 0,
        pedidos: pedidos
          .filter((p) => p.planilla_id === pl.id)
          .sort((a, b) => (Number(a.secuencia) || 0) - (Number(b.secuencia) || 0))
          .map((p) => ({
            id: p.id,
            cliente: String(p.cliente || '').trim(),
            total: Number(p.total) || 0,
            productos: (porPedido.get(String(p.id)) || []).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre))),
          })),
      }))
      .sort((a, b) => String(a.ruta).localeCompare(String(b.ruta), 'es', { numeric: true }))

    return NextResponse.json({
      cuadre: { id: cuadre.id, entregador: cuadre.entregador, cuadradoEn: cuadre.created_at },
      planillas: resultado,
    })
  } catch (error) {
    console.error('[CUADRE DETALLE GET] ERROR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar el detalle' },
      { status: 500 }
    )
  }
}
