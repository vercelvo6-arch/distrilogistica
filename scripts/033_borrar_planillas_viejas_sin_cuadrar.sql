-- Borra las planillas que quedaron sin cuadrar hasta el 30-sep-2026, por pedido del dueño ("elimina las
-- planillas no cuadradas hasta septiembre 2026") y para que cada pantalla cargue menos (todas las vistas
-- traen las planillas sin cuadrar con sus productos, y eso gastaba la capacidad de Neon).
--
-- Regla del dueño: "si hay fiados de esas planillas no los elimines". Por eso NO se toca ninguna planilla
-- que tenga un pedido en fiado o pagado, un abono, o un fiado (vivo o ya pagado) que salió de uno de sus
-- pedidos. Al 9-nov-2026: 76 planillas sin cuadrar hasta septiembre; se borran 51 y quedan 25 (entre ellas
-- la de Jerson Sandoval del 5-jun con 3 fiados vivos por $374.965). La tabla fiados no se toca nunca.
--
-- Se borra, de cada planilla elegida: la planilla, sus pedidos y, en cadena (ON DELETE CASCADE), los productos
-- de esos pedidos, sus novedades (novedades_pedido) y sus faltantes. Antes:
--   · pedidos y productos se copian a pedidos_archivo / pedido_productos_archivo (script 020);
--   · planillas, faltantes y novedades quedan en audit_log (acción 'borrar_planillas_viejas_sin_cuadrar').
--
-- Una sola sentencia: todo o nada. Si se corre dos veces, la segunda no encuentra planillas y no hace nada.

WITH objetivo AS (
  SELECT pl.*
  FROM planillas pl
  WHERE pl.cuadrado_en_caja = false
    AND pl.fecha <= DATE '2026-09-30'
    AND NOT EXISTS (SELECT 1 FROM cuadres_caja c WHERE c.planillas_ids && ARRAY[pl.id]::text[])
    AND NOT EXISTS (
      SELECT 1 FROM pedidos p
      WHERE (p.planilla_id = pl.id OR p.planilla_mercancia_id = pl.id)
        AND (
          p.estado IN ('fiado', 'pagado')
          OR EXISTS (SELECT 1 FROM abonos_fiados a WHERE a.pedido_id = p.id)
          OR EXISTS (SELECT 1 FROM fiados f WHERE f.pedido_id = p.id)
        )
    )
    -- Ningún pedido de OTRA planilla guarda su mercancía aquí.
    AND NOT EXISTS (SELECT 1 FROM pedidos p WHERE p.planilla_mercancia_id = pl.id AND p.planilla_id <> pl.id)
),
pedidos_obj AS (
  SELECT p.* FROM pedidos p WHERE p.planilla_id IN (SELECT id FROM objetivo)
),
archivo_pedidos AS (
  INSERT INTO pedidos_archivo
  SELECT p.*, NOW(), NULL FROM pedidos_obj p
  ON CONFLICT DO NOTHING
  RETURNING 1
),
archivo_productos AS (
  INSERT INTO pedido_productos_archivo
  SELECT pp.*, NOW(), NULL FROM pedido_productos pp WHERE pp.pedido_id IN (SELECT id FROM pedidos_obj)
  ON CONFLICT DO NOTHING
  RETURNING 1
),
auditoria AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'borrar_planillas_viejas_sin_cuadrar',
         jsonb_build_object(
           'planillas',  (SELECT jsonb_agg(to_jsonb(o.*)) FROM objetivo o),
           'pedidos_ids', (SELECT COALESCE(jsonb_agg(p.id), '[]'::jsonb) FROM pedidos_obj p),
           'faltantes',  (SELECT COALESCE(jsonb_agg(to_jsonb(f.*)), '[]'::jsonb)
                          FROM faltantes f WHERE f.planilla_id IN (SELECT id FROM objetivo)),
           'novedades',  (SELECT COALESCE(jsonb_agg(to_jsonb(n.*)), '[]'::jsonb)
                          FROM novedades_pedido n WHERE n.pedido_id IN (SELECT id FROM pedidos_obj))
         )
  WHERE EXISTS (SELECT 1 FROM objetivo)
  RETURNING 1
),
pedidos_borrados AS (
  DELETE FROM pedidos p WHERE p.id IN (SELECT id FROM pedidos_obj)
  RETURNING 1
),
planillas_borradas AS (
  DELETE FROM planillas pl WHERE pl.id IN (SELECT id FROM objetivo)
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM planillas_borradas) AS planillas_borradas,
       (SELECT COUNT(*) FROM pedidos_borrados)   AS pedidos_borrados,
       (SELECT COUNT(*) FROM archivo_pedidos)    AS pedidos_archivados,
       (SELECT COUNT(*) FROM archivo_productos)  AS productos_archivados,
       (SELECT COUNT(*) FROM auditoria)          AS registro_auditoria;
