-- =====================================================================
-- 027 — Tablas del módulo de INVENTARIO (dentro de Distrilogística)
--
-- Solo CREA tablas nuevas (todas empiezan por "inventario_"). No toca ni
-- modifica ninguna tabla existente, así que se puede correr sin riesgo para
-- la operación: si no se usan, no hacen nada. Se puede correr más de una
-- vez (todo es IF NOT EXISTS).
--
-- Qué guarda cada una:
--   inventario_cargas      → bitácora de cada archivo que se sube (catálogo, ventas del
--                            POS, inventario del POS): quién, cuándo, de qué fechas.
--   inventario_catalogo    → productos y kits del POS (código, nombre, categoría, precio).
--   inventario_salidas     → lo que SALIÓ de bodega en cada planilla alistada, por producto.
--                            Se guarda al terminar de alistar y NO se borra al cuadrar caja
--                            (las planillas y sus pedidos sí se borran en ese momento).
--   inventario_ventas_pos  → líneas del CSV de ventas del POS (las devoluciones del POS
--                            entran con cantidad negativa / es_devolucion).
--   inventario_saldos_pos  → el inventario del POS (saldo por código) de cada carga.
--   inventario_ajustes     → ajustes manuales que se aplicaron (ej. 2 Balance Hombre
--                            facturadas pero salieron 1 Hombre y 1 Dama), para no volver
--                            a marcarlos como diferencia.
--
-- Los códigos se guardan NORMALIZADOS en la columna "codigo" (mayúsculas, sin espacios y
-- sin ceros a la izquierda en códigos numéricos: "0892" y "892" son el mismo producto) y
-- el código tal como vino en el archivo queda en "codigo_original".
-- =====================================================================

CREATE TABLE IF NOT EXISTS inventario_cargas (
  id             SERIAL PRIMARY KEY,
  tipo           TEXT NOT NULL CHECK (tipo IN ('catalogo', 'ventas', 'inventario')),
  archivo        TEXT,
  periodo_desde  DATE,
  periodo_hasta  DATE,
  filas          INTEGER NOT NULL DEFAULT 0,
  observaciones  TEXT,
  subido_por     TEXT,
  subido_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventario_cargas_tipo
  ON inventario_cargas (tipo, subido_en DESC);


CREATE TABLE IF NOT EXISTS inventario_catalogo (
  codigo           TEXT PRIMARY KEY,
  codigo_original  TEXT NOT NULL,
  nombre           TEXT NOT NULL,
  categoria        TEXT,
  precio_unitario  NUMERIC(14, 2),
  es_kit           BOOLEAN NOT NULL DEFAULT FALSE,
  composicion      TEXT,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  carga_id         INTEGER REFERENCES inventario_cargas (id) ON DELETE SET NULL,
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventario_catalogo_categoria
  ON inventario_catalogo (categoria);


CREATE TABLE IF NOT EXISTS inventario_salidas (
  id                   BIGSERIAL PRIMARY KEY,
  planilla_id          TEXT NOT NULL,
  fecha                DATE NOT NULL,
  entregador           TEXT,
  ruta                 TEXT,
  codigo               TEXT NOT NULL,
  codigo_original      TEXT,
  nombre               TEXT,
  categoria            TEXT,
  cantidad_pedida      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cantidad_faltante    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cantidad_salida      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  estado_alistamiento  TEXT,
  producto_reemplazo   TEXT,
  observaciones        TEXT,
  alistado_por         TEXT,
  registrado_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (planilla_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_inventario_salidas_fecha
  ON inventario_salidas (fecha);
CREATE INDEX IF NOT EXISTS idx_inventario_salidas_codigo
  ON inventario_salidas (codigo, fecha);


CREATE TABLE IF NOT EXISTS inventario_ventas_pos (
  id               BIGSERIAL PRIMARY KEY,
  carga_id         INTEGER NOT NULL REFERENCES inventario_cargas (id) ON DELETE CASCADE,
  fecha            DATE,
  id_venta         TEXT,
  numero_factura   TEXT,
  ruta             TEXT,
  vendedor         TEXT,
  cliente          TEXT,
  codigo           TEXT NOT NULL,
  codigo_original  TEXT,
  nombre           TEXT,
  cantidad         NUMERIC(12, 2) NOT NULL,
  valor            NUMERIC(14, 2),
  es_devolucion    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_inventario_ventas_pos_carga
  ON inventario_ventas_pos (carga_id);
CREATE INDEX IF NOT EXISTS idx_inventario_ventas_pos_codigo
  ON inventario_ventas_pos (codigo, fecha);
CREATE INDEX IF NOT EXISTS idx_inventario_ventas_pos_factura
  ON inventario_ventas_pos (numero_factura);


CREATE TABLE IF NOT EXISTS inventario_saldos_pos (
  id               BIGSERIAL PRIMARY KEY,
  carga_id         INTEGER NOT NULL REFERENCES inventario_cargas (id) ON DELETE CASCADE,
  codigo           TEXT NOT NULL,
  codigo_original  TEXT,
  nombre           TEXT,
  categoria        TEXT,
  cantidad         NUMERIC(12, 2) NOT NULL,
  precio_unitario  NUMERIC(14, 2),
  UNIQUE (carga_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_inventario_saldos_pos_codigo
  ON inventario_saldos_pos (codigo);


CREATE TABLE IF NOT EXISTS inventario_ajustes (
  id             BIGSERIAL PRIMARY KEY,
  fecha          DATE NOT NULL DEFAULT CURRENT_DATE,
  codigo         TEXT NOT NULL,
  cantidad       NUMERIC(12, 2) NOT NULL,
  motivo         TEXT,
  carga_id       INTEGER REFERENCES inventario_cargas (id) ON DELETE SET NULL,
  registrado_por TEXT,
  registrado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventario_ajustes_codigo
  ON inventario_ajustes (codigo, fecha);
