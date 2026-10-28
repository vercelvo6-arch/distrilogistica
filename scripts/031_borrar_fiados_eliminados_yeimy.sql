-- Borra por completo lo que quedaba de los fiados ELIMINADOS de Yeimy Patarroyo, por pedido
-- del dueño: "solo quiero que conserves el fiado vivo, lo demás elimínalo".
-- Una sola sentencia: todo o nada, y si se corre dos veces la segunda no hace nada.
-- Copia completa de lo borrado queda en audit_log (acción 'borrar_fiados_eliminados_yeimy').
--
-- Se borra:
--   · fiado 733  (eliminado en la depuración del 20-may-2026, debía $341.612)
--   · fiado 2087 (eliminado el 22-sep-2026, debía $235.703)
--   · abono 507: Nequi $150.000 (M04834284) del fiado 2087, ya cuadrado con Mateo (cuadre 528).
--     El total del cuadre 528 no cambia (está guardado en el cuadre); solo desaparece el detalle.
--   · pagos administrativos 22 (M04834284, $150.000, confirmado), 23 (M15051290, $235.703) y
--     102 (M15051290-2, $14.297), todos de esos dos fiados.
--
-- NO se toca: fiado 1926 (vivo, debe $299.530) ni fiado 1653 (pagado, no eliminado).

WITH fiados_borrados AS (
  DELETE FROM fiados
  WHERE id IN (733, 2087)
    AND eliminado = true
    AND cliente ILIKE '%PATARROYO%'
  RETURNING *
),
abonos_borrados AS (
  DELETE FROM abonos_fiados
  WHERE id = 507
    AND pedido_id IN ('733', '2087')
  RETURNING *
),
pagos_borrados AS (
  DELETE FROM pagos_anticipados
  WHERE id IN (22, 23, 102)
    AND fiado_id IN ('733', '2087')
    AND cliente ILIKE '%PATARROYO%'
  RETURNING *
),
auditoria AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'borrar_fiados_eliminados_yeimy',
         jsonb_build_object(
           'fiados',  (SELECT COALESCE(jsonb_agg(to_jsonb(f.*)), '[]'::jsonb) FROM fiados_borrados f),
           'abonos',  (SELECT COALESCE(jsonb_agg(to_jsonb(a.*)), '[]'::jsonb) FROM abonos_borrados a),
           'pagos',   (SELECT COALESCE(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb) FROM pagos_borrados p)
         )
  WHERE EXISTS (SELECT 1 FROM fiados_borrados)
     OR EXISTS (SELECT 1 FROM abonos_borrados)
     OR EXISTS (SELECT 1 FROM pagos_borrados)
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM fiados_borrados) AS fiados_borrados,
       (SELECT COUNT(*) FROM abonos_borrados) AS abonos_borrados,
       (SELECT COUNT(*) FROM pagos_borrados)  AS pagos_borrados,
       (SELECT COUNT(*) FROM auditoria)       AS registro_auditoria;
