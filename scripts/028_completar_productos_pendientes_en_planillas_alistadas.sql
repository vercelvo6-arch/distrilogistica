-- Productos que quedaron "pendiente" en planillas que YA están alistadas (todavía sin cuadrar caja),
-- cuando ese mismo producto, del mismo entregador y la misma fecha de alistamiento, sí está marcado
-- "completo" en otra planilla. Pasaba porque el alistador marcaba el producto una sola vez y el
-- sistema solo actualizaba la PRIMERA planilla del entregador que lo traía (caso típico: una planilla
-- que venía de "Extra" y se reasignó a Mateo junto a las propias de Mateo).
--
-- Solo cambia a "completo" las líneas pendientes de un producto SIN ningún problema registrado
-- (ni incompleto, ni no alistado, ni reemplazo) en ese entregador y fecha. Los casos con problema se
-- dejan como están para revisarlos a mano.
--
-- Una sola sentencia (todo o nada); si se corre dos veces, la segunda no hace nada. Las líneas
-- cambiadas quedan listadas en audit_log (acción "completar_productos_pendientes") por si hay que
-- devolverlas a "pendiente".

WITH alistadas AS (
  SELECT pp.id AS linea_id, pp.codigo, pp.estado_alistamiento AS estado,
         pl.entregador, pl.fecha_alistamiento
  FROM pedido_productos pp
  JOIN pedidos p ON p.id = pp.pedido_id AND p.estado = 'pendiente'
  JOIN planillas pl ON pl.id = COALESCE(p.planilla_mercancia_id, p.planilla_id) AND pl.estado = 'alistado'
),
grupos AS (
  SELECT entregador, fecha_alistamiento, codigo,
         bool_or(estado = 'completo') AS hay_completo,
         bool_or(estado IN ('incompleto', 'no_alistado', 'reemplazo')) AS hay_problema
  FROM alistadas
  GROUP BY entregador, fecha_alistamiento, codigo
),
objetivo AS (
  SELECT a.linea_id
  FROM alistadas a
  JOIN grupos g ON g.entregador IS NOT DISTINCT FROM a.entregador
               AND g.fecha_alistamiento IS NOT DISTINCT FROM a.fecha_alistamiento
               AND g.codigo = a.codigo
  WHERE a.estado = 'pendiente' AND g.hay_completo AND NOT g.hay_problema
),
actualizadas AS (
  UPDATE pedido_productos
  SET estado_alistamiento = 'completo'
  WHERE id IN (SELECT linea_id FROM objetivo) AND estado_alistamiento = 'pendiente'
  RETURNING id
),
auditoria AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'completar_productos_pendientes',
         jsonb_build_object('lineas', (SELECT jsonb_agg(id) FROM actualizadas), 'total', (SELECT COUNT(*) FROM actualizadas))
  WHERE EXISTS (SELECT 1 FROM actualizadas)
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM actualizadas) AS lineas_completadas;
