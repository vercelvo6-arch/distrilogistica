-- Repara los totales (total_cargue, total_entregado, total_fiado,
-- total_repaso, total_devolucion) de las planillas que quedaron
-- desincronizadas por el bug de /api/pedidos/reasignar: cuando el paso de
-- "Actualizar faltantes" chocaba con la restricción única
-- faltantes_planilla_codigo_unique, el pedido ya se había movido de
-- planilla pero el recálculo de totales (que iba después) nunca se
-- ejecutaba — dejando el cargue "pegado" a la planilla de origen y sin
-- sumar en la planilla destino.
--
-- Es seguro re-ejecutar: solo resincroniza los totales desde la fuente de
-- verdad (pedidos). Se limita a cuadrado_en_caja = false porque una
-- planilla ya cuadrada tiene sus pedidos congelados (reasignar bloquea
-- mover hacia/desde una planilla cuadrada), así que no hay nada que
-- resincronizar ahí y no se toca el historial ya cerrado.

UPDATE planillas p
SET
  total_cargue      = COALESCE(t.total_cargue, 0),
  total_entregado   = COALESCE(t.total_entregado, 0),
  total_fiado       = COALESCE(t.total_fiado, 0),
  total_repaso      = COALESCE(t.total_repaso, 0),
  total_devolucion  = COALESCE(t.total_devolucion, 0),
  updated_at        = NOW()
FROM (
  SELECT
    planilla_id,
    SUM(total) AS total_cargue,
    SUM(CASE WHEN estado = 'entregado'  THEN total ELSE 0 END) AS total_entregado,
    SUM(CASE WHEN estado = 'fiado'      THEN total ELSE 0 END) AS total_fiado,
    SUM(CASE WHEN estado = 'repaso'     THEN total ELSE 0 END) AS total_repaso,
    SUM(CASE WHEN estado = 'devolucion' THEN total ELSE 0 END) AS total_devolucion
  FROM pedidos
  GROUP BY planilla_id
) t
WHERE p.id = t.planilla_id
  AND p.cuadrado_en_caja = false
  AND (
    p.total_cargue     IS DISTINCT FROM t.total_cargue
    OR p.total_entregado  IS DISTINCT FROM t.total_entregado
    OR p.total_fiado      IS DISTINCT FROM t.total_fiado
    OR p.total_repaso     IS DISTINCT FROM t.total_repaso
    OR p.total_devolucion IS DISTINCT FROM t.total_devolucion
  )
RETURNING p.id, p.entregador, p.tipo_ruta, p.fecha, p.total_cargue;
