-- Caso: 6B MARIA DEL CARMEN FORERO. Su pago Nequi M22425578 por $477.903 (23-sep) se
-- contó en el cuadre #562 como "consignación", pero nunca se aplicó a su fiado 2428
-- ($477.903,65), que sigue vivo. Este script lo aplica al fiado SIN volver a contar el
-- dinero (queda ligado al cuadre #562, que ya lo contó). Es una sola sentencia: o se
-- aplican las dos cosas (fiado y abono) o ninguna.
--
-- Verificado en seco (EXPLAIN) y sin abonos previos con esa referencia.
-- Después de aplicarlo, el fiado queda pagado_completo con saldo 0.

WITH upd AS (
  UPDATE fiados SET
    monto_pagado        = monto_pagado + 477903,
    saldo_pendiente     = 0,
    estado              = 'pagado_completo',
    fecha_pago_completo = NOW(),
    updated_at          = NOW()
  WHERE id = 2428
    AND estado = 'pendiente'
    AND saldo_pendiente BETWEEN 477902 AND 477904
  RETURNING id
)
INSERT INTO abonos_fiados (
  pedido_id, monto_abono, monto_nequi, metodo_pago, referencia_pago,
  fecha_abono, observaciones, entregador_cobro, planilla_cobro_id,
  origen_tabla, medio_pago_detalle, created_at
)
SELECT
  '2428', 0, 477903, 'nequi', 'M22425578',
  '2026-09-23'::timestamp,
  'Pago ya contado en el cuadre #562 como consignación — aplicado al fiado sin volver a contar el dinero',
  'Alfonso 6C - 6B - 6G - 6D - 6E', 562,
  'fiados', 'NEQUI', NOW()
FROM upd;
