import { getDB } from './db'

// Busca, entre TODAS las tablas donde puede quedar guardada una referencia de pago
// real (consignación, cobro CxC, pago anticipado — sin importar el evento que la
// originó), cuáles de los números dados ya existen en algún lado. Es la única fuente
// de verdad para "esta referencia ya se usó" — pensada para bloquear reutilización
// fraudulenta del mismo comprobante en dos cobros distintos.
//
// excluirConsignacionPedidoIds / excluirAbonoFiadoIds: filas que se pueden ignorar
// porque son las que legítimamente se están consumiendo en esta misma operación
// (por ejemplo, la consignación o el abono que un entregador registró en ruta y que
// ahora caja está vinculando a su cuadre) — su propio número no cuenta como
// duplicado contra sí mismo.
export async function buscarReferenciasUsadas(
  numeros: (string | null | undefined)[],
  opciones: {
    excluirConsignacionPedidoIds?: number[]
    excluirAbonoFiadoIds?: number[]
    excluirPagoAnticipadoIds?: number[]
  } = {}
): Promise<string[]> {
  const limpias = Array.from(new Set(
    numeros.map(n => String(n || '').trim()).filter(n => n.length > 0)
  ))
  if (limpias.length === 0) return []

  const sql = getDB()
  const excluirConsignacionIds = opciones.excluirConsignacionPedidoIds?.length
    ? opciones.excluirConsignacionPedidoIds
    : [-1]
  const excluirAbonoIds = opciones.excluirAbonoFiadoIds?.length
    ? opciones.excluirAbonoFiadoIds
    : [-1]
  const excluirPagoAnticipadoIds = opciones.excluirPagoAnticipadoIds?.length
    ? opciones.excluirPagoAnticipadoIds
    : [-1]

  const [enConsignacionesPedido, enCuadresCaja, enAbonos, enPagosAnticipados] = await Promise.all([
    sql`
      SELECT DISTINCT numero
      FROM consignaciones_pedido
      WHERE LOWER(numero) = ANY(SELECT LOWER(n) FROM unnest(${limpias}::text[]) n)
        AND NOT (id = ANY(${excluirConsignacionIds}::int[]))
    `,
    sql`
      SELECT DISTINCT elem->>'numero' as numero
      FROM cuadres_caja,
      jsonb_array_elements(
        CASE WHEN jsonb_typeof(consignaciones) = 'array' THEN consignaciones ELSE '[]'::jsonb END
      ) AS elem
      WHERE LOWER(elem->>'numero') = ANY(SELECT LOWER(n) FROM unnest(${limpias}::text[]) n)
        AND elem->>'numero' IS NOT NULL AND elem->>'numero' != ''
    `,
    sql`
      SELECT DISTINCT referencia_pago as numero
      FROM abonos_fiados
      WHERE LOWER(referencia_pago) = ANY(SELECT LOWER(n) FROM unnest(${limpias}::text[]) n)
        AND NOT (id = ANY(${excluirAbonoIds}::int[]))
    `,
    sql`
      SELECT DISTINCT referencia as numero
      FROM pagos_anticipados
      WHERE LOWER(referencia) = ANY(SELECT LOWER(n) FROM unnest(${limpias}::text[]) n)
        AND NOT (id = ANY(${excluirPagoAnticipadoIds}::int[]))
    `,
  ])

  return Array.from(new Set(
    ([] as any[]).concat(enConsignacionesPedido, enCuadresCaja, enAbonos, enPagosAnticipados)
      .map((r: any) => r.numero)
      .filter(Boolean)
      .map((n: string) => n.toLowerCase())
  ))
}

// Detecta referencias repetidas DENTRO de un mismo cuadre (individual o agrupado —
// ambos deben comportarse igual, así que esta es la única implementación que los dos
// endpoints de cierre de cuadre usan). Cruza consignaciones y cobros CxC juntos.
//
// ✅ Excepción legítima: un mismo cliente puede pagar en una sola transferencia dos
// deudas distintas (dos fiados, o un cobro de hoy + un fiado viejo) — el entregador
// registra dos abonos que comparten el mismo comprobante. Eso no es fraude, es un
// pago dividido entre dos deudas del mismo cliente. Solo se bloquea cuando la misma
// referencia aparece para clientes DISTINTOS, la señal real de reutilización indebida
// de un comprobante. Sin cliente identificado en una de las dos entradas, no se puede
// asumir que es el mismo — cuenta como "alguien distinto" para no debilitar el control.
export function referenciasRepetidasDentroDelCuadre(
  entradas: { numero: string | null | undefined; cliente?: string | null | undefined }[]
): Set<string> {
  const clientesPorReferencia = new Map<string, Set<string>>()
  for (const e of entradas) {
    const numero = String(e.numero || '').trim()
    if (!numero) continue
    const nl = numero.toLowerCase()
    const cliente = String(e.cliente || '').trim().toLowerCase()
    const clienteKey = cliente || `__sin_cliente_${clientesPorReferencia.get(nl)?.size ?? 0}`
    if (!clientesPorReferencia.has(nl)) clientesPorReferencia.set(nl, new Set())
    clientesPorReferencia.get(nl)!.add(clienteKey)
  }
  return new Set(
    Array.from(clientesPorReferencia.entries())
      .filter(([, clientes]) => clientes.size > 1)
      .map(([numero]) => numero)
  )
}
