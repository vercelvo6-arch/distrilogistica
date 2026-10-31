import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { OBSERVACION_PAGO_ADMINISTRATIVO } from '@/lib/comision-cuadre'
import { OBSERVACION_PAGO_ADMINISTRATIVO_DIRECTO } from '@/lib/pago-administrativo'

// El Resumen arranca en octubre de 2026: antes de eso no se muestra nada aunque se pida.
const RESUMEN_DESDE_MINIMO = '2026-10-01'

// GET - Pestaña "Resumen" del Historial: por día, cuatro datos informativos de cada
// entregador (sin sumarlos ni restarlos entre sí) y el detalle de cada cobro. Solo lectura.
//
//   Entregado     = lo que entregó: Esperado del cuadre menos los cobros que ese Esperado
//                   incluye (es decir, el cargue menos las novedades).
//   Cobros        = cobros de fiados: los que él trajo a su cuadre (por la fecha del cuadre)
//                   y los pagos administrativos (por la fecha en que se confirmaron).
//   Descuadre     = diferencia del cuadre (negativo = faltante).
//   Devoluciones  = devoluciones del cuadre.
//
// Cada cobro se cuenta una sola vez. No entran los "pagos ya contados como consignación"
// (botón Aplicar este pago al fiado): esa plata ya entró al cuadre como consignación.
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const desdePedido = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const desde = desdePedido && desdePedido < RESUMEN_DESDE_MINIMO ? RESUMEN_DESDE_MINIMO : desdePedido
    // familia: primera palabra del nombre ("Alfonso" reúne "Alfonso 72 - 84", "Alfonso 6C-7B-93"…).
    const familia = searchParams.get('familia')?.trim() || ''
    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Se requieren las fechas desde y hasta' }, { status: 400 })
    }

    const sql = getDB()
    const deEntregador = (columna: any) =>
      familia ? sql`AND (${columna} ILIKE ${familia + ' %'} OR ${columna} ILIKE ${familia})` : sql``

    const cuadres = (await sql`
      SELECT id, entregador, to_char(fecha_cuadre, 'YYYY-MM-DD') AS dia,
             COALESCE(total_esperado, 0) - COALESCE(total_cobros, 0) AS entregado,
             COALESCE(diferencia, 0) AS descuadre,
             COALESCE(devoluciones, 0) AS devoluciones
      FROM cuadres_caja
      WHERE fecha_cuadre BETWEEN ${desde}::date AND ${hasta}::date
        ${deEntregador(sql`entregador`)}
    `) as any[]

    const ids = cuadres.map((c) => Number(c.id))
    const cobrosDeCuadres = ids.length === 0 ? [] : ((await sql`
      SELECT af.id, af.planilla_cobro_id AS cuadre_id, COALESCE(af.monto_abono, 0) AS efectivo,
             COALESCE(af.monto_nequi, 0) AS electronico, af.referencia_pago AS referencia,
             (af.observaciones = ${OBSERVACION_PAGO_ADMINISTRATIVO}) AS administrativo,
             COALESCE(f.cliente, p.cliente, (
               SELECT pa.cliente FROM pedidos_archivo pa
               WHERE af.origen_tabla = 'pedidos' AND pa.id = af.pedido_id LIMIT 1
             )) AS cliente
      FROM abonos_fiados af
      LEFT JOIN fiados f ON af.origen_tabla = 'fiados' AND f.id::text = af.pedido_id
      LEFT JOIN pedidos p ON af.origen_tabla = 'pedidos' AND p.id = af.pedido_id
      WHERE af.planilla_cobro_id = ANY(${ids}::int[])
        AND COALESCE(af.observaciones, '') NOT LIKE 'Pago ya contado en el cuadre #%'
    `) as any[])

    // Pagos administrativos confirmados directo en Cuadre Administrativo (fiados).
    const administrativosDirectos = (await sql`
      SELECT af.id, af.entregador_cobro AS entregador,
             to_char((af.fecha_abono AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS dia,
             COALESCE(af.monto_abono, 0) AS efectivo, COALESCE(af.monto_nequi, 0) AS electronico,
             af.referencia_pago AS referencia, f.cliente
      FROM abonos_fiados af
      LEFT JOIN fiados f ON f.id::text = af.pedido_id
      WHERE af.observaciones = ${OBSERVACION_PAGO_ADMINISTRATIVO_DIRECTO}
        AND (af.fecha_abono AT TIME ZONE 'America/Bogota')::date BETWEEN ${desde}::date AND ${hasta}::date
        ${deEntregador(sql`af.entregador_cobro`)}
    `) as any[]

    // Pagos administrativos de pedidos de asesor: no crean abono, se leen del pago.
    const administrativosAsesor = (await sql`
      SELECT id, entregador_vinculado AS entregador,
             to_char((vinculado_en AT TIME ZONE 'America/Bogota')::date, 'YYYY-MM-DD') AS dia,
             monto, medio_pago, referencia, cliente
      FROM pagos_anticipados
      WHERE tipo = 'pedido_asesor' AND estado = 'vinculado'
        AND (vinculado_en AT TIME ZONE 'America/Bogota')::date BETWEEN ${desde}::date AND ${hasta}::date
        ${deEntregador(sql`entregador_vinculado`)}
    `) as any[]

    type Dia = {
      fecha: string
      entregado: number
      cobros: number
      descuadre: number
      devoluciones: number
      detalle: any[]
    }
    const dias = new Map<string, Dia>()
    const dia = (fecha: string) => {
      if (!dias.has(fecha)) dias.set(fecha, { fecha, entregado: 0, cobros: 0, descuadre: 0, devoluciones: 0, detalle: [] })
      return dias.get(fecha)!
    }
    const agregarCobro = (fecha: string, c: any) => {
      const d = dia(fecha)
      d.cobros += c.efectivo + c.electronico
      d.detalle.push(c)
    }

    const cuadrePorId = new Map<number, any>()
    for (const c of cuadres) {
      cuadrePorId.set(Number(c.id), c)
      const d = dia(c.dia)
      d.entregado += Number(c.entregado) || 0
      d.descuadre += Number(c.descuadre) || 0
      d.devoluciones += Number(c.devoluciones) || 0
    }
    for (const a of cobrosDeCuadres) {
      const cuadre = cuadrePorId.get(Number(a.cuadre_id))
      if (!cuadre) continue
      agregarCobro(cuadre.dia, {
        id: `abono-${a.id}`, cliente: a.cliente || null, entregador: cuadre.entregador,
        tipo: a.administrativo ? 'administrativo' : 'entregador', cuadreId: Number(a.cuadre_id),
        efectivo: Number(a.efectivo) || 0, electronico: Number(a.electronico) || 0, referencia: a.referencia || null,
      })
    }
    for (const a of administrativosDirectos) {
      agregarCobro(a.dia, {
        id: `abono-${a.id}`, cliente: a.cliente || null, entregador: a.entregador || null,
        tipo: 'administrativo', cuadreId: null,
        efectivo: Number(a.efectivo) || 0, electronico: Number(a.electronico) || 0, referencia: a.referencia || null,
      })
    }
    for (const p of administrativosAsesor) {
      const esEfectivo = p.medio_pago === 'Efectivo'
      agregarCobro(p.dia, {
        id: `pa-${p.id}`, cliente: p.cliente || null, entregador: p.entregador || null,
        tipo: 'administrativo', cuadreId: null,
        efectivo: esEfectivo ? Number(p.monto) || 0 : 0, electronico: esEfectivo ? 0 : Number(p.monto) || 0,
        referencia: p.referencia || null,
      })
    }

    const resultado = Array.from(dias.values()).sort((a, b) => b.fecha.localeCompare(a.fecha))
    return NextResponse.json({ dias: resultado, desde })
  } catch (error) {
    console.error('[CUADRES RESUMEN GET] ERROR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar el resumen' },
      { status: 500 }
    )
  }
}
