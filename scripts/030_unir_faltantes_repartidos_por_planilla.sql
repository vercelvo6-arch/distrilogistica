-- Deja UN SOLO faltante por producto y entregador, con la cantidad real, en los casos que el sistema partió en
-- varias planillas (facturas) desde el 25 de octubre de 2026. Un cambio nuevo, ya revertido, repartía el faltante
-- entre planillas: salían líneas como "faltan 6 de 6" y "faltan 16 de 16" para el MISMO producto, con la
-- observación "Pendiente 10 unidades".
--
-- Resultado por producto (el faltante sale de lo que escribió el alistador en la observación):
--   Miguel  · 1167 Sal de frutas Lua Plus ..... 22 pedidas · faltan 10  (antes 6/6 + 16/16)
--   Mateo   · 1016 Alka Seltzer ................ 30 pedidas · faltan 5   (antes 18/18 + 4/4 + 8/8)
--   Carlos  · 1096 ............................. 2 pedidas  · falta 1   (antes 1/1 + 1/1)
--   Miguel  · 0550 Promo 440 ................... 3 pedidas  · faltan 3  (antes 2/2 + 1/1; la observación detalla
--                                                los componentes pendientes: 2 rojos, 3 surtidos, 3 halloween)
--
-- El faltante queda en UNA sola fila (la del primer registro), con las unidades pedidas en total y las
-- disponibles = pedidas − faltantes. Las líneas de las otras planillas vuelven a "pendiente", como estaban
-- antes de partirse. Las filas sobrantes se borran y quedan completas en audit_log ("unir_faltantes_repartidos").
--
-- Solo toca faltantes PENDIENTES marcados desde el 25-oct-2026 que están en 2 o más planillas del mismo entregador
-- y fecha de alistamiento. Una sola sentencia (todo o nada); si se corre dos veces, la segunda no hace nada.

WITH real AS (
  SELECT * FROM (VALUES
    ('Miguel entregador', '1167', 10),
    ('Mateo Entregador',  '1016', 5),
    ('Carlos entregador', '1096', 1),
    ('Miguel entregador', '0550', 3)
  ) AS v(entregador, codigo, faltante)
),
grupos AS (
  SELECT pl.entregador, pl.fecha_alistamiento AS fa, f.codigo
  FROM faltantes f
  JOIN planillas pl ON pl.id = f.planilla_id
  WHERE f.estado = 'pendiente' AND f.fecha_marcado >= '2026-10-25'
  GROUP BY pl.entregador, pl.fecha_alistamiento, f.codigo
  HAVING COUNT(*) > 1
),
filas AS (
  SELECT f.id, f.planilla_id, f.codigo,
         ROW_NUMBER() OVER (PARTITION BY pl.entregador, pl.fecha_alistamiento, f.codigo ORDER BY f.fecha_marcado, f.planilla_id) AS rn,
         SUM(f.cantidad_solicitada) OVER (PARTITION BY pl.entregador, pl.fecha_alistamiento, f.codigo) AS sol_total,
         SUM(f.cantidad_faltante)   OVER (PARTITION BY pl.entregador, pl.fecha_alistamiento, f.codigo) AS falt_suma,
         r.faltante AS falt_real
  FROM faltantes f
  JOIN planillas pl ON pl.id = f.planilla_id
  JOIN grupos g ON g.entregador = pl.entregador AND g.fa IS NOT DISTINCT FROM pl.fecha_alistamiento AND g.codigo = f.codigo
  LEFT JOIN real r ON r.entregador = pl.entregador AND r.codigo = f.codigo
  WHERE f.estado = 'pendiente' AND f.fecha_marcado >= '2026-10-25'
),
borrados AS (
  DELETE FROM faltantes WHERE id IN (SELECT id FROM filas WHERE rn > 1) RETURNING *
),
lineas_otras AS (
  UPDATE pedido_productos pp
  SET estado_alistamiento = 'pendiente', cantidad_disponible = NULL, cantidad_faltante = 0,
      unidad_incompleta = FALSE, observaciones_faltante = NULL
  FROM pedidos p, borrados b
  WHERE pp.pedido_id = p.id
    AND COALESCE(p.planilla_mercancia_id, p.planilla_id) = b.planilla_id
    AND pp.codigo = b.codigo
  RETURNING pp.id
),
unidos AS (
  UPDATE faltantes f
  SET cantidad_solicitada = x.sol_total,
      cantidad_faltante   = LEAST(COALESCE(x.falt_real, x.falt_suma), x.sol_total),
      cantidad_disponible = GREATEST(x.sol_total - LEAST(COALESCE(x.falt_real, x.falt_suma), x.sol_total), 0),
      unidad_incompleta   = LEAST(COALESCE(x.falt_real, x.falt_suma), x.sol_total) < x.sol_total
  FROM filas x
  WHERE x.rn = 1 AND f.id = x.id
  RETURNING f.id, f.planilla_id, f.codigo, f.cantidad_solicitada, f.cantidad_faltante, f.cantidad_disponible
),
lineas_primera AS (
  UPDATE pedido_productos pp
  SET estado_alistamiento = CASE WHEN u.cantidad_faltante >= u.cantidad_solicitada THEN 'no_alistado' ELSE 'incompleto' END,
      cantidad_faltante   = u.cantidad_faltante,
      cantidad_disponible = u.cantidad_disponible,
      unidad_incompleta   = u.cantidad_faltante < u.cantidad_solicitada
  FROM pedidos p, unidos u
  WHERE pp.pedido_id = p.id
    AND COALESCE(p.planilla_mercancia_id, p.planilla_id) = u.planilla_id
    AND pp.codigo = u.codigo
  RETURNING pp.id
),
auditoria AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'unir_faltantes_repartidos', jsonb_build_object('filas_borradas', jsonb_agg(to_jsonb(b)))
  FROM borrados b
  HAVING COUNT(*) > 0
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM unidos)        AS productos_unidos,
       (SELECT COUNT(*) FROM borrados)      AS filas_sobrantes_borradas,
       (SELECT COUNT(*) FROM lineas_otras)  AS lineas_otras_planillas_a_pendiente,
       (SELECT COUNT(*) FROM lineas_primera) AS lineas_de_la_planilla_principal;
