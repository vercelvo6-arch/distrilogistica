-- Campos que faltaban para que un cobro CxC guarde la misma información
-- estructurada que una consignación (medio de pago real, número de factura).

ALTER TABLE abonos_fiados
  ADD COLUMN IF NOT EXISTS medio_pago_detalle VARCHAR,
  ADD COLUMN IF NOT EXISTS numero_factura VARCHAR;
