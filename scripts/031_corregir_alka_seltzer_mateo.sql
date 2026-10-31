-- Corrige el faltante de Alka Seltzer (1016) de Mateo Entregador: deben ser 13 pendientes de 30, no 5.
-- El script 030 tomó solo "Pendiente 5 blístes" y se olvidó de "Pendiente 8 blíster" (otra factura): 5 + 8 = 13.
--
--   Antes:  30 pedidas · disponibles 25 · faltan 5
--   Ahora:  30 pedidas · disponibles 17 · faltan 13  (una sola línea, en la planilla PLN1793022570229184)
--
-- Solo toca ese faltante si sigue PENDIENTE y con faltante distinto de 13 (si se corre dos veces, la segunda no
-- hace nada). Guarda cómo estaba antes en audit_log ("corregir_faltante_alka_mateo"). Una sola sentencia.

WITH antes AS (
  SELECT f.* FROM faltantes f
  WHERE f.planilla_id = 'PLN1793022570229184'
    AND f.codigo = '1016'
    AND f.estado = 'pendiente'
    AND f.cantidad_solicitada = 30
    AND f.cantidad_faltante <> 13
),
corregido AS (
  UPDATE faltantes f
  SET cantidad_faltante   = 13,
      cantidad_disponible = f.cantidad_solicitada - 13,
      unidad_incompleta   = TRUE,
      observaciones       = 'Pendiente 13 blísteres (5 + 8)'
  FROM antes a
  WHERE f.id = a.id
  RETURNING f.id, f.planilla_id, f.codigo
),
linea AS (
  UPDATE pedido_productos pp
  SET estado_alistamiento = 'incompleto',
      cantidad_faltante   = 13,
      cantidad_disponible = 17,
      unidad_incompleta   = TRUE
  FROM pedidos p, corregido c
  WHERE pp.pedido_id = p.id
    AND COALESCE(p.planilla_mercancia_id, p.planilla_id) = c.planilla_id
    AND pp.codigo = c.codigo
  RETURNING pp.id
),
auditoria AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'corregir_faltante_alka_mateo', jsonb_build_object('faltante_antes', to_jsonb(a))
  FROM antes a
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM corregido) AS faltantes_corregidos,
       (SELECT COUNT(*) FROM linea)     AS lineas_actualizadas;
