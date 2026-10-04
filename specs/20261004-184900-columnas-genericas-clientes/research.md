# Research: Estado, contacto y borrado restringido de clientes

## Evidencia del producto derivado

Repo `estudio-contable-automation` (Nexo Contable), rama
`normalizar-esquema-supabase`, spec `specs/20261004-021644-identidad-clientes-dominio/`:

- `supabase/migrations/20261004130000_clientes_cartera.sql` (commits
  `b6ed3aa` y `5590754`): agrega a `public.clientes` `cuit`,
  `nombre_fantasia`, `estado` (`activo`/`inactivo`), `email_contacto`,
  `telefono_contacto`, `observaciones`, `sistema_origen` y `updated_at`;
  checks de largo y formato; trigger `private.preparar_cliente()` (normaliza
  textos y fija fechas); trigger `private.proteger_origen_cliente()`;
  `private.motivo_cliente_no_borrable(uuid)`, `dominio.cliente_es_borrable(uuid)`
  y `dominio.borrar_cliente(uuid)`, sin grant de `DELETE`.
- Commit `5590754` ("Fijar en la base las fechas de alta y modificación de
  clientes"): hallazgo de la revisión `authz-security` (T018), "una sesión de
  la API podía mandar created_at/updated_at arbitrarios en el alta". Desde
  entonces `updated_at` se fija siempre y `created_at` en las altas de
  `authenticated`/`anon`; una restauración como `postgres` conserva el suyo.
- `private.motivo_cliente_no_borrable` se redefinió con `create or replace`
  tres veces: en `20261004130000_clientes_cartera.sql`,
  `20261004150000_clientes_empresas_sistema.sql` (commit `a1b2810`) y
  `20261004160000_identidad_cliente_configuracion.sql`. Cada redefinición
  copia la lista anterior de tablas y le suma una. Su reversión dice
  "create or replace ... -- versión de 20261004130000".
- `research.md` de esa spec, R6 (columnas: genéricas `estado`/contacto/
  observaciones, de negocio el CUIT y el origen), R10 (origen y borrado) y R11
  (fuentes de clientes).
- `docs/wiki/portback-template.md`, "Candidatos de la spec
  identidad-clientes-dominio" (commit `80407ad`).

## Estado del template

`public.clientes` (`20260908172920_fundacion_multitenant.sql`): `id`,
`organizacion_id`, `nombre`, `created_at`. RLS de select/insert/update por
organización y `private.puede_escribir()`. Grant `select, insert, update` a
`authenticated`, sin `DELETE`: hoy no hay forma de borrar un cliente ni de
darlo de baja. `created_at` tiene `default now()` pero la API puede enviarlo.

## Decisión 1: qué se porta y qué no

| Pieza | Destino | Motivo |
|---|---|---|
| `estado`, `email_contacto`, `telefono_contacto`, `observaciones`, `updated_at` | template | cualquier cartera las necesita |
| Fechas fijadas por la base | template | hallazgo de seguridad; el template tiene el mismo hueco |
| Borrado restringido + motivo | template | ciclo de vida genérico |
| `cuit`, `private.cuit_valido`, `nombre_fantasia` | producto | regla fiscal argentina |
| `sistema_origen`, protección de razón social | producto | depende de cómo el producto trae clientes |
| Catálogo de fuentes de clientes | producto (ver Decisión 5) | — |

`nombre_fantasia` queda en el producto: su significado ("nombre comercial
distinto de la razón social") presupone que `nombre` es la razón social, que
es una decisión del producto.

## Decisión 2: motivo de no borrado por claves foráneas + punto de extensión

**Decision**: `private.motivo_cliente_no_borrable(uuid)` del template
recorre `pg_constraint` buscando las FK que apuntan a `public.clientes` y,
para cada una, verifica con SQL dinámico si existe alguna fila con ese
cliente; si existe, devuelve `datos_asociados`. Antes consulta
`private.motivo_cliente_no_borrable_producto(uuid)`, que el template define
devolviendo `null` y cada producto reemplaza con su propia migración.

**Rationale**: en el producto, cada tabla nueva obligó a redefinir la función
entera copiando la lista anterior (tres veces en un día). Con las FK, una
tabla nueva que referencia a `clientes` bloquea el borrado sin que nadie la
registre. El punto de extensión queda para los motivos que no son una
referencia (en el producto, `origen_externo`: lo trajo un sistema). Así el
producto no reescribe la función del template.

**Alternatives considered**:

- Lista fija de tablas (lo del producto): descartado por lo de arriba.
- Tabla de registro de funciones de motivo, que la función recorre:
  descartado por ahora. Varios módulos de un mismo producto pueden componer
  sus motivos dentro de su único punto de extensión; se reconsidera si dos
  capacidades del template necesitan sumar motivos.
- Confiar en `on delete restrict` de cada FK: descartado. Las FK de la
  plataforma son `cascade` (por ejemplo, `clientes_identificadores_externos`)
  y el error de Postgres no sirve para preguntar "¿es borrable?" antes de
  ofrecer la acción.

**Detalle**: solo se consideran FK de una columna hacia `clientes(id)`; una FK
compuesta futura se trata igual usando la columna que apunta a `id`. La
función es `security definer` con `search_path = ''` y cita los
identificadores con `format('%I.%I')`.

## Decisión 3: fechas con una función de trigger reutilizable

**Decision**: `private.fijar_fechas_auditoria()`, genérica (`created_at`,
`updated_at`), aplicada a `clientes` por esta spec. `updated_at := now()`
siempre; en `UPDATE`, `created_at := old.created_at`; en `INSERT` de
`authenticated`/`anon`, `created_at := now()`.

**Rationale**: es la regla del commit `5590754`, sin acoplarla a `clientes`;
otras tablas pueden adoptarla después. Se decide por `current_user` (que un
cliente de PostgREST no puede cambiar), igual que el producto.

## Decisión 4: operaciones en `public`

**Decision**: `public.cliente_es_borrable(uuid) returns boolean` y
`public.borrar_cliente(uuid) returns void`, `security definer`, con las
mismas reglas que las del producto: `42501` sin permiso, `P0002` si no
existe o es de otra organización (no se distinguen), `P0001` con el motivo
en `detail` si no es borrable. `borrar_cliente` toma `for update` la fila del
cliente para serializar contra un alta concurrente de una fila que lo
referencie.

**Rationale**: el template no pone RPCs de plataforma en `dominio`. Mismas
semánticas que el producto para que su adopción sea un cambio de esquema,
no de comportamiento.

## Decisión 5: catálogo de fuentes de clientes — no se porta

**Decision**: no entra en el template.

**Rationale**: la parte genérica ya existe en el template: una "fuente" es una
capacidad (`capacidades_ejecucion`) que se dispara con
`iniciar_ejecucion_worker` y se despacha por el outbox. Lo que agrega el
producto (`dominio.fuentes_clientes` con `clave_capacidad` y
`sistema_externo`, y `dominio.traer_clientes()` que dispara todas las
habilitadas) es una composición delgada sobre eso, con sentido solo si un
producto trae su cartera desde un sistema externo. Hoy hay un solo caso (SOS
Contador en Nexo Contable). Si aparece un segundo producto que lo necesite,
la forma genérica sería "agrupar capacidades por propósito" (una etiqueta en
el catálogo de capacidades y una RPC que dispare todas las habilitadas de esa
etiqueta), no una tabla específica de clientes.

## Cómo vuelve al producto

1. El producto ya tiene las columnas con los mismos nombres. Adopta
   selectivamente: la función de fechas genérica (reemplaza la parte de
   fechas de `private.preparar_cliente`), el motivo por FK y su punto de
   extensión (su `motivo_cliente_no_borrable` pasa a ser
   `motivo_cliente_no_borrable_producto` y devuelve solo `origen_externo`; las
   referencias desde `dominio.*` las detectan las FK). Sus RPCs de `dominio`
   pueden delegar en las de `public` o quedar como alias.
2. La migración del template se trae como migración nueva del producto, con
   `add column if not exists` para las columnas que ya tiene.
3. `template-adoption.json`: capacidad nueva `clientes-ciclo-de-vida` con la
   evidencia (pgTAP de clientes verde y la pantalla probada).
4. Log en `docs/wiki/sistemas/sincronizacion-template.md` y candidato marcado
   como "llevado" en `docs/wiki/portback-template.md`.

No es un `git merge upstream/main`: ese merge solo aplica a
`docs/roadmap-template.md`.
