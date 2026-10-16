# Inventario Distrisanty — diagnóstico y propuesta (para Gerencia)

**Fecha:** 2026-10-11

## 1. Qué es hoy Distrilogística

Distrilogística es la aplicación que organiza la **entrega** de lo que ya se vendió: importa un CSV de ventas del sistema POS, arma las planillas por ruta y por entregador, y registra lo que pasa en la calle (lo que se entrega, lo que queda fiado, lo que se devuelve, lo que falta en bodega).

Es, literalmente, la realidad diaria de **qué salió de bodega y a dónde fue** — pero es una fotografía de la operación de reparto, no un inventario. No está conectada con el POS (que es donde viven el inventario, las compras y la facturación formal): hoy son dos sistemas que no se hablan.

## 2. Qué hay y qué falta

**Lo que Distrilogística sí tiene, y es aprovechable:**
- El detalle línea por línea de ~115 de las 1.109 planillas de junio a octubre de 2026 (6.199 líneas, 10.251 unidades, cerca de 1.235 códigos distintos) — mientras ese detalle no se haya borrado (ver punto 3).
- El registro de faltantes en bodega por planilla y código (5.831 filas): 290 definitivos (637 unidades que nunca salieron) y 817 pendientes de cerrar (1.835 unidades).
- Un primer cruce que ya es posible **sin cambiar nada**: comparar las facturas del POS contra las que Distrilogística terminó importando, para detectar facturas que se perdieron en la importación (ya se encontró al menos un caso real: la factura de Gladys Bayona, ruta L38, que no llegó a aparecer).

**Lo que falta, y por qué:**
- **El detalle se borra solo.** Hay un mecanismo en la base de datos que, apenas caja cierra un cuadre, elimina el detalle de pedidos y productos de esa planilla (ver punto 3 — es intencional para el día a día, pero destruye la materia prima de cualquier cruce de inventario). Por eso en los meses anteriores a junio casi no queda detalle (en septiembre, por ejemplo, solo 10 de 303 planillas lo conservan).
- **No hay catálogo de productos cargado.** La tabla pensada para eso está vacía. Los códigos tampoco son consistentes entre un CSV y otro (ceros a la izquierda a veces sí, a veces no).
- **Las ofertas y combos son más del 40% del negocio y no tienen estructura.** El 43% de las líneas vendidas (≈66% del valor) son promociones tipo "PROMO 215 INCLUYE: 6 ACEITE LANDER + 2 CREMA LANDER" — la composición real (qué productos y cuántos) solo existe como texto libre dentro del nombre, y ese texto cambia: un mismo código de promoción puede tener contenido distinto según la fecha (se encontraron 87 códigos con más de un nombre/composición).
- **Las devoluciones, agotados y sustituciones del asesor no quedan con producto y cantidad.** Hoy se guardan como un monto en pesos y un comentario de texto libre, sin ligar a ningún código del catálogo. De casi 6.000 líneas de novedades solo 3 tienen el ajuste por producto, y no hay ningún reemplazo registrado con su código real — aunque en la calle sí ocurren constantemente (ej. "mandar 1 Balance Hombre y 1 Dama en vez de 2 Balance Hombre").

## 3. El hallazgo clave: el detalle se borra al cuadrar caja

Se confirmó directamente en la base de datos (consulta de solo lectura) que existe un mecanismo automático: apenas se guarda un cuadre de caja, se borran los pedidos de las planillas recién cuadradas, y con ellos cae en cascada el detalle de productos de cada pedido. Quedan solo las cabeceras (planilla, cuadre, faltantes, novedades en pesos, fiados) — el "qué producto, cuánta cantidad" desaparece.

Esto es correcto para la operación diaria (ya no se necesita ese detalle para repartir ni cobrar), pero significa que **lo que ya está cuadrado no se puede recuperar después** desde Distrilogística — solo el CSV de ventas del POS conserva lo facturado, nunca lo que realmente se entregó o se sustituyó en la calle.

**Se dejó preparado** (sin aplicar) un script que archiva ese detalle justo antes de que se borre, en la misma operación de guardar el cuadre, para que nunca más se pierda: [020_archivo_antes_de_borrar_cuadre.sql](../scripts/020_archivo_antes_de_borrar_cuadre.sql). Queda pendiente de que Marlon lo revise y autorice aplicarlo.

## 4. Arquitectura propuesta

**Decisión ya tomada:** no se integra esto dentro de Distrilogística. Se construye un **repositorio y una base de datos nuevos y separados** — el inventario de Distrisanty — que:

1. **Lee de Distrilogística, nunca escribe en ella.** Usuario de base de datos de solo lectura, para no arriesgar la operación diaria de reparto.
2. **Se sincroniza periódicamente** (la propuesta es cada hora) para traer las planillas abiertas y, una vez aplicado el punto 3, el detalle ya archivado de las cuadradas.
3. **Cruza contra el POS**, que sigue siendo la única fuente de verdad del saldo de inventario y de las compras — Distrilogística no reemplaza eso, lo complementa.
4. El ajuste de saldo hacia el POS se hace **semanalmente, al cierre del periodo** (no al inicio), para no pisar las compras que entraron durante la semana.

## 5. Qué cruces habilita esto

- **Facturas del POS vs. lo importado** — ya disponible hoy, sin esperar nada más: detecta facturas que se perdieron al importar (caso real ya encontrado).
- **Salidas (lo que Distrilogística confirma que salió) vs. compras del POS** — para ver si lo que entra y lo que sale cuadra por código.
- **Devoluciones y notas crédito** — una vez que se capturen con producto y cantidad (ver punto 6), se pueden cruzar contra lo que el POS registra como devuelto.
- **Ajuste semanal del saldo del POS** — aplicar al inventario del POS la diferencia entre lo facturado y lo realmente entregado que Distrilogística ya puede calcular con sus propios datos.

## 6. Cambios mínimos recomendados en Distrilogística

Para que estos cruces sean confiables, hacen falta tres cambios puntuales (no un rediseño):

1. **Aplicar el archivado antes del borrado** (punto 3) — sin esto, el detalle de cualquier planilla ya cuadrada se pierde para siempre.
2. **Registrar devoluciones y agotados con producto y cantidad real**, no solo un monto en pesos con texto libre. Hoy el dato existe en la cabeza del alistador/entregador pero no en una columna que se pueda sumar o cruzar.
3. **Registrar las sustituciones del asesor con el código real del catálogo**, no como texto libre. Ya existe el lugar en pantalla donde el alistador anota la sustitución — solo falta que ese campo apunte a un código real en vez de a texto suelto.

## 7. Qué se revisó hoy y qué falta subir

Se buscaron archivos nuevos del POS en Descargas y Escritorio (modificados después del 7 de octubre). No apareció ningún CSV nuevo de **inventario** ni de **compras** — sigue siendo lo que falta subir para poder construir el cruce de saldos. Sí apareció un nuevo export de **ventas** (`Ventas al 09.csv`, con el mismo formato ya conocido) y un listado de clientes/rutas, que no cambian nada de lo descrito arriba.

La migración 019 (que agrega a Distrilogística la columna para enlazar pedidos con su planilla de mercancía) **ya está aplicada** en producción — no queda pendiente.

## 8. Qué necesita aprobación de Marlon

- Aplicar [020_archivo_antes_de_borrar_cuadre.sql](../scripts/020_archivo_antes_de_borrar_cuadre.sql) en la base de datos de producción.
- Crear el repositorio y la base de datos nuevos del inventario.
- Subir los CSV de **inventario** y **compras** del POS cuando estén disponibles (son los que faltan para armar el cruce de saldos).
