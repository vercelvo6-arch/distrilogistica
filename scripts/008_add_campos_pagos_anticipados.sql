-- Fecha real del pago (distinta de registrado_en, que es cuándo se digitó)
-- y número de factura, igual al nivel de detalle que ya tienen las consignaciones.

ALTER TABLE pagos_anticipados
  ADD COLUMN IF NOT EXISTS fecha_pago DATE,
  ADD COLUMN IF NOT EXISTS numero_factura VARCHAR;

-- Un pago en Efectivo no tiene número de comprobante que registrar.
ALTER TABLE pagos_anticipados ALTER COLUMN referencia DROP NOT NULL;
