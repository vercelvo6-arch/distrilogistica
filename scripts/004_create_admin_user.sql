-- =====================================================
-- CREAR USUARIO ADMINISTRADOR CON EMAIL CONFIRMADO
-- =====================================================
-- Este script crea un administrador con email confirmado
-- Ejecuta desde v0 haciendo clic en "Configurar"

DO $$
DECLARE
  admin_email TEXT := 'distrisantysas@gmail.com';
  admin_password TEXT := 'Distrilogistica2026*';
  admin_name TEXT := 'Administrador Principal';
  user_id UUID;
  existing_user_id UUID;
BEGIN
  -- Verificar si el usuario ya existe en auth.users
  SELECT id INTO existing_user_id 
  FROM auth.users 
  WHERE email = admin_email;

  IF existing_user_id IS NOT NULL THEN
    -- Si existe, actualizar email_confirmed_at y contraseña
    UPDATE auth.users 
    SET 
      encrypted_password = crypt(admin_password, gen_salt('bf')),
      email_confirmed_at = NOW(),
      updated_at = NOW()
    WHERE id = existing_user_id;
    
    user_id := existing_user_id;
    RAISE NOTICE 'Usuario existente actualizado y confirmado: %', admin_email;
  ELSE
    -- Si no existe, crear nuevo usuario
    user_id := gen_random_uuid();
    
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      user_id,
      'authenticated',
      'authenticated',
      admin_email,
      crypt(admin_password, gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('name', admin_name),
      NOW(),
      NOW(),
      '',
      '',
      '',
      ''
    );
    
    -- Crear identidad
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      user_id,
      jsonb_build_object('sub', user_id::text, 'email', admin_email),
      'email',
      NOW(),
      NOW(),
      NOW()
    );
    
    RAISE NOTICE 'Usuario nuevo creado: %', admin_email;
  END IF;

  -- Crear o actualizar en tabla usuarios (usar email como condición)
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE email = admin_email) THEN
    UPDATE public.usuarios
    SET 
      id = user_id,
      nombre = admin_name,
      rol = 'administrador',
      estado = 'activo',
      updated_at = NOW()
    WHERE email = admin_email;
    RAISE NOTICE 'Registro en usuarios actualizado';
  ELSE
    INSERT INTO public.usuarios (
      id,
      email,
      nombre,
      rol,
      estado
    ) VALUES (
      user_id,
      admin_email,
      admin_name,
      'administrador',
      'activo'
    );
    RAISE NOTICE 'Registro en usuarios creado';
  END IF;

  RAISE NOTICE '✓ Proceso completado. Ahora puedes iniciar sesión con: %', admin_email;
END $$;
