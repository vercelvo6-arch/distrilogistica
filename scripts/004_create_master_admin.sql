-- Create Master Admin User
-- Email: distrisantysas@gmail.com
-- Password: Distrilogistica2026* (will be hashed by bcrypt)

-- Check if user exists and delete if needed
DELETE FROM usuarios WHERE email = 'distrisantysas@gmail.com';

-- Insert master admin user
-- Note: Run the scripts/create-master-admin.ts script to insert with hashed password
-- Or use this SQL with a pre-hashed password

-- Example with placeholder (use the Node.js script for proper hash):
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
  'distrisantysas@gmail.com',
  'Administrador Maestro',
  '', -- Will be set by the Node.js script
  'administrador',
  'activo',
  NOW()
);
