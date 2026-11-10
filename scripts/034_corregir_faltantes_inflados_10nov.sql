-- 034 · Corrige los faltantes PENDIENTES del 10-nov-2026 que quedaron inflados por la casilla vieja
--        del alistador ("¿cuántas hay disponibles?" prellenada: si quedaba en 0, marcaba TODO como faltante).
--
-- Deja cada faltante en lo que el alistador escribió en su comentario:
--   · Alfonso 6C · ADVIL MAX blíster (1009): sistema 3, alistador "1 blíster" → quedan 1
--   · Alfonso 6C · BUBBALOO (1556): sistema 2, alistador "1 displey" → quedan 1
--   · Alfonso 6C · BUSCAPINA FEM blíster (1036): sistema 4, alistador "2 blíster" → quedan 2
--   · Alfonso 6C · GASTROFAST (3315): sistema 11, alistador "3 sobres" → quedan 3
--   · Alfonso 6C · H&S 2 EN 1 ristra (1373): sistema 2, alistador "1 ristra" → quedan 1
--   · Alfonso 6C · H&S LIMPIEZA ristra (1375): sistema 3, alistador "1 ristra" → quedan 1
--   · Alfonso 6C · A80 promo 12 Colgate: sistema 4, alistador "1 displey x12" → quedan 1
--   · Alfonso 6C · Z27 promo 6 Salsa de soya: sistema 7, alistador "2 unidades" → quedan 2
--   · Alfonso 92-2B · SEDA DENTAL ristra (3137): sistema 2, alistador "1 ristra" → quedan 1
--   · Mateo · IBUPROFENO GEL MK (1096): sistema 3, alistador "1 blíster" → quedan 1
--   · Mateo · NORAVER GRIPA blíster (1139): sistema 2, alistador "1 blíster" → quedan 1
--   · Mateo · RON VIEJO DE CALDAS (1670): sistema 2, alistador "1 unidad" → quedan 1
--   · Miguel · JABÓN FRAGANCIA FLORAL (2050): sistema 12, alistador "8 unidades" → quedan 8
--   · Carlos · SCHICK 3 HOJAS ristra (1440): sistema 3, alistador "2 displey" → quedan 2
--
-- Qué cambia (solo filas que siguen exactamente como se registraron):
--   · faltantes: cantidad_faltante / cantidad_disponible. Si en una planilla ya no falta nada, queda
--     'resuelto' con la nota "Corrección 034: no faltaba (error de la casilla del alistador)".
--   · pedido_productos: cantidad_faltante / cantidad_disponible / estado_alistamiento de cada línea.
--   · inventario_salidas: cantidad_faltante / cantidad_salida / estado_alistamiento.
--   El faltante se deja en las últimas planillas de la tarjeta (misma regla del reparto).
--   Copia de todo lo anterior en audit_log (acción 'corregir_faltantes_inflados_10nov').
--
-- Una sola sentencia: todo o nada. Si se corre dos veces, la segunda no encuentra nada que cambiar.

WITH f_cambio(id, falt_ant, falt_nuevo, solicitada) AS (VALUES
    ('9224d9a7-5838-41dd-8189-760812b277fd', 2, 1, 2),
    ('64f53007-d13e-48d3-bf6b-790deae12ca9', 1, 0, 1),
    ('a32a5f7d-2e7d-4939-bbc7-a70d0d9e086c', 2, 1, 2),
    ('d4bbac4d-3424-4a8c-b629-2ea367c8b282', 4, 2, 4),
    ('e6e8f085-c3cc-4146-be12-c4a0d6b73a49', 5, 3, 5),
    ('9480d2a7-078f-4f97-a853-3ce4d8ba9f74', 6, 0, 6),
    ('c1e0d1c7-d73b-481a-b06f-ee4be3505ea9', 1, 1, 1),
    ('cf2cd7d6-2b16-4a7e-84ea-e1d97829eefb', 1, 0, 1),
    ('6f982900-9592-43d0-8573-09f650ad6701', 1, 1, 1),
    ('28e34be7-32fe-4f73-8caa-bf351bed59bd', 2, 0, 2),
    ('2233de54-5e50-4aba-8937-5520f0265492', 2, 1, 2),
    ('9e1acdee-a029-4cc8-8256-db3b1557a4ae', 2, 0, 2),
    ('ca9e1566-92b7-4fb7-9950-afe266a4bf75', 6, 2, 6),
    ('9c7577de-47b5-4545-9f24-9911d43841f5', 1, 0, 1),
    ('0ffe1216-c61e-4875-b75e-445a88d70161', 2, 1, 2),
    ('a0b73ff2-a83c-40e6-8c95-e2acc78df427', 1, 1, 1),
    ('0632ec8d-23b0-4a71-934a-5a5fbf6b765a', 2, 0, 2),
    ('bcb15446-596c-416e-9747-5a58099b0955', 1, 1, 1),
    ('9c38b2eb-7b8e-4e06-851c-9f784150daf8', 1, 0, 1),
    ('5b631bb4-f78f-4860-aa00-89f7f28a57f4', 2, 1, 2),
    ('f8484be1-7bea-498d-bdf8-9cb33f815e98', 12, 8, 12),
    ('40952cf1-238d-46c5-bfc3-490890a9ab36', 3, 2, 3)
),
l_cambio(id, falt_ant, falt_nuevo, cantidad) AS (VALUES
    ('1a462507-919f-4391-a5d3-bc48366ef882', 2, 1, 2),
    ('6c642f76-5ec3-4f18-a99d-40843856935e', 1, 0, 1),
    ('b09070a3-44fb-41d5-982b-6ebb726c40ef', 2, 1, 2),
    ('04bf5aba-bb03-46e4-9107-ded360d8c7d3', 4, 2, 4),
    ('3924452b-c6d9-4923-9234-cfdbe1989b26', 5, 3, 5),
    ('928e5f7b-1c75-43be-8b4b-00b92829bae3', 6, 0, 6),
    ('27985c4c-e9e5-480c-aed0-33ac81e49c56', 1, 1, 1),
    ('676afffe-a45d-476e-91e0-7cfa32bb7251', 1, 0, 1),
    ('6b1829ea-5e39-462a-9201-a774f88ae5e0', 1, 1, 1),
    ('86d96630-15cf-4b69-ba5a-0e4b57733d3a', 2, 0, 2),
    ('b2e9acee-85ba-4037-a29d-6e6f99ba6c78', 2, 1, 2),
    ('ee9fa429-b732-483c-8147-19bf6cfd1949', 1, 0, 1),
    ('812f2f6e-a8ab-44e0-b776-87591b866188', 1, 0, 1),
    ('b95d7206-d932-4b5b-bdf8-f035fc3b863f', 6, 2, 6),
    ('d6e8ed7e-2ae3-439c-9906-8c2ce829daf2', 1, 0, 1),
    ('7c9f560c-5b7d-433d-b7bb-47f1cbe23a50', 1, 1, 1),
    ('798e1099-6c8e-4ff0-98f0-c78eabad8419', 1, 0, 1),
    ('0f953afd-449e-46e1-8c9c-8451a3e0fa71', 1, 1, 1),
    ('2673bd30-6c29-49d9-a144-1290728dbcaf', 1, 0, 1),
    ('240a9fcc-42dc-4e7a-8c2e-b62a7271e363', 1, 0, 1),
    ('6da48d4e-07f1-4806-9906-38210b41f12c', 1, 1, 1),
    ('afb88132-ba61-4113-9d28-b297c85e650a', 1, 0, 1),
    ('d98da1f1-b796-4728-b826-ab421acae34f', 2, 1, 2),
    ('8948e9e7-64b3-447b-a02e-8744fe008a32', 12, 8, 12),
    ('aba09524-aca6-42a2-8723-0c298772da34', 3, 2, 3)
),
s_cambio(id, falt_ant, falt_nuevo, pedida) AS (VALUES
    (5637, 2.0, 1, 2.0),
    (5740, 1.0, 0, 1.0),
    (5648, 2.0, 1, 2.0),
    (5638, 4.0, 2, 4.0),
    (5659, 5.0, 3, 5.0),
    (5710, 6.0, 0, 6.0),
    (5641, 1.0, 1, 1.0),
    (5752, 1.0, 0, 1.0),
    (5687, 1.0, 1, 1.0),
    (5753, 2.0, 0, 2.0),
    (5717, 2.0, 1, 2.0),
    (5797, 2.0, 0, 2.0),
    (5678, 6.0, 2, 6.0),
    (5811, 1.0, 0, 1.0),
    (5619, 2.0, 1, 2.0),
    (5936, 1.0, 1, 1.0),
    (5994, 2.0, 0, 2.0),
    (5918, 1.0, 1, 1.0),
    (6000, 1.0, 0, 1.0),
    (5961, 2.0, 1, 2.0),
    (5888, 12.0, 8, 12.0),
    (6061, 3.0, 2, 3.0)
),
f_ok AS (
  SELECT f.*, c.falt_nuevo FROM faltantes f JOIN f_cambio c ON c.id::text = f.id::text
  WHERE f.estado = 'pendiente' AND f.cantidad_faltante = c.falt_ant AND f.cantidad_solicitada = c.solicitada
),
l_ok AS (
  SELECT pp.*, c.falt_nuevo FROM pedido_productos pp JOIN l_cambio c ON c.id::text = pp.id::text
  WHERE pp.cantidad_faltante = c.falt_ant AND pp.cantidad = c.cantidad
),
s_ok AS (
  SELECT s.*, c.falt_nuevo FROM inventario_salidas s JOIN s_cambio c ON c.id = s.id
  WHERE s.cantidad_faltante = c.falt_ant AND s.cantidad_pedida = c.pedida
),
log AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'corregir_faltantes_inflados_10nov',
         jsonb_build_object(
           'faltantes',          (SELECT jsonb_agg(to_jsonb(x.*)) FROM f_ok x),
           'pedido_productos',   (SELECT COALESCE(jsonb_agg(to_jsonb(x.*)), '[]'::jsonb) FROM l_ok x),
           'inventario_salidas', (SELECT COALESCE(jsonb_agg(to_jsonb(x.*)), '[]'::jsonb) FROM s_ok x)
         )
  WHERE EXISTS (SELECT 1 FROM f_ok)
  RETURNING 1
),
uf AS (
  UPDATE faltantes f SET
    cantidad_faltante   = o.falt_nuevo,
    cantidad_disponible = f.cantidad_solicitada - o.falt_nuevo,
    estado              = CASE WHEN o.falt_nuevo = 0 THEN 'resuelto' ELSE f.estado END,
    tipo_resolucion     = CASE WHEN o.falt_nuevo = 0 THEN 'completo' ELSE f.tipo_resolucion END,
    cantidad_resuelta   = CASE WHEN o.falt_nuevo = 0 THEN 0 ELSE f.cantidad_resuelta END,
    fecha_resolucion    = CASE WHEN o.falt_nuevo = 0 THEN NOW() ELSE f.fecha_resolucion END,
    observaciones_resolucion = CASE WHEN o.falt_nuevo = 0
      THEN 'Corrección 034: no faltaba (error de la casilla del alistador)' ELSE f.observaciones_resolucion END
  FROM f_ok o WHERE f.id = o.id
  RETURNING 1
),
ul AS (
  UPDATE pedido_productos pp SET
    cantidad_faltante   = o.falt_nuevo,
    cantidad_disponible = pp.cantidad - o.falt_nuevo,
    estado_alistamiento = CASE WHEN o.falt_nuevo = 0 THEN 'completo' ELSE pp.estado_alistamiento END
  FROM l_ok o WHERE pp.id = o.id
  RETURNING 1
),
us AS (
  UPDATE inventario_salidas s SET
    cantidad_faltante   = o.falt_nuevo,
    cantidad_salida     = s.cantidad_pedida - o.falt_nuevo,
    estado_alistamiento = CASE WHEN o.falt_nuevo = 0 THEN 'completo' ELSE s.estado_alistamiento END
  FROM s_ok o WHERE s.id = o.id
  RETURNING 1
)
SELECT (SELECT count(*) FROM uf) AS faltantes_corregidos,
       (SELECT count(*) FROM ul) AS lineas_corregidas,
       (SELECT count(*) FROM us) AS salidas_corregidas,
       (SELECT count(*) FROM log) AS registros_en_audit_log;
