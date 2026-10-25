// Estado de alistamiento de un producto que aparece en varias líneas (pedidos o planillas del mismo
// entregador). Debe mostrar el estado MÁS PENDIENTE de todas sus líneas, sin depender del orden:
// basta una línea sin marcar para que el producto siga "pendiente"; así no se oculta lo que falta.
const PRIORIDAD: Record<string, number> = {
  no_alistado: 5,
  incompleto: 4,
  pendiente: 3,
  reemplazo: 2,
  completo: 1,
}

export function combinarEstadoAlistamiento<T extends string>(a: T | undefined | null, b: T | undefined | null): T {
  const ea = (a || "pendiente") as T
  const eb = (b || "pendiente") as T
  return (PRIORIDAD[ea] ?? 3) >= (PRIORIDAD[eb] ?? 3) ? ea : eb
}
