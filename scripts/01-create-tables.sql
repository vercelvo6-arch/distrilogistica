-- Tabla de usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol VARCHAR(50) CHECK (rol IN ('administrador', 'coordinador', 'alistador', 'entregador', 'caja')),
  estado VARCHAR(50) DEFAULT 'pendiente' CHECK (estado IN ('activo', 'pendiente', 'inactivo')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de planillas/rutas
CREATE TABLE IF NOT EXISTS planillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  tipo_ruta VARCHAR(50) NOT NULL,
  entregador VARCHAR(255),
  estado VARCHAR(50) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'alistando', 'alistado', 'en_ruta', 'completado')),
  observaciones TEXT,
  total_cargue DECIMAL(10, 2) DEFAULT 0,
  total_entregado DECIMAL(10, 2) DEFAULT 0,
  total_fiado DECIMAL(10, 2) DEFAULT 0,
  total_repaso DECIMAL(10, 2) DEFAULT 0,
  total_devolucion DECIMAL(10, 2) DEFAULT 0,
  alistado_por UUID REFERENCES usuarios(id),
  alistado_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de pedidos
CREATE TABLE IF NOT EXISTS pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planilla_id UUID NOT NULL REFERENCES planillas(id) ON DELETE CASCADE,
  cliente VARCHAR(255) NOT NULL,
  direccion TEXT NOT NULL,
  telefono VARCHAR(50),
  barrio VARCHAR(255),
  secuencia INTEGER NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  estado VARCHAR(50) DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'entregado', 'fiado', 'repaso', 'devolucion')),
  observaciones TEXT,
  entregado_en TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de productos en pedidos
CREATE TABLE IF NOT EXISTS pedido_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  codigo VARCHAR(100) NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  cantidad INTEGER NOT NULL,
  precio_unitario DECIMAL(10, 2) NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  devuelto BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de inventario general (catálogo de productos)
CREATE TABLE IF NOT EXISTS productos_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(100) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  precio DECIMAL(10, 2) NOT NULL,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_planillas_fecha ON planillas(fecha);
CREATE INDEX IF NOT EXISTS idx_planillas_entregador ON planillas(entregador);
CREATE INDEX IF NOT EXISTS idx_planillas_estado ON planillas(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_planilla ON pedidos(planilla_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedido_productos_pedido ON pedido_productos(pedido_id);
CREATE INDEX IF NOT EXISTS idx_productos_catalogo_codigo ON productos_catalogo(codigo);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_planillas_updated_at BEFORE UPDATE ON planillas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pedidos_updated_at BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_productos_catalogo_updated_at BEFORE UPDATE ON productos_catalogo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
