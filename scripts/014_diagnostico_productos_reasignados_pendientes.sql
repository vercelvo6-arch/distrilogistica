-- DIAGNOSTICO (solo lectura): pedido_productos marcados como 'completo' con la
-- nota "Ya cargado — reasignado desde..." cuyo pedido dueño SIGUE 'pendiente'
-- (nunca se entregó). Esto pasó por un bug en /api/pedidos/reasignar que
-- marcaba TODO pedido reasignado como ya cargado, sin verificar si de verdad
-- ya se había entregado antes de moverlo — así que el producto quedaba
-- "completo" sin haberse alistado, con una nota falsa que confundía al
-- alistador/coordinador. El endpoint ya se corrigió para pedidos nuevos;
-- este script solo identifica las filas ya afectadas (ver 015 para repararlas).

SELECT
  pp.id,
  pp.pedido_id,
  pp.codigo,
  pp.nombre,
  pp.estado_alistamiento,
  pp.observaciones_faltante,
  p.estado    AS estado_pedido,
  p.planilla_id,
  pl.tipo_ruta,
  pl.fecha
FROM pedido_productos pp
JOIN pedidos p ON p.id = pp.pedido_id
LEFT JOIN planillas pl ON pl.id = p.planilla_id
WHERE p.estado = 'pendiente'
  AND pp.observaciones_faltante LIKE '%Ya cargado — reasignado desde%'
ORDER BY pp.updated_at DESC;
