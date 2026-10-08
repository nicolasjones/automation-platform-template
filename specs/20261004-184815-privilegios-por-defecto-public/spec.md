# Feature Specification: Privilegios por defecto acotados en los esquemas expuestos

**Feature Branch**: `privilegios-por-defecto-public`

**Created**: 2026-10-04

**Status**: Draft

**Delivery scope**: supabase

**Input**: Pedido de port-back desde el producto derivado (Nexo Contable): "En las tablas creadas por `postgres` en `public`, Supabase otorga `TRUNCATE`, `REFERENCES` y `TRIGGER` a `anon` y `authenticated` vía default privileges. Se verificó en vivo en `public.clientes`. RLS no cubre `TRUNCATE`. PostgREST no lo expone, pero conviene revocarlo, con default privileges corregidos y una prueba pgTAP que lo fije."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Las tablas existentes dejan de otorgar privilegios que RLS no controla (Priority: P1)

Quien opera la plataforma necesita que ningún rol de la API (`anon`, `authenticated`) conserve sobre las tablas ya creadas privilegios que RLS no filtra (`TRUNCATE`) o que no tienen uso en esta plataforma (`REFERENCES`, `TRIGGER`, `MAINTAIN`). Hoy los tiene en toda tabla de `public` creada por `postgres`, aunque nadie se los haya otorgado explícitamente.

**Why this priority**: es el estado real de hoy. `TRUNCATE` vacía una tabla entera sin pasar por ninguna policy; que PostgREST no lo exponga es la única barrera. Si mañana un rol de la API obtiene acceso SQL (una función `security invoker` mal escrita, una conexión directa con el JWT, un cambio de PostgREST), la defensa en profundidad tiene que estar en la base.

**Independent Test**: en un stack local levantado con la CLI (no en el CI, ver Edge Cases), consultar los privilegios efectivos de `anon` y `authenticated` sobre `public.clientes` antes y después de aplicar la migración: antes aparecen `TRUNCATE`, `REFERENCES` y `TRIGGER`; después, solo los que otorgan las migraciones explícitamente (`SELECT`, `INSERT`, `UPDATE` para `authenticated`, nada para `anon`).

**Acceptance Scenarios**:

1. **Given** una tabla de `public` creada por una migración anterior, **When** se aplica la migración de esta spec, **Then** ni `anon` ni `authenticated` tienen `TRUNCATE`, `REFERENCES`, `TRIGGER` ni `MAINTAIN` sobre ella.
2. **Given** una tabla con `grant select, insert, update ... to authenticated` explícito, **When** se aplica la migración, **Then** esos privilegios explícitos se conservan intactos.
3. **Given** el rol `service_role`, **When** se aplica la migración, **Then** sus privilegios no cambian (es un rol de backend que ya ignora RLS; fuera de alcance).

---

### User Story 2 - Las tablas nuevas nacen sin esos privilegios (Priority: P1)

Quien escribe una migración nueva en `public` o `dominio` no tiene que acordarse de revocar nada: la tabla nace solo con lo que la migración otorga explícitamente.

**Why this priority**: sin esto, US1 se vuelve a romper con la próxima tabla. El producto derivado ya tuvo que revocar a mano en cada tabla nueva de `dominio` (`revoke all ... from anon, authenticated`), que es exactamente el olvido que esta spec elimina.

**Independent Test**: crear una tabla de prueba como `postgres` en `public` (dentro de una transacción que se revierte) y verificar que `anon` y `authenticated` no tienen ningún privilegio sobre ella.

**Acceptance Scenarios**:

1. **Given** la migración aplicada, **When** `postgres` crea una tabla en `public`, **Then** `anon` y `authenticated` no tienen ningún privilegio sobre ella hasta que una migración los otorgue.
2. **Given** la migración aplicada, **When** `postgres` crea una tabla en `dominio`, **Then** se cumple lo mismo.

---

### User Story 3 - Una invariante automática impide la regresión (Priority: P2)

Quien mantiene la plataforma tiene una prueba que falla si cualquier tabla, vista o tabla particionada de un esquema expuesto otorga `TRUNCATE`, `REFERENCES`, `TRIGGER` o `MAINTAIN` a `anon` o `authenticated`, o si los default privileges de `postgres` en esos esquemas vuelven a incluirlos.

**Why this priority**: US1 y US2 corrigen el estado; esta prueba lo fija. Es P2 porque sin US1/US2 no hay nada que fijar.

**Independent Test**: en una transacción, otorgar `truncate` a `anon` sobre una tabla y correr la aserción: debe fallar. Revertir y correrla de nuevo: debe pasar.

**Acceptance Scenarios**:

1. **Given** el esquema migrado, **When** corre la suite pgTAP, **Then** la invariante pasa.
2. **Given** una migración futura que haga `grant truncate ... to authenticated`, **When** corre la suite pgTAP, **Then** la invariante falla nombrando la tabla y el privilegio.
3. **Given** el job `database` del CI, que reconstruye `public` con `psql`, **When** corre la invariante, **Then** el CI parte del mismo estado de default privileges que un stack de Supabase real (ver FR-006), de modo que la prueba no pase en vacío.

### Edge Cases

- **El CI no reproduce el hueco hoy.** `scripts/reset-db-ci.mjs` hace `drop schema public cascade; create schema public;`, y al recrear el esquema se pierden los default privileges que Supabase había configurado para `public`. Verificado el 2026-10-04: en el stack del CI del template, `public.clientes` no tiene `TRUNCATE` para nadie salvo `postgres`, mientras que en un stack levantado por la CLI sí lo tiene. Una invariante que solo se corra en el CI pasaría en vacío.
- **Tablas creadas por `supabase_admin` en `public`** (algunas extensiones lo hacen): sus default privileges otorgan todo a `anon`/`authenticated` y `postgres` no puede modificarlos. La invariante de US3 las detecta igual, porque mira privilegios efectivos, no solo default privileges; si aparece una, se revoca explícitamente en su propia migración.
- **Secuencias**: los default privileges de `postgres` en `public` también otorgan `UPDATE` sobre secuencias a `anon`/`authenticated` (permite `nextval`/`setval`). Quedan fuera de alcance: revocarlo puede romper inserts en tablas con columnas `serial`. Se documenta como pendiente evaluado.
- **Funciones**: el `EXECUTE` a `PUBLIC` por defecto en funciones nuevas ya se revoca función por función en las migraciones; fuera de alcance.
- **`MAINTAIN`** (Postgres 17): forma parte del mismo default (`m` en `pg_default_acl`), aunque `information_schema` no lo muestre. Se revoca junto con los otros tres.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Una migración DEBE revocar `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN` de `anon` y `authenticated` sobre todas las tablas, vistas, vistas materializadas y tablas particionadas existentes de `public` y `dominio`.
- **FR-002**: La misma migración DEBE corregir los default privileges de `postgres` en `public` y `dominio` para que las tablas nuevas no otorguen esos privilegios a `anon` ni `authenticated`.
- **FR-003**: La migración NO DEBE modificar privilegios otorgados explícitamente (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) ni los de `service_role` y `postgres`.
- **FR-004**: La migración DEBE ser idempotente: aplicarla sobre una base donde esos privilegios ya no existen no falla.
- **FR-005**: DEBE existir una prueba pgTAP que falle si alguna relación de `public` o `dominio` otorga `TRUNCATE`, `REFERENCES`, `TRIGGER` o `MAINTAIN` a `anon` o `authenticated`, o si los default privileges de `postgres` en esos esquemas los incluyen para esos roles.
- **FR-006**: El reset de base del CI DEBE conservar o reconstruir los default privileges de Supabase para `public` al recrear el esquema, de forma que la prueba de FR-005 verifique el mismo estado que un stack real y no pase en vacío.
- **FR-007**: La reversión DEBE quedar documentada en el encabezado de la migración: volver a otorgar los privilegios y los default privileges que tenía Supabase.
- **FR-008**: La convención ("las tablas nuevas nacen sin privilegios para los roles de la API; se otorga solo lo necesario") DEBE quedar documentada donde el template documenta cómo escribir migraciones.

### Key Entities

- Sin entidades nuevas. Cambia el catálogo de privilegios de Postgres (`pg_class.relacl`, `pg_default_acl`) para `anon` y `authenticated`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En un stack local levantado con la CLI, 0 relaciones de `public` y `dominio` otorgan `TRUNCATE`, `REFERENCES`, `TRIGGER` o `MAINTAIN` a `anon` o `authenticated` después de la migración.
- **SC-002**: Una tabla creada después de la migración, sin grants explícitos, otorga 0 privilegios a `anon` y `authenticated`.
- **SC-003**: La invariante pgTAP falla cuando se inyecta el privilegio en una transacción y pasa sin él, tanto en el stack local como en el job `database` del CI.
- **SC-004**: El resto de la suite pgTAP y las pruebas de la web siguen pasando sin cambios: ningún flujo de la API dependía de esos privilegios.

## Assumptions

- PostgREST no expone `TRUNCATE`, así que esto no cierra un hueco explotable hoy desde la API; es defensa en profundidad.
- `auto_expose_new_tables = false` (en `supabase/config.toml`) ya evita los `SELECT`/`INSERT`/`UPDATE`/`DELETE` por defecto; lo que queda son los cuatro privilegios de esta spec. Verificado el 2026-10-04 en `pg_default_acl` de un stack local: `anon=Dxtm`, `authenticated=Dxtm` para tablas de `postgres` en `public`.
- Supabase Cloud aplica los mismos default privileges que el stack local de la CLI. Se verifica en staging antes de cerrar la spec (ver quickstart).
