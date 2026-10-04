# Research: Identificadores externos únicos por organización y entidades pendientes

## Evidencia del producto derivado

Repo `estudio-contable-automation` (Nexo Contable), rama
`normalizar-esquema-supabase`, spec `specs/20261004-021644-identidad-clientes-dominio/`:

- `research.md`, R7 ("Asociación recordada por organización: tabla de
  producto, DEP-001 no bloquea"): `public.clientes_identificadores_externos`
  (en el producto, `20260930180100_mapeo_identificadores_clientes.sql`, copia
  sin cambios del template) tiene unicidad **global** `(sistema,
  identificador_externo)` y `cliente_id not null`. La asociación del producto
  necesita clave por organización y una empresa "sin cliente todavía"
  (Pendiente de CUIT). Se resolvió con la tabla de producto
  `dominio.empresas_sistema` (`organizacion_id`, `sistema`,
  `identificador_externo`, `id_en_sistema`, `cliente_id null`,
  `unique (organizacion_id, sistema, identificador_externo)`), y la tabla de
  plataforma quedó sin uso.
- `supabase/migrations/20261004150000_clientes_empresas_sistema.sql` (commit
  `a1b2810`): la tabla, `dominio.resolver_empresa_sistema(...)` (upsert con
  lock por clave, para el rol del worker), `dominio.asignar_cuit_empresa`,
  `dominio.desasociar_empresa` y la vista de pendientes.
- `docs/wiki/portback-template.md`, "Defecto de
  `public.clientes_identificadores_externos` (DEP-001)" (commit `80407ad`):
  "El arreglo en el template: unicidad `(organizacion_id, sistema,
  identificador_externo)` y evaluar `cliente_id` nullable".
- `template-adoption.json` del producto (`main`): `mapeo-identificadores-externos`
  1.0.0 adoptada "sin cambios respecto del original".

## Estado del template

`supabase/migrations/20260930140000_mapeo_identificadores_clientes.sql`:

- `unique (sistema, identificador_externo)` global.
- Sin `organizacion_id` propio a propósito (Decisión 2 de
  `specs/20260930-135541-mapeo-identificadores-clientes/research.md`): se
  resolvía vía `cliente_id` para que no pudiera desincronizarse.
- `vincular_identificador_externo` hace `on conflict (sistema,
  identificador_externo) do nothing`; si el par ya existe con otro cliente,
  falla con `23505` "El identificador externo ya está vinculado a otro
  cliente", aunque ese cliente sea de otra organización. Es una fuga de
  información entre organizaciones además de un bloqueo funcional.

## Decisión 1: corregir la tabla, no reemplazarla

**Decision**: la tabla existente gana `organizacion_id`, unicidad por
organización y `cliente_id` opcional. No se crea una tabla nueva.

**Rationale** (criterio plataforma frente a producto):

- **Qué es genérico**: "en esta organización, el identificador X del sistema
  S corresponde al cliente C, o todavía a ninguno". No depende de CUIT, de
  libros contables ni de cómo se resuelve la asociación. Es exactamente la
  forma de `dominio.empresas_sistema` sin sus columnas de negocio.
- **Qué es de negocio** y se queda en el producto: el texto `empresa` de sus
  libros como clave, `id_en_sistema`, la resolución por CUIT, completar
  `cliente_id` en `dominio.*` al asociar y la configuración por empresa.
- Reemplazar la tabla dejaría dos conceptos iguales en el template durante la
  transición (la vieja adoptada por los productos y la nueva), sin ganancia:
  la tabla actual no tiene consumidores reales (el producto no la usa) y su
  nombre y contrato ya están versionados como capacidad.
- Permitir pendientes no cambia lo que la tabla representa ("identificadores
  externos de clientes"); amplía el ciclo de vida: un identificador puede
  existir antes que su cliente. Sin eso, todo producto que descubra entidades
  en un sistema antes de poder asociarlas va a construir su propia tabla,
  como pasó.

**Alternatives considered**:

- Solo unicidad por organización, `cliente_id` sigue obligatorio: corrige el
  defecto de aislamiento pero deja la tabla inservible para el único caso real
  conocido. Descartado.
- Tabla genérica nueva (por ejemplo, `entidades_sistema`) y deprecar la
  actual: descartado por lo de arriba.
- Dejarlo como está y que cada producto use su tabla: descartado. El defecto
  de aislamiento es de la plataforma y hay que arreglarlo igual.

## Decisión 2: `organizacion_id` propio con clave foránea compuesta

**Decision**: `organizacion_id uuid not null references organizaciones`, y
`foreign key (cliente_id, organizacion_id) references clientes (id,
organizacion_id) on delete cascade`, con un `unique (id, organizacion_id)`
nuevo en `clientes`.

**Rationale**: revierte la Decisión 2 de la spec original, pero conserva su
objetivo (que un vínculo no pueda apuntar a un cliente de otra organización)
por construcción y sin trigger. Con `cliente_id` nulo, la FK compuesta no se
evalúa (`MATCH SIMPLE`) y el pendiente queda atado solo a su organización.
Hace falta porque un pendiente no tiene cliente del cual heredar la
organización.

## Decisión 3: unicidad por organización

**Decision**: `unique (organizacion_id, sistema, identificador_externo)`; se
elimina la restricción global en la misma migración.

**Rationale**: FR-001. El `on conflict` de las funciones pasa a esa clave, así
que un conflicto solo puede encontrar filas de la misma organización (FR-004,
SC-002).

## Decisión 4: registración para el rol técnico

**Decision**: `public.registrar_identificador_externo(p_organizacion_id,
p_sistema, p_identificador_externo, p_nombre_en_sistema)` devuelve
`cliente_id` (o `null` si está pendiente). `security definer`, autoriza si
`p_organizacion_id = private.organizacion_del_rol_actual()` (rol del worker)
o si quien llama es administrador de esa organización. Serializa por clave con
`pg_advisory_xact_lock`; upsert que no pisa un `cliente_id` existente y
actualiza `nombre_en_sistema` si viene. `execute` a `workers_orquestacion`
(los roles `worker_*` son miembros) y a `authenticated`.

**Rationale**: es la parte genérica de `dominio.resolver_empresa_sistema` del
producto, sin la resolución por CUIT.

## Decisión 5: asignar y desasignar

**Decision**: `vincular_identificador_externo` (existente, misma firma) asigna
un pendiente de la misma organización en vez de fallar.
`public.desasignar_identificador_externo(p_id)` vuelve un vínculo a pendiente
(administrador). `desvincular_identificador_externo` sigue borrando la fila.

**Rationale**: FR-004 conserva el contrato existente; la operación nueva
cubre "volver a pendiente" sin perder la entidad.

## Decisión 6: `sistema` sigue siendo texto

**Decision**: no se ata a `sistemas_externos` en esta spec.

**Rationale**: cambio aparte; el producto ya tiene valores cargados y la FK
debería entrar `not valid`, como hizo la spec del catálogo.

## Reversión

1. Si existen pendientes, borrarlos (`delete ... where cliente_id is null`):
   se pierden.
2. Si un mismo `(sistema, identificador_externo)` existe en dos
   organizaciones, la unicidad global no se puede restaurar sin borrar uno:
   la reversión se detiene y lo informa.
3. `drop` de las funciones nuevas, restaurar el cuerpo original de
   `vincular_identificador_externo`, `cliente_id set not null`, quitar la FK
   compuesta, `organizacion_id` y el `unique (id, organizacion_id)` de
   `clientes`, y volver a crear la restricción global.

## Cómo vuelve al producto

1. Adopción selectiva: el producto trae la migración nueva (con una versión
   libre de su árbol) y la prueba pgTAP actualizada. No tiene datos en la
   tabla de plataforma, así que la migración aplica sin backfill real.
2. Opcional, en una spec propia del producto: migrar la parte genérica de
   `dominio.empresas_sistema` a esta tabla y dejar en `dominio` solo lo de
   negocio. No es requisito de la adopción.
3. `template-adoption.json`: `mapeo-identificadores-externos` sube a la
   versión mayor nueva, con la evidencia de pgTAP en su stack.
4. Log en `docs/wiki/sistemas/sincronizacion-template.md` y candidato DEP-001
   marcado como "llevado" en `docs/wiki/portback-template.md`.

No es un `git merge upstream/main`: ese merge solo aplica a
`docs/roadmap-template.md`.
