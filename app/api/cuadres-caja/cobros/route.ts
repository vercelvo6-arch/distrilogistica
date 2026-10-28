import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getDB } from '@/lib/db'
import { OBSERVACION_PAGO_ADMINISTRATIVO } from '@/lib/comision-cuadre'

// GET - Cobros de fiados (CxC) que entraron en cuadres cerrados, para la pestaña
// "Cobros por entregador" del Historial. Solo lectura.
//
// Cada abono ligado a un cuadre es un cobro, contado UNA vez, a nombre del entregador
// de ese cuadre. Se separa lo que cobró el entregador en ruta (o caja en el cuadre) de
// los pagos administrativos (Cuadre Administrativo). Los pagos administrativos de
// pedidos de asesor no crean abono: se leen de pagos_anticipados.
//
// No se cuentan los "pagos ya contados como consignación" (botón Aplicar este pago al
// fiado): ese dinero ya entró al cuadre como consignación, no como cobro.
export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    // familia: primera palabra del nombre ("Alfonso" reúne "Alfonso 72 - 84", "Alfonso 6C-7B-93"…).
    const familia = searchParams.get('familia')?.trim() || ''

    if (!desde || !hasta) {
      return NextResponse.json({ error: 'Se requieren las fechas desde y hasta' }, { status: 400 })
    }

    const sql = getDB()

    const abonos = (await sql`
      SELECT af.id, cc.id AS cuadre_id, cc.entregador, cc.fecha_cuadre,
             COALESCE(f.cliente, p.cliente, (
               SELECT pa.cliente FROM pedidos_archivo pa
               WHERE af.origen_tabla = 'pedidos' AND pa.id = af.pedido_id
               LIMIT 1
             )) AS cliente,
             COALESCE(af.monto_abono, 0) AS efectivo,
             COALESCE(af.monto_nequi, 0) AS electronico,
             af.referencia_pago AS referencia,
             af.medio_pago_detalle,
             af.fecha_abono,
             (af.observaciones = ${OBSERVACION_PAGO_ADMINISTRATIVO}) AS administrativo
      FROM abonos_fiados af
      JOIN cuadres_caja cc ON cc.id = af.planilla_cobro_id
      LEFT JOIN fiados f ON af.origen_tabla = 'fiados' AND f.id::text = af.pedido_id
      LEFT JOIN pedidos p ON af.origen_tabla = 'pedidos' AND p.id = af.pedido_id
      WHERE cc.fecha_cuadre BETWEEN ${desde}::date AND ${hasta}::date
        AND COALESCE(af.observaciones, '') NOT LIKE 'Pago ya contado en el cuadre #%'
        ${familia ? sql`AND (cc.entregador ILIKE ${familia + ' %'} OR cc.entregador ILIKE ${familia})` : sql``}
      ORDER BY cc.fecha_cuadre DESC, af.id DESC
    `) as any[]

    const pagosAsesor = (await sql`
      SELECT id, entregador_vinculado AS entregador, vinculado_en, cliente, monto, medio_pago, referencia
      FROM pagos_anticipados
      WHERE tipo = 'pedido_asesor'
        AND estado = 'vinculado'
        AND (vinculado_en AT TIME ZONE 'America/Bogota')::date BETWEEN ${desde}::date AND ${hasta}::date
        ${familia ? sql`AND (entregador_vinculado ILIKE ${familia + ' %'} OR entregador_vinculado ILIKE ${familia})` : sql``}
      ORDER BY vinculado_en DESC
    `) as any[]

    const cobros = [
      ...abonos.map((a) => ({
        id: `abono-${a.id}`,
        entregador: a.entregador || '(sin entregador)',
        fecha: a.fecha_cuadre,
        cuadreId: Number(a.cuadre_id),
        cliente: a.cliente || null,
        efectivo: Number(a.efectivo) || 0,
        electronico: Number(a.electronico) || 0,
        medio: a.medio_pago_detalle || null,
        referencia: a.referencia || null,
        administrativo: Boolean(a.administrativo),
      })),
      ...pagosAsesor.map((p) => {
        const esEfectivo = p.medio_pago === 'Efectivo'
        return {
          id: `pa-${p.id}`,
          entregador: p.entregador || '(sin entregador)',
          fecha: p.vinculado_en,
          cuadreId: null,
          cliente: p.cliente || null,
          efectivo: esEfectivo ? Number(p.monto) || 0 : 0,
          electronico: esEfectivo ? 0 : Number(p.monto) || 0,
          medio: p.medio_pago || null,
          referencia: p.referencia || null,
          administrativo: true,
        }
      }),
    ]

    return NextResponse.json({ cobros })
  } catch (error) {
    console.error('[CUADRES COBROS GET] ERROR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al cargar los cobros' },
      { status: 500 }
    )
  }
}
