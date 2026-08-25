-- SOLO LECTURA - no modifica nada. Corre esto y pega el resultado completo.
--
-- Compara, para cada planilla NO cuadrada, el total_cargue guardado en la
-- tabla planillas contra el total real calculado en vivo desde pedidos.
-- Si alguna fila muestra diferencia != 0, esa es la planilla que sigue
-- desincronizada, y ahi vemos si esta marcada cuadrado_en_caja o no.

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

-- Tambien: dime en cual planilla esta AHORA MISMO el pedido que se
-- reasigno (codigo de producto 1209), y si el pedido esta ahi.
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
