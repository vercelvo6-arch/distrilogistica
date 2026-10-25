-- =====================================================================
-- 020 — Archivar pedidos y pedido_productos ANTES de que el cuadre de
--        caja los borre.
--
-- POR QUÉ: hay un trigger en la base de datos de producción (no está
-- guardado en ningún script de este repositorio — se creó directamente
-- en la base de datos en algún momento anterior; se verificó su
-- contenido real el 2026-10-11 con una consulta de solo lectura):
--
--   Trigger:  after_cuadre_eliminar_planillas
--   Dispara:  AFTER INSERT ON cuadres_caja FOR EACH ROW
--   Función:  eliminar_planillas_cuadradas()
--
-- Cuerpo REAL y actual de la función (confirmado contra producción,
-- vía pg_get_functiondef, el 2026-10-11 — solo lectura, nada se
-- modificó):
--
--   BEGIN
--     UPDATE pedidos
--     SET pedido_fiado_id = NULL
--     WHERE pedido_fiado_id IN (
--       SELECT id FROM pedidos WHERE planilla_id = ANY(NEW.planillas_ids)
--     );
--     DELETE FROM pedidos WHERE planilla_id = ANY(NEW.planillas_ids);
--     RETURN NEW;
--   END;
--
-- Apenas caja guarda un cuadre, esa función borra de `pedidos` todos
-- los pedidos de las planillas que se acaban de cuadrar (y por
-- "ON DELETE CASCADE" se van con ellos las filas de `pedido_productos`,
-- es decir el detalle de qué producto y cuánta cantidad llevaba cada
-- pedido). Eso es correcto para el día a día de Distrilogística, pero
-- significa que ese detalle nunca llega a un inventario nuevo que lo
-- quiera leer: hay que capturarlo ANTES del DELETE, dentro de la misma
-- transacción del trigger, para que no se pueda perder ni un pedido
-- (si el archivado fallara, toda la transacción del cuadre se revierte
-- — nunca queda un cuadre guardado sin su detalle archivado).
--
-- QUÉ HACE ESTE SCRIPT:
--   PARTE 1 — crea pedidos_archivo y pedido_productos_archivo, con la
--             misma estructura de columnas que las tablas originales
--             en este momento (usa "LIKE ... INCLUDING ALL", las tablas
--             de archivo se crean con las columnas de hoy; el trigger copia por
--             nombre de columna, así que una columna nueva en pedidos no lo rompe),
--             más dos columnas nuevas: cuándo se archivó y a qué
--             cuadre perteneció. "LIKE" nunca copia llaves foráneas,
--             así que el archivo queda desacoplado de "planillas": si
--             algún día se borra una planilla, el archivo histórico de
--             sus pedidos no se va con ella.
--   PARTE 2 — reemplaza eliminar_planillas_cuadradas() agregando las
--             dos instrucciones de archivado justo antes del DELETE
--             existente. El UPDATE y el DELETE quedan exactamente
--             iguales a como están hoy en producción.
--
-- NADA de este archivo se ha ejecutado contra producción. Debe
-- revisarlo y aplicarlo Marlon (o quien tenga acceso a la base de
-- datos) cuando lo apruebe.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — Tablas de archivo
-- =====================================================================

CREATE TABLE IF NOT EXISTS pedidos_archivo (
  LIKE pedidos INCLUDING ALL
);

ALTER TABLE pedidos_archivo
  ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cuadre_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_pedidos_archivo_planilla
  ON pedidos_archivo(planilla_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_archivo_cuadre
  ON pedidos_archivo(cuadre_id);

CREATE TABLE IF NOT EXISTS pedido_productos_archivo (
  LIKE pedido_productos INCLUDING ALL
);

ALTER TABLE pedido_productos_archivo
  ADD COLUMN IF NOT EXISTS archivado_en TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cuadre_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_pedido_productos_archivo_pedido
  ON pedido_productos_archivo(pedido_id);
CREATE INDEX IF NOT EXISTS idx_pedido_productos_archivo_cuadre
  ON pedido_productos_archivo(cuadre_id);


-- =====================================================================
-- PARTE 2 — Reemplazo de la función (UPDATE y DELETE originales
-- intactos; solo se agrega el archivado entre los dos, antes de borrar)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.eliminar_planillas_cuadradas()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  -- ── Idéntico al original ──
  UPDATE pedidos
  SET pedido_fiado_id = NULL
  WHERE pedido_fiado_id IN (
    SELECT id FROM pedidos WHERE planilla_id = ANY(NEW.planillas_ids)
  );

  -- ── Nuevo: archivar antes de borrar ──
  -- Se copia por NOMBRE de columna (jsonb_populate_record), no por posición: si algún día se
  -- agrega una columna a pedidos, el archivo sigue funcionando y el cuadre nunca se cae.
  INSERT INTO pedidos_archivo
  SELECT (jsonb_populate_record(
    NULL::pedidos_archivo,
    to_jsonb(p) || jsonb_build_object('archivado_en', NOW(), 'cuadre_id', NEW.id)
  )).*
  FROM pedidos p
  WHERE p.planilla_id = ANY(NEW.planillas_ids);

  INSERT INTO pedido_productos_archivo
  SELECT (jsonb_populate_record(
    NULL::pedido_productos_archivo,
    to_jsonb(pp) || jsonb_build_object('archivado_en', NOW(), 'cuadre_id', NEW.id)
  )).*
  FROM pedido_productos pp
  JOIN pedidos p ON p.id = pp.pedido_id
  WHERE p.planilla_id = ANY(NEW.planillas_ids);

  -- ── Idéntico al original ──
  DELETE FROM pedidos WHERE planilla_id = ANY(NEW.planillas_ids);

  RETURN NEW;
END;
$function$;


-- =====================================================================
-- PARA DESHACER (solo si algo saliera mal): devuelve la función a como
-- estaba antes de este script. Las tablas de archivo pueden quedarse.
-- =====================================================================
--
-- CREATE OR REPLACE FUNCTION public.eliminar_planillas_cuadradas()
-- RETURNS trigger
-- LANGUAGE plpgsql
-- AS $function$
-- BEGIN
--   UPDATE pedidos
--   SET pedido_fiado_id = NULL
--   WHERE pedido_fiado_id IN (
--     SELECT id FROM pedidos WHERE planilla_id = ANY(NEW.planillas_ids)
--   );
--   DELETE FROM pedidos WHERE planilla_id = ANY(NEW.planillas_ids);
--   RETURN NEW;
-- END;
-- $function$;
