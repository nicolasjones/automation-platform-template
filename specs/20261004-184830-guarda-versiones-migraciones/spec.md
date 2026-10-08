# Feature Specification: Guarda de versiones únicas de migraciones

**Feature Branch**: `guarda-versiones-migraciones`

**Created**: 2026-10-04

**Status**: Draft

**Delivery scope**: supabase (tooling de migraciones y CI; sin migraciones nuevas)

**Input**: Pedido de port-back desde el producto derivado (Nexo Contable, PR #26): "`scripts/verificar-versiones-migraciones.mjs` con su test, `pnpm migrations:check` y un paso en `validate.yml`. Motivo: la CLI de Supabase identifica cada migración por versión, y el CI del producto aplica las migraciones con psql, por eso no lo detectaba. Especificá traerlo al template, incluida la llamada desde `scripts/reset-db-ci.mjs` que en el producto no se pudo hacer porque ese archivo es una capacidad adoptada del template."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un PR con dos migraciones de la misma versión no pasa el CI (Priority: P1)

Quien trabaja en paralelo en varias specs (worktrees distintos) elige el timestamp de su migración sin ver las de las otras ramas. Si dos archivos de `supabase/migrations/` terminan con la misma versión, el PR que los junta tiene que fallar antes de mergear, no después, cuando la CLI de Supabase se niega a aplicar.

**Why this priority**: pasó en el producto con tres specs paralelas (chat IA, MCP, RAG): dos pares de archivos con la misma versión entraron a `main` con el CI verde y bloquearon `supabase migration up` y `db push`. El template tiene el mismo punto ciego: su job `database` aplica los archivos con `psql` en orden alfabético y nunca pasa por la CLI.

**Independent Test**: en una rama de prueba, duplicar el prefijo de versión de una migración existente y correr `pnpm migrations:check`: sale con código distinto de cero y nombra los dos archivos. Con los nombres corregidos, sale con cero.

**Acceptance Scenarios**:

1. **Given** dos archivos `.sql` en `supabase/migrations/` con el mismo prefijo de versión, **When** corre la guarda, **Then** falla y lista la versión y ambos archivos.
2. **Given** un `.sql` cuyo nombre no sigue `<version>_<nombre>.sql`, **When** corre la guarda, **Then** falla nombrando el archivo.
3. **Given** versiones únicas, **When** corre la guarda, **Then** termina sin error.
4. **Given** un PR con versiones duplicadas, **When** corre el workflow de validación, **Then** el job falla en el paso de la guarda.

---

### User Story 2 - El reset de base del CI tampoco aplica migraciones con versión repetida (Priority: P2)

Quien corre el reset de la base del CI (o cualquier camino que aplique las migraciones por `psql`) recibe el mismo error que daría la CLI, en vez de aplicar los archivos en silencio.

**Why this priority**: el paso del workflow ya bloquea el PR (US1); esta llamada cierra el mismo hueco para quien corre el reset a mano y para cualquier workflow futuro que lo use sin el paso previo. En el producto no se pudo hacer porque `scripts/reset-db-ci.mjs` pertenece a capacidades adoptadas del template y tocarlo exigía subir su versión sin un cambio del template que lo respalde: corresponde hacerlo acá.

**Independent Test**: con dos versiones duplicadas en `supabase/migrations/`, correr el reset de la base del CI: falla antes de aplicar la primera migración, con el mismo mensaje de la guarda.

**Acceptance Scenarios**:

1. **Given** versiones duplicadas, **When** corre el reset de la base del CI, **Then** falla antes de tocar la base (no borra el esquema ni aplica nada).
2. **Given** versiones únicas, **When** corre el reset, **Then** se comporta exactamente como hoy.

### Edge Cases

- Archivos que no terminan en `.sql` (un `README.md` en la carpeta) se ignoran.
- La guarda solo mira nombres de archivo; no lee ni valida el SQL.
- No verifica el orden de dependencias entre migraciones: renombrar para resolver un duplicado sigue siendo una decisión de quien lo resuelve (la salida de la guarda lo recuerda).
- Una colisión entre una migración ya aplicada en un entorno remoto y una nueva con la misma versión en otra rama solo se detecta cuando ambas conviven en la misma rama; la guarda no consulta entornos remotos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El template DEBE tener una guarda que falle si dos archivos `.sql` de `supabase/migrations/` comparten versión (prefijo numérico antes del primer `_`) o si un `.sql` no sigue el formato `<version>_<nombre>.sql`.
- **FR-002**: La guarda DEBE poder correrse sola con un comando del repo (`pnpm migrations:check`) y su salida DEBE nombrar cada versión duplicada con sus archivos.
- **FR-003**: La lógica DEBE ser una función pura (lista de nombres → lista de problemas) con pruebas automáticas, incluido el caso real del producto (dos pares duplicados) y una prueba contra el directorio real del repo.
- **FR-004**: El workflow de validación DEBE correr la guarda en cada PR, antes de los pasos que tardan más.
- **FR-005**: El reset de la base del CI DEBE invocar la misma guarda (no una copia) antes de modificar la base y abortar si encuentra problemas.
- **FR-006**: Las capacidades del template cuyos archivos cambian DEBEN subir su versión en `template-capabilities.json`, y la guarda DEBE quedar registrada como parte de una capacidad para que los productos derivados la adopten de forma versionada.
- **FR-007**: La convención (una versión única por migración, cómo elegir una libre al trabajar en paralelo) DEBE quedar documentada donde el template explica cómo escribir migraciones.

### Key Entities

- Sin entidades de datos. Archivos: la guarda, su prueba, el script del reset y el workflow de validación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un PR que introduce una versión duplicada falla en CI el 100 % de las veces, en el paso de la guarda.
- **SC-002**: El reset de la base del CI con una versión duplicada termina con error sin haber aplicado ninguna migración.
- **SC-003**: Con el árbol actual del template, la guarda pasa y el resto del CI no cambia de resultado.
- **SC-004**: Un producto derivado puede adoptar la capacidad reemplazando su copia local por la del template sin cambios de comportamiento (el producto origen ya tiene el mismo script).

## Assumptions

- El código del producto (`scripts/verificar-versiones-migraciones.mjs` y su test, PR #26 de `estudio-contable-automation`) se trae tal cual salvo los comentarios que nombran PRs del producto, que se reescriben en términos del template.
- La CLI de Supabase sigue usando el prefijo numérico como clave de `supabase_migrations.schema_migrations`.
