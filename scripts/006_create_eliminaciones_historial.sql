-- Respaldo automático antes de borrar pedidos / planillas / novedades_pedido
-- Permite restaurar desde la BD sin depender de un archivo externo.

CREATE TABLE IF NOT EXISTS eliminaciones_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_entidad TEXT NOT NULL,          -- 'planilla' | 'pedido' | 'novedad'
  entidad_id TEXT NOT NULL,            -- planilla_id / pedido_id / novedad_id
  contexto JSONB,                      -- {planilla_id, ruta, entregador, cliente...} para listar sin hacer join
  snapshot JSONB NOT NULL,
  motivo TEXT,
  eliminado_por TEXT,
  eliminado_por_nombre TEXT,
  eliminado_en TIMESTAMPTZ DEFAULT NOW(),
  restaurado BOOLEAN DEFAULT false,
  restaurado_por TEXT,
  restaurado_en TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_eliminaciones_pendientes
  ON eliminaciones_historial (restaurado, eliminado_en DESC);
