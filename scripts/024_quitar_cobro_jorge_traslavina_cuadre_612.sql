-- Cuadre #612 (Carlos entregador, 16-oct-2026, rutas 10, 31, 37, 24):
-- el cobro en efectivo de $194.028 de 17 JORGE TRASLAVIÑA (fiado 2528) se quita del cuadre.
-- Como ese efectivo estaba dentro de los billetes contados, también se descuenta de los billetes.
--
--   Cobros en efectivo : 264.828  -> 70.800
--   Cobros CxC (total) : 1.037.268 -> 843.240
--   Billetes           : 2.053.000 -> 1.858.972
--   Recibido           : 3.267.440 -> 3.073.412
--   Esperado           : 3.305.575,30 -> 3.111.547,30
--   Diferencia         : -38.135,30 (igual: se quitó el mismo valor de ambos lados)
--
-- El fiado 2528 vuelve a quedar vivo por $194.027,88 (monto_pagado 0).
-- Es UNA sola sentencia: o se aplica todo o no se aplica nada, y si se corre dos veces
-- la segunda no hace nada (el abono 741 ya no existe). Antes de borrar el abono queda
-- copia completa en audit_log.

WITH del AS (
  DELETE FROM abonos_fiados
  WHERE id = 741
    AND planilla_cobro_id = 612
    AND pedido_id = '2528'
    AND monto_abono = 194028
  RETURNING *
),
fia AS (
  UPDATE fiados SET
    monto_pagado        = monto_pagado - 194028,
    saldo_pendiente     = monto_total - (monto_pagado - 194028),
    estado              = 'pendiente',
    fecha_pago_completo = NULL,
    updated_at          = NOW()
  WHERE id = 2528
    AND EXISTS (SELECT 1 FROM del)
  RETURNING id
),
cua AS (
  UPDATE cuadres_caja SET
    cobros_efectivo = cobros_efectivo - 194028,
    total_cobros    = total_cobros - 194028,
    billetes        = billetes - 194028,
    total_efectivo  = total_efectivo - 194028,
    total_esperado  = total_esperado - 194028,
    updated_at      = NOW()
  WHERE id = 612
    AND EXISTS (SELECT 1 FROM del)
  RETURNING id
),
aud AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'quitar_cobro_de_cuadre',
         jsonb_build_object('cuadre_id', 612, 'fiado_id', 2528, 'abono_borrado', to_jsonb(del.*))
  FROM del
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM del) AS abonos_borrados,
       (SELECT COUNT(*) FROM fia) AS fiados_reabiertos,
       (SELECT COUNT(*) FROM cua) AS cuadres_ajustados;
