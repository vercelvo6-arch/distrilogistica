-- Da de baja los faltantes PENDIENTES de planillas que ya se cuadraron en caja y ya no conservan
-- pedidos (cuando caja cuadra, el sistema borra los pedidos de la planilla: la mercancía ya no se
-- puede entregar ni subsanar desde ahí). Eran unos 810 en octubre de 2026.
--
-- NO borra nada: pasan de "pendiente" a "definitivo" (en pantalla "No se entregó"), con motivo y
-- fecha, igual que el botón "Eliminar seleccionados" de la pestaña Novedades. Se pueden devolver
-- con "Revertir" y quedan listados en audit_log (acción "faltantes_baja_planillas_cuadradas").
--
-- Solo toca faltantes pendientes cuya planilla aparece en algún cuadre de caja Y que no tienen
-- ningún pedido. Una sola sentencia (todo o nada); si se corre dos veces, la segunda no hace nada.

WITH baja AS (
  UPDATE faltantes f
  SET estado = 'definitivo',
      tipo_resolucion = 'definitivo',
      cantidad_resuelta = 0,
      resuelto_por = NULL,
      fecha_resolucion = NOW(),
      observaciones_resolucion = 'Dado de baja en bloque: la planilla ya se cuadró en caja y no se pudo entregar'
  WHERE f.estado = 'pendiente'
    AND EXISTS (SELECT 1 FROM cuadres_caja cc WHERE f.planilla_id = ANY(cc.planillas_ids))
    AND NOT EXISTS (
      SELECT 1 FROM pedidos p
      WHERE COALESCE(p.planilla_mercancia_id, p.planilla_id) = f.planilla_id
    )
  RETURNING f.id, f.cantidad_faltante
),
auditoria AS (
  INSERT INTO audit_log (user_id, user_email, action, details)
  SELECT 'manual', NULL, 'faltantes_baja_planillas_cuadradas',
         jsonb_build_object('ids', (SELECT jsonb_agg(id) FROM baja),
                            'total', (SELECT COUNT(*) FROM baja),
                            'unidades', (SELECT COALESCE(SUM(cantidad_faltante), 0) FROM baja))
  WHERE EXISTS (SELECT 1 FROM baja)
  RETURNING 1
)
SELECT (SELECT COUNT(*) FROM baja) AS faltantes_dados_de_baja,
       (SELECT COALESCE(SUM(cantidad_faltante), 0) FROM baja) AS unidades;
