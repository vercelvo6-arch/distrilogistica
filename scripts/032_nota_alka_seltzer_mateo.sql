-- Complemento del 031: la nota "Pendiente 5 blístes" seguía apareciendo en Supervisión porque esa pantalla lee
-- la observación de la línea del producto en la planilla (pedido_productos), y el 031 solo la cambió en
-- Novedades (faltantes). Aquí se iguala la nota de la línea a la del faltante.
--
--   Antes:  Pendiente 5 blístes
--   Ahora:  Pendiente 13 blísteres (5 + 8)
--
-- Solo toca las líneas de Alka Seltzer (1016) de la planilla PLN1793022570229184 cuya nota sea distinta; si se
-- corre dos veces, la segunda no hace nada. Una sola sentencia; deja la nota anterior en audit_log
-- ("nota_alka_mateo").

WITH objetivo AS (
  SELECT pp.id, pp.observaciones_faltante AS nota_antes
  FROM pedido_productos pp
  JOIN pedidos p ON p.id = pp.pedido_id
  WHERE COALESCE(p.planilla_mercancia_id, p.planilla_id) = 'PLN1793022570229184'
    AND pp.codigo = '1016'
    AND pp.observaciones_faltante IS DISTINCT FROM 'Pendiente 13 blísteres (5 + 8)'
    AND EXISTS (SELECT 1 FROM faltantes f
                WHERE f.planilla_id = 'PLN1793022570229184' AND f.codigo = '1016'
                  AND f.estado = 'pendiente' AND f.cantidad_faltante = 13)
),
actualizadas AS (
  UPDATE pedido_productos pp
  SET observaciones_faltante = 'Pendiente 13 blísteres (5 + 8)'
  FROM objetivo o
  WHERE pp.id = o.id
  RETURNING pp.id
),
auditoria AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'nota_alka_mateo', jsonb_build_object('notas_antes', jsonb_agg(to_jsonb(o)))
  FROM objetivo o
  HAVING COUNT(*) > 0
  RETURNING 1
)
SELECT COUNT(*) AS lineas_actualizadas FROM actualizadas;
