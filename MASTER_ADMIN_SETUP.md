# Configuración del Administrador Maestro

## Credenciales del Administrador

- **Email:** `distrisantysas@gmail.com`
- **Contraseña:** `Distrilogistica2026*`
- **Rol:** Administrador (acceso completo)

## Cómo Crear el Usuario

### Opción 1: Script Node.js (Recomendado)

Este script hashea la contraseña automáticamente con bcrypt:

1. Asegúrate de que Neon esté conectado
2. Ejecuta el script:
   \`\`\`bash
   node scripts/create-master-admin.ts
   \`\`\`

### Opción 2: SQL Manual

Si prefieres SQL directo, necesitarás hashear la contraseña primero:

\`\`\`sql
-- Ejecuta esto en tu consola de Neon
DELETE FROM usuarios WHERE email = 'distrisantysas@gmail.com';

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
  '[HASH_GENERADO_POR_BCRYPT]', -- Usa el script Node.js para generar esto
  'administrador',
  'activo',
  NOW()
);
\`\`\`

## Permisos del Administrador

Como **administrador**, tendrás acceso completo a:

- ✅ Panel de Informes y Dashboards
- ✅ Gestión de Usuarios (crear, editar, eliminar)
- ✅ Gestión de Planillas y Rutas
- ✅ Configuración de Comisiones
- ✅ Visualización de Todas las Métricas
- ✅ Reportes de Caja y Reconciliación
- ✅ Todas las Tarjetas y Estadísticas

## Iniciar Sesión

1. Ve a `/auth/login`
2. Ingresa: `distrisantysas@gmail.com`
3. Contraseña: `Distrilogistica2026*`
4. Haz clic en "Iniciar Sesión"

## Seguridad

- La contraseña se almacena hasheada con bcrypt (salt rounds: 10)
- Las sesiones duran 7 días
- El middleware protege todas las rutas automáticamente
