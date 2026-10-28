# Distrilogística (Distrisanty) — guía para Claude Code

Este archivo es la memoria del proyecto: Claude Code lo lee solo al abrir esta carpeta. Léelo completo antes de
tocar nada. Si cambias una regla de negocio o descubres algo importante, **actualiza este archivo** para que el
siguiente que trabaje aquí (persona o Claude) no pierda el contexto.

## 1. Qué es
Aplicación de logística y caja de una distribuidora: alistamiento de pedidos, entrega en ruta, cobro de fiados
(cuentas por cobrar) y cuadre de caja por entregador. Los usuarios no son técnicos.

- **Stack:** Next.js (App Router) + TypeScript + Tailwind/shadcn + Neon (PostgreSQL serverless).
- **Despliegue:** Vercel, desde la rama `main` de `github.com/vercelvo6-arch/distrilogistica` (cada push a `main` despliega).
- **Base de datos:** Neon. La conexión va en la variable `DATABASE_URL` (Vercel). **Nunca** pongas credenciales en el repo ni en archivos.
- **Roles:** `administrador`, `coordinador`, `alistador`, `caja`, `entregador` (cada uno con su pantalla en `app/<rol>` y su vista en `components/<rol>-view.tsx`).

### Glosario (las palabras del negocio)
- **POS:** el sistema de facturación e inventario de la empresa. De ahí sale el CSV de ventas que se importa; es la fuente de verdad del inventario y las compras.
- **Planilla:** la hoja de reparto de UNA ruta en un día; agrupa los pedidos (facturas) de esa ruta. Una ruta es una zona (6C, 29, 72…). Los clientes se nombran con el número de ruta al inicio.
- **Pedido:** una factura de un cliente dentro de una planilla, con sus productos.
- **Entregador:** quien lleva la mercancía. Un entregador puede llevar varias planillas el mismo día. "Extra", "Oficina" son entregadores comodín a los que se asigna una planilla mientras se decide quién la lleva.
- **Alistador / alistamiento:** quien prepara la mercancía en bodega. Marca cada producto como completo, incompleto, no alistado o reemplazo (sustitución del asesor).
- **Faltante:** producto que el alistador no pudo completar. Queda pendiente hasta que el coordinador lo subsana (completo, parcial o "no se entregó").
- **Asesor:** el vendedor. Hay planillas y pedidos "de asesor" (ventas que el asesor entrega o gestiona directamente).
- **Fiado / cuenta por cobrar (CxC):** factura que el cliente no pagó al recibir. Se cobra después con **abonos** (cada pago parcial o total).
- **Cobro CxC:** el pago de un fiado que registra el entregador en ruta (efectivo o Nequi/banco). Caja lo concilia en el cuadre.
- **Consignación:** depósito o transferencia bancaria. O es de un pedido, o es de un cobro, o es un depósito de efectivo del entregador.
- **Cuadre de caja:** el cierre con el entregador: caja cuenta billetes, monedas y consignaciones y los compara con lo esperado. Puede ser individual (una planilla) o agrupado (varias del mismo entregador).
- **Novedades del cuadre:** lo que reduce lo esperado: fiados nuevos, devoluciones (en dinero, no por producto), repasos, agotados, descuentos, varios y errores de facturación.
- **Repaso:** pedido que no se pudo entregar y se vuelve a programar en otra planilla o día.
- **Cuadre administrativo (pagos anticipados):** pagos de clientes que llegaron directo al banco o a administración antes de que el entregador los cobrara; se identifican contra un fiado y entran al cuadre del entregador asignado.
- **Comisión:** lo que gana el entregador, un porcentaje de lo que entregó (el Recibido del cuadre).

### Un día típico, de principio a fin
1. **Importar:** el coordinador sube el CSV de ventas del POS; el sistema agrupa por ruta, cliente y factura y crea las planillas con sus pedidos.
2. **Asignar:** el coordinador asigna cada planilla a un entregador y fija la fecha de alistamiento (a veces primero a "Extra" y luego la reasigna).
3. **Alistar:** el alistador inicia el cronómetro de la tarjeta del entregador, marca cada producto y pulsa Completar (la planilla pasa a `alistado`; se guarda la salida de inventario).
4. **Supervisar:** el coordinador revisa en Supervisión las notas del alistamiento y los faltantes pendientes, los subsana o devuelve la planilla al alistador.
5. **Repartir:** el entregador marca cada pedido (entregado, fiado, devolución, repaso), cobra fiados y registra transferencias.
6. **Cuadrar caja:** caja cuenta lo que trae el entregador, vincula cobros y pagos administrativos, registra consignaciones y novedades, y confirma. Al guardar el cuadre se archivan y **se borran los pedidos de esas planillas**, los fiados nuevos y los abonos quedan registrados, y se calcula la comisión.
7. **Después:** historial de caja, fiados por cobrar (los cobra otro entregador asignado), faltantes pendientes, e inventario (cruce con el POS).

## 2. Cómo trabajar con el dueño (importante)
- Responde **en español sencillo, sin jerga técnica**. Si algo no se entiende, explícalo con un ejemplo real (cliente, entregador, montos).
- Cuando la intención es clara, **hazlo**; no pidas permiso por cada paso. Pregunta solo si hay dos lecturas con consecuencias distintas en dinero o datos.
- **No hagas commit ni push sin que te lo pidan.** Cuando pidan "súbelo", haz commit y push a `main`.
- Antes de decir "listo", verifica con datos reales (consultas de solo lectura) y di con honestidad lo que no pudiste probar.
- Para tareas de revisión, "responde pero no ejecutes" significa exactamente eso: solo leer y explicar.

## 3. Cómo se cambia la base de datos de producción
- Las escrituras en producción las corre **el dueño a mano en el editor SQL de Neon**. Tú dejas el script en `scripts/NNN_nombre.sql`
  (el siguiente número libre es el **032**; el 025 no existe a propósito) y explicas qué hace.
- Consultas de **solo lectura** para investigar sí están bien (usa `@neondatabase/serverless` desde un `.mjs` temporal y bórralo después).
- Todo script que cambie datos debe ser: **una sola sentencia** (CTEs) → todo o nada; **idempotente** (si se corre dos veces, la segunda no hace nada);
  con guardas en el `WHERE`; y dejar copia de lo borrado en `audit_log`. Valídalo con `EXPLAIN` (sin ejecutar) antes de entregarlo.
- Antes de borrar o modificar datos del dinero, mira primero el registro (qué es, de quién, qué lo referencia).
- Revisa en la base si un script ya se aplicó antes de asumirlo (`scripts/` es solo el registro). Aplicados y verificados: 020 (respaldo antes de borrar cuadres), 026 (ajuste Yeimy/Leder), 027 (tablas de inventario) y 031 (borró los fiados eliminados 733 y 2087 de Yeimy y sus pagos; solo queda su fiado vivo 1926).

## 4. Trampas técnicas (te van a ahorrar horas)
- **El driver `neon()` HTTP NO hace transacciones reales.** `BEGIN/COMMIT` en llamadas separadas no hacen nada. Para atomicidad usa `sql.transaction([...])` o una sola sentencia con CTEs. `app/api/cuadres-caja/route.ts` todavía tiene `BEGIN/COMMIT` falsos (deuda conocida; por eso se hicieron idempotentes las operaciones).
- `next.config.mjs` tiene `ignoreBuildErrors: true` y hay ~420 errores de TypeScript preexistentes (casi todos por el tipado de `neon`). **No los "arregles" en bloque**; solo cuida no añadir errores nuevos en lo que tocas: `npx tsc --noEmit | grep archivo`.
- Los archivos tienen finales de línea **CRLF** (Windows). Si editas por script, normaliza y restaura; con la herramienta Edit funciona normal.
- El nombre del mismo entregador puede variar por grupo de rutas (ej. "Alfonso 6C-7B-93", "Alfonso 72 - 84"). **Alfonso en todas sus variantes es el mismo entregador.**
- Los nombres de cliente llevan el número de ruta al inicio ("29 LUIS FERNANDO VELANDIA PLATA"). Al buscar, usa partes del apellido con `ILIKE`.
- Hay caracteres rotos en nombres viejos (`Ó`, `Ñ` → `�`); busca con una parte sin tilde.

## 5. Reglas de negocio que NO se deben romper

### 5.1 Cuadre de caja (`cuadres_caja`, `app/api/cuadres-caja/route.ts`, `components/caja-view.tsx`)
- **Esperado** = Cargue − Novedades (fiado, devoluciones, repasos, agotados, descuentos, varios, errores de facturación) + Cobros CxC.
- **Recibido (lo que "entregó")** = Billetes + Monedas + Consignaciones + Cobros por Nequi/banco. **La comisión del entregador se calcula sobre este total.**
- Los **cobros en efectivo ya van dentro de billetes/monedas**: no se suman aparte al Recibido.
- **Pagos administrativos (Cuadre Administrativo) ya NO pasan por el cuadre de caja** (desde oct-2026): se confirman en Cuadre Administrativo (ver 5.4). El cuadre de caja solo tiene la plata que trae el entregador; si un borrador viejo trae una línea de pago administrativo, el servidor la ignora.
- **Base de la comisión del cuadre** = Recibido. Hasta el 28-oct-2026 el cuadre agrupado usaba lo Entregado (sin cobros): esas comisiones **se dejan como quedaron**, y `/api/comisiones/recalcular` no toca los cuadres agrupados creados antes del 29-oct-2026. (Recalcular ya no usa `recepciones_caja`, que no existe: el individual se busca en `cuadres_caja`.) Cada pago administrativo confirmado deja su **propia fila de comisión** (sin cuadre, base = monto del pago); recalcular no la toca.
- Hay un trigger (`after_cuadre_eliminar_planillas`) que **borra los pedidos (y sus productos) al insertar el cuadre**. El detalle de qué pidió cada cliente solo existe mientras caja no cuadra. Desde el script `020` (aplicado) ese detalle se copia a `pedidos_archivo` / `pedido_productos_archivo` justo antes de borrarse.
- Al cerrar, un saldo de fiado **menor a $1 se cierra en 0** (los pagos son en pesos enteros y las facturas traen centavos).
- El cuadre agrupado carga solo los cobros que el entregador registró en ruta.

### 5.2 Fiados y abonos (`fiados`, `abonos_fiados`)
- Un abono apunta al fiado con `abonos_fiados.pedido_id = fiados.id` (como texto). `planilla_cobro_id IS NULL` = abono aún sin conciliar en un cuadre.
- Los fiados nunca se borran de la tabla: se marcan `eliminado = true` (soft delete). Solo los eliminados desde la creación de `eliminaciones_historial` aparecen en la pestaña **Eliminados** y se pueden restaurar.
- "Eliminar definitivamente" (pestaña Eliminados; solo coordinador/administrador) no permite borrar un fiado con abonos.
- La pantalla de Fiados muestra por defecto solo el mes actual y solo pendientes ("Mostrar pagados" y las fechas amplían).

### 5.3 Antifraude de referencias (`lib/validar-referencia.ts`)
- Una referencia de pago (Nequi, consignación…) **no puede usarse dos veces**. Se revisa en consignaciones, cobros (abonos), pagos anticipados y cuadres.
- Solo cuenta como referencia lo que tiene números (`esComprobante`). Un pago administrativo en efectivo no tiene comprobante: antes se enviaba la palabra "Efectivo" y el cierre agrupado se bloqueaba por un duplicado invisible. Al bloquear, el cierre dice en qué línea del cuadre está cada referencia.
- Al reintentar un cierre que se cayó a la mitad, los abonos que dejó ese intento (misma deuda, montos y referencia, sin cuadre) no cuentan como duplicado.
- Índice único `idx_abonos_fiados_referencia_por_deuda (referencia_pago, pedido_id)`: el mismo comprobante puede repartirse entre **varias deudas del mismo cliente**, pero no reutilizarse para otro.
- **Duplicado coherente:** mismo fiado + mismos montos + abono aún sin conciliar = es el mismo pago (no un fraude): se reutiliza en vez de crear otro. Así el entregador puede registrar en ruta y caja abrirlo sin que salga como duplicado.
- `pagos_anticipados.referencia` es **única**; para repartir un comprobante entre varias facturas, caja le agrega un sufijo a mano (`-1`, `-2`, `_`, `__`…: cualquiera vale).
- **Posible pago repetido** (`buscarPosiblePagoRepetido`, `lib/pago-administrativo.ts`): misma referencia base (sin sufijo ni símbolos, O leída como 0) + misma deuda + mismo monto que un pago ya confirmado o registrado antes. No se aplica solo: caja debe confirmar que es un pago distinto y queda anotado en el pago. Repartir entre deudas distintas no se marca.
- Si una consignación ya contada en un cuadre cerrado pertenece al mismo cliente, el botón "Aplicar este pago al fiado" (`/api/fiados/aplicar-pago-contado`) baja el fiado **sin volver a contar el efectivo**.

### 5.4 Cuadre Administrativo (`pagos_anticipados`, `components/pagos-anticipados-view.tsx`)
- Estados: `pendiente` → `identificado` (tiene fiado/pedido de asesor) → `vinculado` (en pantalla "Confirmado"). Bajar el saldo del fiado no depende de a quién le suma el cobro: si no se eligió, le suma a quien tiene el fiado (o al asesor del pedido). Al identificar (o al registrar con destino) se **confirma de una vez** (`lib/pago-administrativo.ts`): baja el fiado y crea el abono con la observación `OBSERVACION_PAGO_ADMINISTRATIVO_DIRECTO` a nombre del entregador, o marca entregado el pedido de asesor, y registra la comisión. Quien confirma está autorizado por quien cuadra caja.
- Si no se puede aplicar queda `identificado` con aviso y se confirma luego con el botón **Confirmar** (`/api/pagos-anticipados/[id]/confirmar`). Además, **al abrir Cuadre Administrativo se aplican solos** todos los `identificado` (`/api/pagos-anticipados/aplicar-pendientes`). Pagar de más **no** frena (decisión del dueño): el fiado queda en 0 y el abono guarda el monto completo. No se aplica si el fiado ya está pagado o eliminado, si es un posible pago repetido, o si el entregador ya registró en ruta un cobro igual (misma deuda y montos, sin cuadrar): puede ser el mismo pago anotado dos veces. Esos abonos directos nunca cuentan como "duplicado coherente" ni se precargan en el cuadre de caja.
- Si falla al aplicar, el pago vuelve a `identificado` (nunca queda confirmado sin bajar el fiado).
- Los asesores (Harold, Jensi, Edwin) no son entregadores: sus pedidos se cuadran por aquí. No tienen `comisiones_config`, así que el cobro les suma en el Resumen pero sin comisión.
- Nunca borres un pago administrativo "para quitar la alerta": se perdería un pago real. Se ajusta o se parte.

### 5.5 Consignaciones
- Cada consignación pertenece a un **pedido** o a un **cobro**. Si una consignación cubre ambos, se parte en dos líneas: valor del pedido y valor del cobro, con la referencia terminada en `-1`, `-2`.
- Las que el entregador registra en ruta traen vínculo al pedido (`origenConsignacionId`). Las grandes **sin cliente** son depósitos de efectivo del entregador al banco.
- Pendiente de construir: casilla "Pedido / Cobro / Depósito" en el cuadre y filtros en el Historial (ver sección 8).

### 5.6 Reasignación de pedidos y mercancía
- Al reasignar un pedido ya cargado a otra planilla, **el pedido y el dinero se mueven, la mercancía se queda en la planilla donde se cargó** (`pedidos.planilla_mercancia_id`; consultas usan `COALESCE(planilla_mercancia_id, planilla_id)`).
- Los pedidos en estado repaso no arrastran mercancía.

### 5.7 Alistador
- Un cronómetro por tarjeta de entregador, guardado en el servidor (`timer_inicio`, `timer_fin`, `timer_pausa`, `timer_segundos_pausados`); la pantalla calcula contra la hora del servidor. Pausar pide motivo y queda en `audit_log`.

- **Faltantes (pestaña Novedades del alistador):** filtros por entregador/estado/fechas/código; "Eliminar seleccionados" (`POST /api/faltantes/baja-en-bloque`) los pasa de `pendiente` a `definitivo` ("No se entregó") con motivo; no borra nada y se revierte con "Revertir". La lista de pendientes no tiene tope de 7 días.

### 5.8 Inventario (pestaña "Inventario" del administrador; tablas `inventario_*`, script 027)
- **Salida por producto:** cuando el alistador termina una planilla (`updatePlanillaEstado(..., "alistado")`) se guarda en `inventario_salidas` lo que salió, agrupado por código (pedido − faltante). No se borra al cuadrar caja. Solo cuentan pedidos `pendiente`; la mercancía es de `COALESCE(planilla_mercancia_id, planilla_id)`. El reemplazo del asesor queda en las observaciones como `REEMPLAZO POR: …`.
- **Carga de lo ya alistado:** el botón "Cargarlas ahora" (Inventario → Salidas) solo carga planillas alistadas del MES ACTUAL que no estén en ningún cuadre; lo anterior no se carga a propósito (el detalle de las ya cuadradas se perdió antes del script 020 y no debe simularse). El inventario base es la pestaña Salidas hasta que se sube el inventario del POS.
- **Códigos:** se guardan normalizados (mayúsculas, sin espacios, sin ceros a la izquierda en códigos numéricos). Misma regla en `lib/inventario.ts` y en el SQL de `lib/inventario-salidas.ts`; si cambias una, cambia la otra.
- **Archivos que sube el administrador** (se leen en UTF-8 o Windows-1252): catálogo/inventario del POS (11 columnas con ";": ubicación, código, nombre, categoría, cantidad, descripción del combo, precio, valor…), y CSV de ventas del POS (16 columnas). Los kits (códigos con letras o nombre con LLEVA/INCLUYE/PROMO) se identifican, pero su composición sigue siendo texto libre: el cruce es por el código facturado, no por componente.
- **Cruce de ventas:** diferencia = (facturado − devuelto en POS) − salió, por producto, y devoluciones en dinero (caja vs POS). Las devoluciones del POS se reconocen por cantidad/valor negativos (formato aún no confirmado con un archivo real).
- **Cruce de inventario:** ajuste sugerido para el POS = (facturado − devuelto) − salió (positivo suma al POS); los ajustes manuales (`inventario_ajustes`) se restan para no repetirlos. No incluye compras.

## 6. Mapa rápido del código
- `app/api/*`: rutas del servidor (`cuadres-caja`, `fiados`, `pagos-anticipados`, `planillas`, `pedidos/reasignar`, `faltantes`, `eliminaciones-historial`, `comisiones`…).
- `components/*-view.tsx`: una vista por rol; `caja-view.tsx` es la más grande y delicada (cuadre individual y agrupado, historial).
- `lib/db.ts` (cliente Neon), `lib/session.ts` (sesión por cookie), `lib/validar-referencia.ts`, `lib/eliminaciones-historial.ts`.
- `scripts/*.sql`: migraciones y correcciones manuales numeradas (registro de lo que se corrió en Neon).
- `docs/manual/guia-practica.html`: guía práctica por cargo (Entregador, Caja, Alistador, Coordinador, Administrador) con pantallas dibujadas y pasos numerados, pensada para la persona menos hábil. `docs/manual/index.html`: manual completo de referencia. **Si cambias una pantalla, un botón o un flujo, actualiza también la guía y el manual** (los nombres de botones deben coincidir con los de la pantalla).
- `docs/inventario-gerencia.md`: diseño original del inventario (se decidió construirlo DENTRO de este proyecto, ver 5.8).
- `lib/inventario.ts`, `lib/inventario-salidas.ts`, `lib/inventario-api.ts`, `app/api/inventario/*`, `components/inventario-view.tsx`: módulo de inventario.

## 7. Al recibir el proyecto (checklist de seguridad)
1. **Cambiar la contraseña de la base de datos de Neon** y actualizar `DATABASE_URL` en Vercel (la anterior circuló en conversaciones).
2. Cambiar las contraseñas de los usuarios administrador/maestro (el README trae credenciales de ejemplo `admin@distrisanty.com / admin123`; no deben seguir vigentes).
3. Confirmar quién tiene acceso al repositorio de GitHub, a Vercel y a Neon.
4. Verificar en Neon qué scripts de `scripts/` ya están aplicados (ver sección 3).

## 8. Pendientes conocidos
- **Inventario:** conseguir un CSV de ventas del POS que contenga una devolución para confirmar cómo las marca; subir el inventario real del POS (con cantidades) para el cruce de saldos; interpretar la composición de los kits.
- **Historial de cuadres:** ya existen el filtro por entregador y la pestaña **Resumen** (`components/resumen-entregador-view.tsx`, `/api/cuadres-caja/resumen`): por día Entregado (Esperado − cobros del cuadre), Cobros (del cuadre + pagos administrativos por fecha de confirmación), Descuadre y Devoluciones, solo informativos (no se suman entre sí), con total por columna y detalle de cada cobro. Solo muestra desde el **1-oct-2026**. Falta: desglose de billetes, monedas y consignaciones (pedido / cobro / depósito) y descarga a Excel.
- Casilla "Pedido / Cobro / Depósito" por consignación en el cuadre (y reparto con sufijo `-#`).
- Revisar ~60 abonos registrados directo por administración (sin entregador y sin cuadre; algunos de montos grandes) que no entran a ningún cuadre.
- Revisar los ~28 fiados históricos pagados de más (necesita verificación caso por caso con el dueño).
- Reemplazar los `BEGIN/COMMIT` falsos de `cuadres-caja/route.ts` por `sql.transaction` o un cliente con transacciones reales.
- Borrador del cuadre en `localStorage` (`cuadre_borrador_<entregador>`) caduca a las 24 h.
- Posible fiado antiguo mal eliminado: hay ~700 fiados con `eliminado = true` de mayo a septiembre que no aparecen en la pestaña Eliminados (se eliminaron antes de existir el historial); restaurar solo con confirmación del dueño.
