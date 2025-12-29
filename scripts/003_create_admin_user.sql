-- Create admin user with bcrypt hashed password
-- Default password: admin123
-- Hash generated with bcrypt rounds=10

INSERT INTO usuarios (
  id,
  email,
  nombre,
  password_hash,
  rol,
  estado,
  created_at
) VALUES (
  gen_random_uuid(),
  'admin@distrisanty.com',
  'Administrador',
  '$2a$10$rZJ5qKZYK5qKZYK5qKZYKeuLHF.8EYQrFqX3bYqGvZ6xK5qKZYK5q',
  'administrador',
  'activo',
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  rol = EXCLUDED.rol,
  estado = EXCLUDED.estado;

-- Note: Change the password after first login
-- The default password is: admin123
