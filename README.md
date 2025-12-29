# Sistema de Gestión de Rutas y Ventas - Distrisanty

Sistema completo de gestión logística para optimizar procesos de entrega y alistamiento.

## 🚀 Stack Tecnológico

- **Framework:** Next.js 16 con App Router
- **Base de Datos:** Neon (PostgreSQL Serverless)
- **Autenticación:** Sistema personalizado con bcrypt
- **UI:** shadcn/ui + Tailwind CSS v4
- **Lenguaje:** TypeScript

## 📋 Configuración Inicial

### 1. Conectar Base de Datos Neon

1. En v0, ve a **Connect** en el sidebar
2. Selecciona **Neon** y conecta tu proyecto
3. Esto configurará automáticamente `DATABASE_URL`

### 2. Ejecutar Migraciones

Ejecuta los siguientes scripts SQL en orden:

```bash
scripts/01-create-tables.sql              # Tablas principales
scripts/001_create_sessions_table.sql     # Tabla de sesiones
scripts/002_update_usuarios_table.sql     # Actualizar usuarios
scripts/003_create_comisiones_tables.sql  # Tablas de comisiones
scripts/003_create_admin_user.sql         # Usuario admin
```

### 3. Credenciales de Acceso

**Usuario Administrador:**
- Email: `admin@distrisanty.com`
- Password: `admin123`

⚠️ Cambiar la contraseña después del primer inicio de sesión.

## 👥 Roles del Sistema

### 1. Coordinador
- Carga archivos CSV (NURTURING + INVENTARIO)
- Genera planillas por ruta
- Asigna entregadores a rutas
- Visualiza estado de todas las planillas

### 2. Alistador
- Ve planillas pendientes
- Prepara pedidos (cambia a "alistando")
- Marca pedidos como "alistados"
- Verifica productos y cantidades

### 3. Entregador
- Visualiza su ruta del día
- Actualiza estado de entregas:
  - Entregado
  - Fiado
  - Repaso
  - Devolución
- Marca productos devueltos

### 4. Caja
- Reconcilia efectivo vs entregas
- Visualiza totales por entregador
- Genera reportes de caja

### 5. Administrador
- Gestiona usuarios (aprobar/rechazar)
- Asigna roles
- Configura comisiones por entregador
- Acceso completo al sistema

## 🗄️ Estructura de Base de Datos

### Tablas Principales

- `usuarios` - Usuarios y autenticación
- `sessions` - Sesiones activas
- `planillas` - Rutas/hojas de ruta diarias
- `pedidos` - Órdenes individuales
- `pedido_productos` - Productos por pedido
- `productos_catalogo` - Inventario general
- `comisiones_config` - Configuración de comisiones
- `comisiones` - Cálculo de comisiones

## 🔐 Seguridad

- Autenticación con bcrypt (10 rounds)
- Sesiones HTTP-only cookies
- Middleware de protección de rutas
- Validación de roles en server actions

## 📱 Flujo de Trabajo

1. **Coordinador** → Carga archivos y genera planillas
2. **Coordinador** → Asigna entregadores a rutas
3. **Alistador** → Prepara los pedidos
4. **Entregador** → Realiza entregas y actualiza estados
5. **Caja** → Reconcilia efectivo
6. **Sistema** → Calcula comisiones automáticamente

## 🛠️ Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev

# Build de producción
npm run build

# Iniciar producción
npm start
```

## 📦 Dependencias Principales

- `@neondatabase/serverless` - Cliente de Neon
- `bcryptjs` - Hash de contraseñas
- `next` 16 - Framework
- `react` 19.2 - UI Library
- `lucide-react` - Iconos
- `date-fns` - Manejo de fechas

## 📝 Notas Importantes

- NO usar localStorage para datos persistentes
- Todas las mutaciones deben ser Server Actions
- Queries SQL directos (no ORM)
- Validación de sesión en cada request protegido

## 🔄 Migración desde Supabase

Este proyecto fue migrado completamente de Supabase a Neon:

- ✅ Autenticación personalizada (antes Supabase Auth)
- ✅ Queries SQL nativos (antes Supabase client)
- ✅ Sesiones con cookies (antes Supabase sessions)
- ✅ Sin dependencias de Supabase

Ver `NEON_SETUP.md` para detalles de la migración.
