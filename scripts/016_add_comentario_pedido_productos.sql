-- El comentario del asesor (columna "Comentarios" del NURTURING DIARIO) queda
-- en la linea del producto exacto de la factura, no a nivel de todo el pedido.
-- Hasta ahora solo se guardaba consolidado en pedidos.observaciones, perdiendo
-- la asociacion con el producto especifico al que se referia. Se agrega una
-- columna dedicada en pedido_productos para poder mostrar el comentario debajo
-- del producto correspondiente en la planilla del alistador.

ALTER TABLE pedido_productos
  ADD COLUMN IF NOT EXISTS comentario TEXT;
