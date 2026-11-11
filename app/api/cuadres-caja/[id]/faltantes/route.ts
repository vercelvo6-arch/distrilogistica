import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { comentarioVigente } from '@/lib/sumar-notas'
import { agruparFaltantes } from '@/lib/agrupar-faltantes'

// GET /api/cuadres-caja/[id]/faltantes — "Ver planilla con faltantes entregados" del Historial de
// caja: los faltantes de las planillas de un cuadre y lo que el coordinador entregó al subsanarlos.
// Marca cuando se entregó más de lo que dice el comentario del alistador. Solo se consulta al abrir.
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

    const filas = ids.length === 0 ? [] : ((await sql`
      SELECT f.*, pl.tipo_ruta AS ruta_planilla,
             um.nombre AS marcado_por_nombre, ur.nombre AS resuelto_por_nombre
      FROM faltantes f
      LEFT JOIN planillas pl ON pl.id = f.planilla_id
      LEFT JOIN usuarios um ON um.id = f.marcado_por
      LEFT JOIN usuarios ur ON ur.id = f.resuelto_por
      WHERE f.planilla_id = ANY(${ids}::text[])
      ORDER BY f.descripcion, f.fecha_marcado
    `) as any[])

    // Un registro del alistador repartido en varias rutas se muestra como una sola fila.
    const rutaPorId = new Map(filas.map((f) => [String(f.id), f.ruta_planilla || f.ruta]))
    const faltantes = agruparFaltantes(filas).map((f: any) => {
      const comentario = comentarioVigente(f)
      const entregado = (f.ids as string[]).reduce((s, fid) => {
        const fila = filas.find((x) => String(x.id) === fid)
        return s + (Number(fila?.cantidad_resuelta) || 0)
      }, 0)
      const numero = Number((String(comentario).match(/\d+/) || [])[0])
      return {
        codigo: f.codigo,
        producto: f.descripcion,
        rutas: Array.from(new Set((f.ids as string[]).map((fid) => rutaPorId.get(fid)).filter(Boolean))),
        comentario,
        faltante: Number(f.cantidad_faltante) || 0,
        entregado,
        estado: f.estado,
        tipo: f.tipo_resolucion,
        nota: f.observaciones_resolucion ? String(f.observaciones_resolucion).replace(/\s*\[REVERTIDO[^\]]*\]/g, '').trim() : null,
        marcadoPor: f.marcado_por_nombre || null,
        resueltoPor: f.resuelto_por_nombre || null,
        fechaResolucion: f.fecha_resolucion || null,
        // Se entregó más de lo que escribió el alistador (cuando su comentario trae un número).
        entregadoDeMas: Number.isFinite(numero) && entregado > numero ? entregado - numero : 0,
      }
    })

    return NextResponse.json({
      cuadre: { id: cuadre.id, entregador: cuadre.entregador, cuadradoEn: cuadre.created_at },
      faltantes,
    })
  } catch (error) {
    console.error('[CUADRE FALTANTES GET] ERROR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar los faltantes' },
      { status: 500 }
    )
  }
}
