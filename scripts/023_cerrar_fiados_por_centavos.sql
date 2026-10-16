-- Fiados que quedaron "vivos" (abono_parcial) solo por centavos: el cobro entra en
-- pesos enteros y la factura tiene decimales (ej. factura 81.440,09 y pago 81.440 -> saldo 0,09).
-- Eran 27 fiados con saldo menor a $1 (Yomaira Arias, Elmer Duarte, Rosalba Sinucos,
-- Mayerli Blanco, Maria del Carmen Forero, Panaderia Vida Pan, etc.).
-- Los cierra: saldo en 0 y estado pagado_completo. Solo toca saldos entre 0 y 1 peso.

UPDATE fiados SET
  saldo_pendiente     = 0,
  estado              = 'pagado_completo',
  fecha_pago_completo = COALESCE(fecha_pago_completo, NOW()),
  updated_at          = NOW()
WHERE COALESCE(eliminado, false) = false
  AND estado IN ('pendiente', 'abono_parcial')
  AND saldo_pendiente > 0
  AND saldo_pendiente < 1
  AND monto_pagado > 0;
