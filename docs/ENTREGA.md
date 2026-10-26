# Entrega del proyecto Distrilogística — guía para quien lo recibe

Este documento explica cómo recibir el proyecto y seguir trabajándolo con Claude Code, de la misma
forma en que se construyó. La "memoria" del proyecto vive en el archivo `CLAUDE.md` de la raíz del
repositorio: Claude Code lo lee solo cada vez que se abre dentro de esta carpeta. No hay nada que
instalar en la cuenta de Claude.

## 1. Accesos que hay que traspasar
1. **GitHub:** transferir el repositorio a la cuenta del dueño (Settings → Danger Zone → Transfer) o
   agregarlo como colaborador con permiso de escritura.
2. **Vercel:** el dueño debe ser miembro o propietario del proyecto. La única variable de entorno que
   usa la app es `DATABASE_URL`.
3. **Neon (base de datos):** el dueño debe ser miembro o propietario del proyecto.
4. **Seguridad (hacerlo antes de entregar):**
   - Cambiar la contraseña de la base de datos en Neon y actualizar `DATABASE_URL` en Vercel.
   - Cambiar las contraseñas de los usuarios administrador de la app.
   - Verificar quién más tiene acceso a GitHub, Vercel y Neon.

## 2. Instalación en el computador de la persona encargada
Requisitos: Git, Node.js, pnpm y Claude Code instalados.

```bash
git clone https://github.com/CUENTA/distrilogistica.git
cd distrilogistica
pnpm install
```

Opcional, para que Claude pueda **consultar datos reales**: crear el archivo `.env.local` en la raíz con

```
DATABASE_URL=la-conexion-de-solo-lectura
```

Recomendación: crear en Neon un usuario nuevo **de solo lectura** para esto. El archivo `.env.local` está
ignorado por git y nunca se sube. Los cambios en la base de datos de producción los corre una persona a
mano en el editor SQL de Neon, con los scripts de la carpeta `scripts/`.

Para trabajar, abrir la terminal en la carpeta del proyecto y ejecutar:

```bash
claude
```

## 3. Primera sesión (comprobar que la memoria cargó)
Pegar este mensaje una sola vez:

```
Lee CLAUDE.md completo antes de hacer nada. Después resúmeme en 10 líneas: qué hace
el sistema, cómo se calcula el Esperado y el Recibido en el cuadre de caja, y cómo
se cambian los datos de producción. Habla en español sencillo. No modifiques nada
ni hagas commit hasta que te lo pida.
```

La respuesta debe mencionar las cuentas del cuadre, que los fiados no se borran (se marcan como
eliminados) y que los cambios a la base se hacen con scripts SQL numerados que corre una persona en Neon.

## 4. Cómo se trabaja día a día
- Se le pide a Claude lo que se necesita en español normal ("necesito que el historial se pueda filtrar por
  entregador"). Claude revisa el código y los datos, hace el cambio y explica qué hizo.
- Si se quiere **solo revisar sin tocar nada**, decirlo: "revisa y responde, no ejecutes nada".
- Claude **no sube nada a GitHub** hasta que se le pide ("haz commit y push"). Cada push a `main` despliega
  en Vercel.
- Si el cambio necesita tocar datos de producción, Claude deja un script en `scripts/` (con el siguiente
  número libre), lo valida y explica qué hace. La persona lo corre en Neon.
- Después de un cambio de reglas de negocio, pedir: "actualiza CLAUDE.md con esto y súbelo". Así la
  memoria sigue creciendo con el proyecto.

## 5. Qué leer primero
1. `CLAUDE.md` — reglas del negocio, trampas técnicas, pendientes conocidos.
2. `docs/manual/guia-practica.html` — guía práctica por cargo (la que se reparte al personal) y `docs/manual/index.html` — manual completo de referencia. Se abren en el navegador y se pueden imprimir como PDF.
3. `docs/inventario-gerencia.md` — diseño original del módulo de inventario.
4. `scripts/` — historial de cambios a la base de datos (cada archivo explica qué hizo y por qué).
