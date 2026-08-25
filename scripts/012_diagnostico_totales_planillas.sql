SELECT
  p.id AS planilla_id,
  p.entregador,
  p.tipo_ruta,
  p.fecha,
  p.cuadrado_en_caja,
  p.total_cargue AS total_cargue_guardado,
  COALESCE(t.total_cargue_real, 0) AS total_cargue_real,
  p.total_cargue - COALESCE(t.total_cargue_real, 0) AS diferencia
FROM planillas p
LEFT JOIN (
  SELECT planilla_id, SUM(total) AS total_cargue_real
  FROM pedidos
  GROUP BY planilla_id
) t ON t.planilla_id = p.id
WHERE p.entregador IN ('Miguel', 'Carlos')
ORDER BY p.fecha DESC, p.entregador;

SELECT
  pp.pedido_id,
  p.cliente,
  p.total,
  p.planilla_id,
  pl.entregador,
  pl.tipo_ruta,
  pl.cuadrado_en_caja
FROM pedido_productos pp
JOIN pedidos p ON p.id = pp.pedido_id
JOIN planillas pl ON pl.id = p.planilla_id
WHERE pp.codigo = '1209'
ORDER BY p.updated_at DESC
LIMIT 10;
