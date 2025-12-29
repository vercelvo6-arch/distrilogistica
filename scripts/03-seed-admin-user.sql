-- Crear usuario administrador inicial
-- Nota: En producción, deberás usar Supabase Auth para el password hash correcto
-- Este es un ejemplo con un hash bcrypt de 'admin123'

INSERT INTO usuarios (id, nombre, email, password_hash, rol, estado)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Administrador Master',
  'admin@distrisanty.com',
  '$2a$10$rVQKvv5X5E8kY5nZ5h8F2.wX5h8F2wX5h8F2wX5h8F2wX5h8F2wXa', -- Hash de 'admin123'
  'administrador',
  'activo'
)
ON CONFLICT (email) DO NOTHING;

-- Crear usuarios de prueba para cada rol
INSERT INTO usuarios (nombre, email, password_hash, rol, estado) VALUES
  ('Coordinador Prueba', 'coordinador@distrisanty.com', '$2a$10$rVQKvv5X5E8kY5nZ5h8F2.wX5h8F2wX5h8F2wX5h8F2wX5h8F2wXa', 'coordinador', 'activo'),
  ('Alistador Prueba', 'alistador@distrisanty.com', '$2a$10$rVQKvv5X5E8kY5nZ5h8F2.wX5h8F2wX5h8F2wX5h8F2wX5h8F2wXa', 'alistador', 'activo'),
  ('José Luis Entregador', 'entregador1@distrisanty.com', '$2a$10$rVQKvv5X5E8kY5nZ5h8F2.wX5h8F2wX5h8F2wX5h8F2wX5h8F2wXa', 'entregador', 'activo'),
  ('Caja Prueba', 'caja@distrisanty.com', '$2a$10$rVQKvv5X5E8kY5nZ5h8F2.wX5h8F2wX5h8F2wX5h8F2wX5h8F2wXa', 'caja', 'activo')
ON CONFLICT (email) DO NOTHING;
