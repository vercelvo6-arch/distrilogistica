-- =====================================================
-- CONFIRMAR EMAIL DE USUARIO EXISTENTE
-- =====================================================

-- Si ya registraste un usuario pero no puedes iniciar sesión porque
-- el email no está confirmado, usa este script.

-- INSTRUCCIONES:
-- 1. Cambia 'tu-email@ejemplo.com' por el email que registraste
-- 2. Ejecuta este script desde v0
-- 3. Podrás iniciar sesión inmediatamente

DO $$
DECLARE
  email_to_confirm TEXT := 'tu-email@ejemplo.com'; -- <-- CAMBIA ESTE EMAIL
BEGIN
  -- Confirmar el email en auth.users
  UPDATE auth.users
  SET 
    email_confirmed_at = NOW(),
    updated_at = NOW()
  WHERE email = email_to_confirm
  AND email_confirmed_at IS NULL;

  -- Activar el usuario en la tabla usuarios si existe
  UPDATE public.usuarios
  SET 
    estado = 'activo',
    updated_at = NOW()
  WHERE email = email_to_confirm;

  RAISE NOTICE 'Email confirmado para: %', email_to_confirm;
END $$;
