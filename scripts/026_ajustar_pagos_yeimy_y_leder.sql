-- Ajuste de los dos pagos administrativos de Mateo que el cuadre no podía cargar solos
-- (alerta "excede el saldo del fiado"). Una sola sentencia: todo o nada, y si se corre
-- dos veces la segunda no hace nada. Las copias de lo que se cambia/borra quedan en audit_log.
--
-- 1) YEIMY PATARROYO — pago Nequi $250.000 (ref. M15051290), pago anticipado 23.
--    El fiado 2087 solo debe $235.703. Se parte el pago en dos, usando el orden normal
--    (primero el fiado más viejo):
--      · pago 23  -> $235.703 al fiado 2087 (lo cierra en 0)
--      · pago nuevo -> $14.297 al fiado 733 (el más viejo de Yeimy), ref. M15051290-2
--    (la referencia es única en la tabla, por eso la segunda parte lleva "-2").
--
-- 2) LEDER MORALES — pago Nequi $80.000 (ref. M14745134, factura 58143), pago anticipado 44.
--    Ese mismo pago ya estaba aplicado al fiado 2258 como un abono en EFECTIVO (id 666),
--    registrado una hora antes y sin entregador, por eso nunca se cuadraba. El pago real es
--    el de Nequi (tiene referencia). Se borra el abono 666 y se devuelve el fiado a su saldo
--    anterior ($120.394): el pago 44 queda como único y, al cuadrar a Mateo, vuelve a bajar
--    el fiado a $40.394 y queda ligado a su cuadre.

WITH yeimy_23 AS (
  UPDATE pagos_anticipados SET
    monto         = 235703,
    observaciones = COALESCE(observaciones || ' | ', '') ||
                    'Nequi original $250.000: $235.703 cierran el fiado 2087 y $14.297 pasaron al fiado 733 (pago M15051290-2)'
  WHERE id = 23 AND estado = 'identificado' AND monto = 250000 AND fiado_id = '2087'
  RETURNING id
),
yeimy_nuevo AS (
  INSERT INTO pagos_anticipados (
    medio_pago, referencia, monto, cliente, registrado_por, observaciones,
    tipo, fiado_id, entregador_vinculado, estado, fecha_pago
  )
  SELECT 'Nequi', 'M15051290-2', 14297, '16 YEIMY PATARROYO CASTILLO', 'Ajuste manual',
         'Sobrante del Nequi M15051290 ($250.000): $235.703 cerraron el fiado 2087',
         'fiado', '733', 'Mateo Entregador', 'identificado', '2026-09-11'
  FROM yeimy_23
  RETURNING id
),
leder_abono AS (
  DELETE FROM abonos_fiados
  WHERE id = 666 AND pedido_id = '2258' AND planilla_cobro_id IS NULL AND monto_abono = 80000
  RETURNING *
),
leder_fiado AS (
  UPDATE fiados SET
    monto_pagado    = monto_pagado - 80000,
    saldo_pendiente = monto_total - (monto_pagado - 80000),
    estado          = 'abono_parcial',
    updated_at      = NOW()
  WHERE id = 2258 AND EXISTS (SELECT 1 FROM leder_abono)
  RETURNING id
),
auditoria AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'ajuste_pagos_yeimy_leder',
         jsonb_build_object(
           'yeimy_pago_23_original', 250000,
           'yeimy_pago_nuevo', (SELECT id FROM yeimy_nuevo),
           'leder_abono_borrado', to_jsonb(leder_abono.*)
         )
  FROM leder_abono
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM yeimy_23)    AS yeimy_pago_ajustado,
       (SELECT COUNT(*) FROM yeimy_nuevo) AS yeimy_pago_nuevo,
       (SELECT COUNT(*) FROM leder_abono) AS leder_abono_borrado,
       (SELECT COUNT(*) FROM leder_fiado) AS leder_fiado_devuelto;
