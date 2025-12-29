-- Tabla de configuración de comisiones (porcentajes por entregador)
CREATE TABLE IF NOT EXISTS comisiones_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador VARCHAR(100) NOT NULL UNIQUE,
  porcentaje_comision NUMERIC(5,2) NOT NULL DEFAULT 10.00, -- Porcentaje de comisión (ej: 10.00 = 10%)
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de comisiones calculadas por día
CREATE TABLE IF NOT EXISTS comisiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entregador VARCHAR(100) NOT NULL,
  fecha DATE NOT NULL,
  planilla_id UUID REFERENCES planillas(id) ON DELETE CASCADE,
  total_entregas_efectivas NUMERIC(12,2) DEFAULT 0, -- Total entregado antes de IVA
  total_devoluciones NUMERIC(12,2) DEFAULT 0, -- Total devuelto
  base_comisionable NUMERIC(12,2) DEFAULT 0, -- Entregas - Devoluciones
  porcentaje_aplicado NUMERIC(5,2) NOT NULL,
  monto_comision NUMERIC(12,2) DEFAULT 0, -- Comisión a pagar
  estado VARCHAR(50) DEFAULT 'pendiente', -- pendiente, pagado, cancelado
  observaciones TEXT,
  pagado_en TIMESTAMPTZ,
  pagado_por UUID REFERENCES usuarios(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entregador, fecha, planilla_id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_comisiones_entregador ON comisiones(entregador);
CREATE INDEX IF NOT EXISTS idx_comisiones_fecha ON comisiones(fecha);
CREATE INDEX IF NOT EXISTS idx_comisiones_estado ON comisiones(estado);
CREATE INDEX IF NOT EXISTS idx_comisiones_planilla ON comisiones(planilla_id);

-- RLS Policies para comisiones_config
ALTER TABLE comisiones_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comisiones_config_select_all ON comisiones_config;
CREATE POLICY comisiones_config_select_all ON comisiones_config
  FOR SELECT USING (true);

DROP POLICY IF EXISTS comisiones_config_insert_admin ON comisiones_config;
CREATE POLICY comisiones_config_insert_admin ON comisiones_config
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS comisiones_config_update_admin ON comisiones_config;
CREATE POLICY comisiones_config_update_admin ON comisiones_config
  FOR UPDATE USING (true);

-- RLS Policies para comisiones
ALTER TABLE comisiones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comisiones_select_all ON comisiones;
CREATE POLICY comisiones_select_all ON comisiones
  FOR SELECT USING (true);

DROP POLICY IF EXISTS comisiones_insert_system ON comisiones;
CREATE POLICY comisiones_insert_system ON comisiones
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS comisiones_update_admin ON comisiones;
CREATE POLICY comisiones_update_admin ON comisiones
  FOR UPDATE USING (true);

-- Insertar configuración por defecto para los entregadores
INSERT INTO comisiones_config (entregador, porcentaje_comision, activo) 
VALUES 
  ('Alfonso', 10.00, true),
  ('Miguel', 10.00, true),
  ('Carlos', 10.00, true),
  ('Mateo', 10.00, true)
ON CONFLICT (entregador) DO NOTHING;

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_comisiones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS comisiones_updated_at ON comisiones;
CREATE TRIGGER comisiones_updated_at
  BEFORE UPDATE ON comisiones
  FOR EACH ROW
  EXECUTE FUNCTION update_comisiones_updated_at();

DROP TRIGGER IF EXISTS comisiones_config_updated_at ON comisiones_config;
CREATE TRIGGER comisiones_config_updated_at
  BEFORE UPDATE ON comisiones_config
  FOR EACH ROW
  EXECUTE FUNCTION update_comisiones_updated_at();
