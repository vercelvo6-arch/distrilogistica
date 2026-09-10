-- Permite registrar una consignacion del entregador SIN ligarla a un pedido
-- especifico -- caso de rutas viajeras (ej. Alfonso) donde el entregador
-- consigna su recaudo de varios dias en varias transacciones, antes de
-- llegar a la empresa a cuadrar caja. Reutiliza consignaciones_pedido en vez
-- de crear una tabla paralela: ya tiene el antifraude (buscarReferenciasUsadas),
-- el precargado en el modal de cuadre agrupado (consignaciones-entregador) y el
-- vinculado al cuadre (cuadres-caja/route.ts) correctamente resueltos.

ALTER TABLE consignaciones_pedido ALTER COLUMN pedido_id DROP NOT NULL;

ALTER TABLE consignaciones_pedido
  ADD COLUMN IF NOT EXISTS origen VARCHAR DEFAULT 'ruta',
  ADD COLUMN IF NOT EXISTS registrado_por VARCHAR;

UPDATE consignaciones_pedido SET origen = 'ruta' WHERE origen IS NULL;
