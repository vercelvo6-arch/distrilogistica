-- El indice unico idx_abonos_fiados_referencia bloqueaba CUALQUIER reutilizacion
-- de un numero de referencia, incluso el caso legitimo ya soportado por la app
-- (lib/validar-referencia.ts): un mismo cliente pagando dos deudas distintas
-- con un solo comprobante. La app dejaba pasar ese caso pero la base de datos
-- lo rechazaba con "duplicate key value violates unique constraint
-- idx_abonos_fiados_referencia" -- el error que obligaba a confirmar el cuadre
-- dos veces.
--
-- Se reemplaza por un unico compuesto (referencia_pago, pedido_id): sigue
-- bloqueando que la MISMA deuda reciba dos filas con la misma referencia
-- (una reinsercion accidental), pero ya no bloquea que la misma referencia
-- cubra dos deudas (pedido_id) distintas del mismo cliente.

DROP INDEX IF EXISTS idx_abonos_fiados_referencia;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abonos_fiados_referencia_por_deuda
  ON abonos_fiados (referencia_pago, pedido_id)
  WHERE referencia_pago IS NOT NULL;
