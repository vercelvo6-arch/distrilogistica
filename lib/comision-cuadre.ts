import { getDB } from './db'

// Observación con la que nace el abono de un pago administrativo (Cuadre Administrativo)
// cuando caja lo confirma dentro de un cuadre. Sirve para reconocerlo después.
export const OBSERVACION_PAGO_ADMINISTRATIVO = 'Cuadre administrativo confirmado en cuadre de caja'

// Efectivo de pagos administrativos confirmados en un cuadre. Ese dinero no lo trae el
// entregador (no suma al Esperado ni al Recibido), pero el cobro es suyo: se suma a la
// base de su comisión, igual que ya cuentan los pagos administrativos por Nequi/banco.
//
// Se lee de abonos_fiados (y no de lo que mandó la pantalla) para que crear, editar y
// recalcular la comisión den siempre el mismo valor. Si el pago administrativo reutilizó
// un abono que el entregador ya había registrado en ruta, ese abono no lleva esta
// observación: su efectivo ya viene dentro de los billetes y no se cuenta dos veces.
export async function efectivoPagosAdministrativosDelCuadre(cuadreId: number): Promise<number> {
  const sql = getDB()
  const [fila] = (await sql`
    SELECT COALESCE(SUM(monto_abono), 0) AS efectivo
    FROM abonos_fiados
    WHERE planilla_cobro_id = ${cuadreId}
      AND observaciones = ${OBSERVACION_PAGO_ADMINISTRATIVO}
  `) as any[]
  return Number(fila?.efectivo) || 0
}
