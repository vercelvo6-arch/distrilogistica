-- =====================================================
-- CONFIGURACIÓN INICIAL DE COMISIONES
-- =====================================================
-- Este script crea la configuración de comisiones para cada entregador
-- Porcentaje por defecto: 5%

INSERT INTO public.comisiones_config (
  id,
  entregador,
  porcentaje_comision,
  activo,
  created_at,
  updated_at
)
VALUES
  (gen_random_uuid(), 'Alfonso', 5.0, true, NOW(), NOW()),
  (gen_random_uuid(), 'Miguel', 5.0, true, NOW(), NOW()),
  (gen_random_uuid(), 'Carlos', 5.0, true, NOW(), NOW()),
  (gen_random_uuid(), 'Mateo', 5.0, true, NOW(), NOW())
ON CONFLICT (entregador) DO UPDATE SET
  activo = true,
  updated_at = NOW();

-- Confirmar éxito
SELECT 
  'Configuración de comisiones creada exitosamente' as mensaje,
  entregador,
  porcentaje_comision,
  activo
FROM public.comisiones_config
ORDER BY entregador;
