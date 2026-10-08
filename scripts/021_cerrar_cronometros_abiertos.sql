-- Cierra los cronómetros que quedaron "abiertos" en planillas que ya fueron
-- alistadas (agosto y septiembre de 2026). Se usa la hora real en que se
-- alistó cada planilla (alistado_en), así el tiempo registrado es el verdadero:
-- 37 min (2026-08-05), 54 min (2026-08-18) y 1 min (2026-09-05).
-- Solo toca planillas con cronómetro abierto cuya fecha de alistamiento es posterior al inicio.

UPDATE planillas
SET timer_fin   = alistado_en,
    timer_pausa = NULL
WHERE timer_inicio IS NOT NULL
  AND timer_fin IS NULL
  AND estado IN ('alistado', 'en_ruta', 'completado')
  AND alistado_en IS NOT NULL
  AND alistado_en >= timer_inicio;
