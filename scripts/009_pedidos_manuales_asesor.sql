-- Permite registrar pedidos de asesor históricos que nunca tuvieron planilla
-- (facturados antes de este módulo, o nunca cargados). Solo se llenan en
-- pedidos manuales — un pedido con planilla sigue leyendo el asesor de ahí.

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS asesor_manual VARCHAR,
  ADD COLUMN IF NOT EXISTS ruta_manual VARCHAR,
  ADD COLUMN IF NOT EXISTS fecha_manual DATE;
