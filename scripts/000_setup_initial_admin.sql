-- =====================================================
-- SCRIPT INICIAL: CREAR ADMINISTRADOR MAESTRO
-- =====================================================
-- IMPORTANTE: Ejecuta este script PRIMERO para crear tu usuario administrador
-- Email: distrisantysas@gmail.com
-- Password: Distrilogistica2026*
-- =====================================================

-- Paso 1: Insertar en auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at
)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'distrisantysas@gmail.com',
  crypt('Distrilogistica2026*', gen_salt('bf')),
  NOW(),
  NULL,
  '',
  NULL,
  '',
  NULL,
  '',
  '',
  NULL,
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"name":"Administrador Principal"}',
  NULL,
  NOW(),
  NOW(),
  NULL,
  NULL,
  '',
  '',
  NULL,
  '',
  0,
  NULL,
  '',
  NULL,
  false,
  NULL
)
ON CONFLICT (email) DO UPDATE SET
  encrypted_password = crypt('Distrilogistica2026*', gen_salt('bf')),
  email_confirmed_at = NOW(),
  updated_at = NOW()
RETURNING id;

-- Paso 2: Crear identidad para el usuario
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  id,
  jsonb_build_object('sub', id::text, 'email', 'distrisantysas@gmail.com'),
  'email',
  NOW(),
  NOW(),
  NOW()
FROM auth.users
WHERE email = 'distrisantysas@gmail.com'
ON CONFLICT (provider, id) DO NOTHING;

-- Paso 3: Insertar en tabla usuarios (nuestra tabla custom)
INSERT INTO public.usuarios (
  id,
  nombre,
  email,
  password_hash,
  rol,
  estado,
  created_at,
  updated_at
)
SELECT
  id,
  'Administrador Principal',
  'distrisantysas@gmail.com',
  '',
  'administrador',
  'activo',
  NOW(),
  NOW()
FROM auth.users
WHERE email = 'distrisantysas@gmail.com'
ON CONFLICT (email) DO UPDATE SET
  rol = 'administrador',
  estado = 'activo',
  updated_at = NOW();

-- Confirmar éxito
SELECT 
  'Usuario administrador creado exitosamente' as mensaje,
  email,
  rol,
  estado
FROM public.usuarios
WHERE email = 'distrisantysas@gmail.com';
