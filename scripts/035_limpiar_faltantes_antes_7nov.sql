-- 035 · Limpia la tabla faltantes: deja solo lo marcado desde el 7-nov-2026 (hora Colombia).
--
-- Decisión de gerencia (10-nov-2026): los faltantes anteriores al 7-nov tienen cantidades infladas
-- (casilla vieja del alistador) y duplicados (Subsanar creaba uno nuevo por todo el pedido y
-- "Reportar error" creaba otro encima). Solo se conservan los del 7-nov en adelante.
--
-- Qué NO cambia:
--   · inventario_salidas (lo que salió de bodega ya quedó guardado aparte).
--   · pedidos, planillas, cuadres, fiados.
--
-- Se ejecuta en Neon → SQL Editor, POR PASOS, en este orden. El paso 3 es permanente: la única
-- forma de deshacerlo es el respaldo del paso 2 (tabla faltantes_respaldo_035).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PASO 1 · REVISAR (solo lectura). Mira cuánto se va a borrar antes de hacerlo.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

SELECT CASE WHEN (fecha_marcado AT TIME ZONE 'America/Bogota')::date < DATE '2026-11-07'
            THEN 'SE BORRA (antes del 7-nov)' ELSE 'SE QUEDA (7-nov en adelante)' END AS que_pasa,
       estado,
       COUNT(*) AS faltantes,
       SUM(cantidad_faltante) AS unidades
FROM faltantes
GROUP BY 1, 2
ORDER BY 1, 2;

-- Planillas SIN CUADRAR con faltantes de antes del 7-nov. Si sale alguna, avisa antes de seguir:
-- en Supervisión su producto quedaría "Incompleto" sin faltante detrás.
SELECT pl.id, pl.entregador, pl.tipo_ruta, pl.fecha, COUNT(*) AS faltantes
FROM faltantes f
JOIN planillas pl ON pl.id = f.planilla_id
WHERE (f.fecha_marcado AT TIME ZONE 'America/Bogota')::date < DATE '2026-11-07'
  AND COALESCE(pl.cuadrado_en_caja, false) = false
GROUP BY 1, 2, 3, 4
ORDER BY pl.fecha;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PASO 2 · RESPALDAR (no borra nada). Copia todo lo que se va a borrar en otra tabla.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS faltantes_respaldo_035 AS
SELECT f.*, NOW() AS respaldado_en
FROM faltantes f
WHERE (f.fecha_marcado AT TIME ZONE 'America/Bogota')::date < DATE '2026-11-07';

-- Debe dar el mismo número de "SE BORRA" del paso 1.
SELECT COUNT(*) AS respaldados FROM faltantes_respaldo_035;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PASO 3 · BORRAR (permanente). Solo borra lo que quedó respaldado en el paso 2.
-- Una sola sentencia: todo o nada. Deja constancia en audit_log.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

WITH borrados AS (
  DELETE FROM faltantes f
  USING faltantes_respaldo_035 r
  WHERE f.id = r.id
  RETURNING f.id, f.estado, f.cantidad_faltante
),
log AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'limpiar_faltantes_antes_7nov',
         jsonb_build_object(
           'borrados', (SELECT COUNT(*) FROM borrados),
           'unidades', (SELECT COALESCE(SUM(cantidad_faltante), 0) FROM borrados),
           'respaldo', 'faltantes_respaldo_035'
         )
  WHERE EXISTS (SELECT 1 FROM borrados)
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM borrados) AS faltantes_borrados,
       (SELECT COUNT(*) FROM log) AS registro_en_audit_log;

-- Comprobación: ya no debe quedar ninguno antes del 7-nov.
SELECT COUNT(*) AS quedan_antes_del_7nov
FROM faltantes
WHERE (fecha_marcado AT TIME ZONE 'America/Bogota')::date < DATE '2026-11-07';

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- DESHACER (solo si hace falta): todo lo borrado está en faltantes_respaldo_035, con las mismas
-- columnas de faltantes más "respaldado_en". Para devolverlo se copian esas filas a faltantes sin
-- esa última columna. No borres la tabla de respaldo hasta que gerencia confirme que todo está bien.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
