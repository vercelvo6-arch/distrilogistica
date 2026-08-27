SELECT
  cp.id,
  cp.entregador,
  cp.cliente,
  cp.banco,
  cp.numero,
  cp.monto,
  cp.fecha,
  cp.registrado_en,
  cp.pedido_id,
  p.planilla_id,
  pl.entregador AS entregador_planilla,
  pl.fecha AS fecha_planilla,
  pl.cuadrado_en_caja,
  pl.cuadre_caja_id
FROM consignaciones_pedido cp
LEFT JOIN pedidos p ON p.id = cp.pedido_id
LEFT JOIN planillas pl ON pl.id = p.planilla_id
WHERE cp.cuadre_caja_id IS NULL
ORDER BY cp.registrado_en DESC;
