-- REPARACION: revierte el efecto del bug de 014 — pedido_productos que
-- quedaron marcados 'completo' con la nota falsa "Ya cargado — reasignado
-- desde..." mientras su pedido dueño sigue 'pendiente' (nunca se entregó).
-- Los devuelve a estado real de alistamiento pendiente y quita SOLO el
-- fragmento de nota inyectado por el bug (conserva cualquier otra nota real
-- que tuvieran, como "Subsanado desde coordinador").
--
-- Correr 014 primero para ver qué filas se van a tocar. No toca nada de
-- pedidos ya entregados/fiados/con devolución — esos sí estaban bien
-- marcados como ya cargados.

UPDATE pedido_productos pp
SET
  estado_alistamiento    = 'pendiente',
  cantidad_disponible    = NULL,
  cantidad_faltante      = 0,
  unidad_incompleta      = false,
  observaciones_faltante = NULLIF(
    TRIM(BOTH ' |' FROM TRIM(
      regexp_replace(
        pp.observaciones_faltante,
        '(\s*\|\s*)?Ya cargado — reasignado desde [^|]*? en cuadre de caja',
        '',
        'g'
      )
    )),
    ''
  ),
  updated_at = NOW()
FROM pedidos p
WHERE p.id = pp.pedido_id
  AND p.estado = 'pendiente'
  AND pp.observaciones_faltante LIKE '%Ya cargado — reasignado desde%'
RETURNING pp.id, pp.pedido_id, pp.codigo, pp.estado_alistamiento, pp.observaciones_faltante;
