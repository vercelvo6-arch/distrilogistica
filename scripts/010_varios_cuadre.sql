-- "Varios": gastos del entregador (combustible, etc.) que se restan del esperado,
-- mismo patrón que descuento/motivo_descuento.
ALTER TABLE cuadres_caja
  ADD COLUMN IF NOT EXISTS varios NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_varios TEXT;

-- Consignaciones capturadas por el entregador al momento de la entrega,
-- que luego se precargan en el modal de cuadre agrupado de caja
-- (mismo rol que abonos_fiados para los cobros CxC).
CREATE TABLE IF NOT EXISTS consignaciones_pedido (
  id SERIAL PRIMARY KEY,
  pedido_id TEXT NOT NULL,
  planilla_id TEXT,
  entregador VARCHAR NOT NULL,
  cliente VARCHAR,
  banco VARCHAR NOT NULL,
  numero VARCHAR NOT NULL,
  monto NUMERIC NOT NULL,
  fecha DATE NOT NULL,
  registrado_en TIMESTAMPTZ DEFAULT NOW(),
  cuadre_caja_id INTEGER
);
