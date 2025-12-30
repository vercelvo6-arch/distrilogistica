# Configuración de Neon Database

Este proyecto ahora usa Neon como base de datos PostgreSQL. Sigue estos pasos para configurar tu base de datos:

## 1. Conectar Neon Database

1. Ve a la sección **Connect** en el sidebar izquierdo de v0
2. Selecciona **Neon** de la lista de integraciones
3. Sigue las instrucciones para conectar tu proyecto de Neon
4. Esto agregará automáticamente la variable `DATABASE_URL` a tu proyecto

## 2. Ejecutar Scripts de Migración

Una vez conectado Neon, ejecuta los siguientes scripts en orden desde v0:

### Script 1: Crear tablas principales
\`\`\`sql
-- Este script ya existe en: scripts/01-create-tables.sql
-- Se ejecuta automáticamente al crear las tablas iniciales
\`\`\`

### Script 2: Crear tabla de sesiones
\`\`\`sql
-- Ejecutar: scripts/001_create_sessions_table.sql
-- Crea la tabla para manejar sesiones de autenticación
\`\`\`

### Script 3: Actualizar tabla de usuarios
\`\`\`sql
-- Ejecutar: scripts/002_update_usuarios_table.sql
-- Agrega el campo password_hash para autenticación
\`\`\`

### Script 4: Crear tablas de comisiones
\`\`\`sql
-- Ejecutar: scripts/003_create_comisiones_tables.sql
-- Crea las tablas para el sistema de comisiones
\`\`\`

### Script 5: Crear usuario administrador
\`\`\`sql
-- Ejecutar: scripts/003_create_admin_user.sql
-- Crea el usuario administrador inicial
\`\`\`

## 3. Credenciales de Administrador

Después de ejecutar los scripts, podrás iniciar sesión con:

- **Email:** admin@distrisanty.com
- **Contraseña:** admin123

⚠️ **IMPORTANTE:** Cambia la contraseña después del primer inicio de sesión.

## 4. Cambios Principales

### Autenticación
- ✅ Autenticación personalizada con bcrypt
- ✅ Sesiones manejadas con cookies HTTP-only
- ✅ Middleware para protección de rutas

### Base de Datos
- ✅ Queries directos con Neon serverless
- ✅ No más ORM, solo SQL nativo
- ✅ Mejor performance y control

### Arquitectura
- ✅ Server Actions para mutaciones
- ✅ Conexión singleton para Neon
- ✅ Manejo de sesiones server-side

## 5. Variables de Entorno Requeridas

Asegúrate de tener configurada en v0:

\`\`\`env
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]
\`\`\`

Esta variable se configura automáticamente al conectar la integración de Neon.

## 6. Desarrollo Local

Si necesitas desarrollar localmente:

1. Clona el repositorio
2. Crea un archivo `.env.local` con tu `DATABASE_URL` de Neon
3. Ejecuta `npm install`
4. Ejecuta `npm run dev`

## Soporte

Si tienes problemas con la configuración, verifica:
- ✓ Que Neon esté conectado en la sección Connect
- ✓ Que todos los scripts se hayan ejecutado sin errores
- ✓ Que la variable DATABASE_URL esté configurada
