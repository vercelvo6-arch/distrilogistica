-- Planilla donde quedó alistada/cargada físicamente la mercancía de un pedido,
-- cuando ese pedido se reasigna a otra planilla DESPUÉS de haber sido cargado.
--
-- NULL = caso normal: la mercancía sigue a planilla_id.
-- Con valor = el pedido (su cliente y su dinero) ya pertenece a planilla_id,
-- pero su mercancía sigue contando en la planilla indicada aquí. Así la lista
-- de productos del alistador/coordinador de la planilla destino no muestra
-- mercancía que nunca se cargó en ella, y la planilla origen conserva la suya.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS planilla_mercancia_id TEXT;
