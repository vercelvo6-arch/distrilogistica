-- Habilitar Row Level Security (RLS) en todas las tablas
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE planillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos_catalogo ENABLE ROW LEVEL SECURITY;

-- Políticas para tabla usuarios
-- Los usuarios pueden ver su propia información
CREATE POLICY "usuarios_select_own" ON usuarios
  FOR SELECT USING (auth.uid() = id);

-- Los administradores pueden ver todos los usuarios
CREATE POLICY "usuarios_select_admin" ON usuarios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol = 'administrador'
    )
  );

-- Los administradores pueden insertar nuevos usuarios
CREATE POLICY "usuarios_insert_admin" ON usuarios
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol = 'administrador'
    )
  );

-- Los administradores pueden actualizar usuarios
CREATE POLICY "usuarios_update_admin" ON usuarios
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol = 'administrador'
    )
  );

-- Políticas para planillas
-- Todos los usuarios autenticados pueden ver planillas
CREATE POLICY "planillas_select_all" ON planillas
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Coordinadores pueden insertar planillas
CREATE POLICY "planillas_insert_coordinador" ON planillas
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol IN ('coordinador', 'administrador')
    )
  );

-- Coordinadores, alistadores y entregadores pueden actualizar planillas
CREATE POLICY "planillas_update_roles" ON planillas
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol IN ('coordinador', 'alistador', 'entregador', 'administrador')
    )
  );

-- Políticas para pedidos
-- Todos los usuarios autenticados pueden ver pedidos
CREATE POLICY "pedidos_select_all" ON pedidos
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Coordinadores pueden insertar pedidos
CREATE POLICY "pedidos_insert_coordinador" ON pedidos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol IN ('coordinador', 'administrador')
    )
  );

-- Entregadores pueden actualizar pedidos
CREATE POLICY "pedidos_update_entregador" ON pedidos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol IN ('entregador', 'coordinador', 'administrador')
    )
  );

-- Políticas para productos en pedidos
-- Todos los usuarios autenticados pueden ver productos de pedidos
CREATE POLICY "pedido_productos_select_all" ON pedido_productos
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Coordinadores pueden insertar productos
CREATE POLICY "pedido_productos_insert_coordinador" ON pedido_productos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol IN ('coordinador', 'administrador')
    )
  );

-- Entregadores pueden actualizar productos (marcar como devueltos)
CREATE POLICY "pedido_productos_update_entregador" ON pedido_productos
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol IN ('entregador', 'coordinador', 'administrador')
    )
  );

-- Políticas para catálogo de productos
-- Todos pueden ver el catálogo
CREATE POLICY "productos_catalogo_select_all" ON productos_catalogo
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Solo coordinadores y administradores pueden modificar el catálogo
CREATE POLICY "productos_catalogo_insert_coordinador" ON productos_catalogo
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol IN ('coordinador', 'administrador')
    )
  );

CREATE POLICY "productos_catalogo_update_coordinador" ON productos_catalogo
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE id = auth.uid() AND rol IN ('coordinador', 'administrador')
    )
  );
