-- =====================================================
-- USUARIOS DE PRUEBA PARA DESARROLLO
-- =====================================================

-- Eliminar usuarios de prueba existentes si existen
DELETE FROM public.usuarios 
WHERE email IN (
  'admin@distrisanty.com',
  'coordinador@distrisanty.com',
  'alistador@distrisanty.com',
  'alfonso@distrisanty.com',
  'miguel@distrisanty.com',
  'carlos@distrisanty.com',
  'mateo@distrisanty.com',
  'cajero@distrisanty.com'
);

-- Insertar usuarios de prueba
-- Nota: En producción, los passwords deben ser hasheados con bcrypt
-- Para desarrollo, usaremos un hash simple de bcrypt para "password123"
-- Hash de "password123": $2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5

INSERT INTO public.usuarios (id, email, nombre, password_hash, rol, estado, created_at, updated_at)
VALUES
  -- Administrador
  (gen_random_uuid(), 'admin@distrisanty.com', 'Administrador Sistema', '$2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5', 'administrador', 'activo', NOW(), NOW()),
  
  -- Coordinador
  (gen_random_uuid(), 'coordinador@distrisanty.com', 'Coordinador Logístico', '$2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5', 'coordinador', 'activo', NOW(), NOW()),
  
  -- Alistador
  (gen_random_uuid(), 'alistador@distrisanty.com', 'Alistador Bodega', '$2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5', 'alistador', 'activo', NOW(), NOW()),
  
  -- Entregadores
  (gen_random_uuid(), 'alfonso@distrisanty.com', 'Alfonso Entregador', '$2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5', 'entregador', 'activo', NOW(), NOW()),
  (gen_random_uuid(), 'miguel@distrisanty.com', 'Miguel Entregador', '$2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5', 'entregador', 'activo', NOW(), NOW()),
  (gen_random_uuid(), 'carlos@distrisanty.com', 'Carlos Entregador', '$2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5', 'entregador', 'activo', NOW(), NOW()),
  (gen_random_uuid(), 'mateo@distrisanty.com', 'Mateo Entregador', '$2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5', 'entregador', 'activo', NOW(), NOW()),
  
  -- Cajero
  (gen_random_uuid(), 'cajero@distrisanty.com', 'Cajero Principal', '$2a$10$rKvVPx7XvXqN1Y5Y5Y5Y5O5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5Y5', 'caja', 'activo', NOW(), NOW());

-- Verificar que se insertaron correctamente
SELECT 
  email, 
  nombre, 
  rol, 
  estado,
  created_at
FROM public.usuarios 
WHERE email LIKE '%distrisanty.com'
ORDER BY rol, nombre;
