-- =====================================================
-- POLÍTICAS RLS PARA SISTEMA DE LOGÍSTICA
-- =====================================================

-- ============ TABLA: usuarios ============

-- Permitir lectura pública (necesario para login)
DROP POLICY IF EXISTS "usuarios_select_public" ON public.usuarios;
CREATE POLICY "usuarios_select_public"
  ON public.usuarios
  FOR SELECT
  USING (true);

-- Permitir inserción pública (para registro de nuevos usuarios)
DROP POLICY IF EXISTS "usuarios_insert_public" ON public.usuarios;
CREATE POLICY "usuarios_insert_public"
  ON public.usuarios
  FOR INSERT
  WITH CHECK (true);

-- Solo administradores pueden actualizar usuarios
DROP POLICY IF EXISTS "usuarios_update_admin" ON public.usuarios;
CREATE POLICY "usuarios_update_admin"
  ON public.usuarios
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol = 'administrador'
      AND u.estado = 'activo'
    )
  );

-- Solo administradores pueden eliminar usuarios
DROP POLICY IF EXISTS "usuarios_delete_admin" ON public.usuarios;
CREATE POLICY "usuarios_delete_admin"
  ON public.usuarios
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol = 'administrador'
      AND u.estado = 'activo'
    )
  );

-- ============ TABLA: planillas ============

-- Todos pueden leer planillas
DROP POLICY IF EXISTS "planillas_select_all" ON public.planillas;
CREATE POLICY "planillas_select_all"
  ON public.planillas
  FOR SELECT
  USING (true);

-- Solo coordinadores pueden crear planillas
DROP POLICY IF EXISTS "planillas_insert_coordinador" ON public.planillas;
CREATE POLICY "planillas_insert_coordinador"
  ON public.planillas
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol = 'coordinador'
      AND u.estado = 'activo'
    )
  );

-- Coordinadores, alistadores y entregadores pueden actualizar
DROP POLICY IF EXISTS "planillas_update_roles" ON public.planillas;
CREATE POLICY "planillas_update_roles"
  ON public.planillas
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol IN ('coordinador', 'alistador', 'entregador')
      AND u.estado = 'activo'
    )
  );

-- ============ TABLA: pedidos ============

-- Todos pueden leer pedidos
DROP POLICY IF EXISTS "pedidos_select_all" ON public.pedidos;
CREATE POLICY "pedidos_select_all"
  ON public.pedidos
  FOR SELECT
  USING (true);

-- Solo coordinadores pueden crear pedidos
DROP POLICY IF EXISTS "pedidos_insert_coordinador" ON public.pedidos;
CREATE POLICY "pedidos_insert_coordinador"
  ON public.pedidos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol = 'coordinador'
      AND u.estado = 'activo'
    )
  );

-- Entregadores y coordinadores pueden actualizar pedidos
DROP POLICY IF EXISTS "pedidos_update_entregador" ON public.pedidos;
CREATE POLICY "pedidos_update_entregador"
  ON public.pedidos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol IN ('entregador', 'coordinador')
      AND u.estado = 'activo'
    )
  );

-- ============ TABLA: pedido_productos ============

-- Todos pueden leer productos de pedidos
DROP POLICY IF EXISTS "pedido_productos_select_all" ON public.pedido_productos;
CREATE POLICY "pedido_productos_select_all"
  ON public.pedido_productos
  FOR SELECT
  USING (true);

-- Solo coordinadores pueden crear productos de pedidos
DROP POLICY IF EXISTS "pedido_productos_insert_coordinador" ON public.pedido_productos;
CREATE POLICY "pedido_productos_insert_coordinador"
  ON public.pedido_productos
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol = 'coordinador'
      AND u.estado = 'activo'
    )
  );

-- Entregadores y coordinadores pueden actualizar productos
DROP POLICY IF EXISTS "pedido_productos_update_entregador" ON public.pedido_productos;
CREATE POLICY "pedido_productos_update_entregador"
  ON public.pedido_productos
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol IN ('entregador', 'coordinador')
      AND u.estado = 'activo'
    )
  );

-- ============ TABLA: productos_catalogo ============

-- Todos pueden leer el catálogo de productos
DROP POLICY IF EXISTS "productos_catalogo_select_all" ON public.productos_catalogo;
CREATE POLICY "productos_catalogo_select_all"
  ON public.productos_catalogo
  FOR SELECT
  USING (true);

-- Solo coordinadores pueden crear productos en el catálogo
DROP POLICY IF EXISTS "productos_catalogo_insert_coordinador" ON public.productos_catalogo;
CREATE POLICY "productos_catalogo_insert_coordinador"
  ON public.productos_catalogo
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol = 'coordinador'
      AND u.estado = 'activo'
    )
  );

-- Solo coordinadores pueden actualizar productos
DROP POLICY IF EXISTS "productos_catalogo_update_coordinador" ON public.productos_catalogo;
CREATE POLICY "productos_catalogo_update_coordinador"
  ON public.productos_catalogo
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.email = auth.jwt()->>'email'
      AND u.rol = 'coordinador'
      AND u.estado = 'activo'
    )
  );
