---

description: "Task list for privilegios-por-defecto-public"
---

# Tasks: Privilegios por defecto acotados en los esquemas expuestos

**Input**: Design documents from `specs/20261004-184815-privilegios-por-defecto-public/`

## Phase 1: Setup — que el CI pruebe el estado real (bloquea las demás)

- [ ] T001 En `scripts/reset-db-ci.mjs`, reemplazar `drop schema public cascade; create schema public;` por el vaciado de los objetos de `public` sin borrar el esquema (research.md, Decisión 4). `private` y `dominio` se siguen borrando como hoy.
- [ ] T002 Verificar contra el stack del CI que, después del reset, `pg_default_acl` de `postgres` en `public` coincide con el de un stack levantado con la CLI (quickstart.md, CI paso 2), y que el resto de la suite pgTAP sigue verde con el reset nuevo.
- [ ] T003 Actualizar `docs/adoptar-ci-base-aislada.md`: el reset vacía `public` en vez de borrarlo, y por qué.

**Checkpoint**: el CI reproduce el hueco (la consulta de grants de `public.clientes` en el CI muestra `TRUNCATE` para `anon`).

## Phase 2: User Story 3 - Invariante (Priority: P2, se escribe primero para verla fallar)

- [ ] T004 [US3] Crear `supabase/tests/database/privilegios_por_defecto_api.test.sql`: aserción sobre `aclexplode(relacl)` de las relaciones de `public`/`dominio` y sobre `aclexplode(defaclacl)` de `postgres` en esos esquemas (research.md, Decisión 5); mensaje que nombre relación y privilegio.
- [ ] T005 [US3] Correr la prueba sin la migración: falla en local y en el CI (confirma que no pasa en vacío).

## Phase 3: User Stories 1 y 2 - Revocar y corregir defaults (Priority: P1) 🎯 MVP

- [ ] T006 [US1] Crear `supabase/migrations/<version>_privilegios_por_defecto_api.sql` con el `do` que revoca en las relaciones existentes y el encabezado de reversión (data-model.md). Versión libre verificada con `pnpm migrations:check` si la guarda ya está en `main`.
- [ ] T007 [US2] En la misma migración, `alter default privileges for role postgres in schema public, dominio revoke truncate, references, trigger, maintain on tables from anon, authenticated`.
- [ ] T008 [US2] Sumar a la prueba de T004 una tabla de control creada como `postgres` dentro de la transacción, sin grants: 0 privilegios para `anon`/`authenticated`.
- [ ] T009 [US1] Aplicar dos veces la migración sobre una base local (idempotencia, FR-004) y correr la suite pgTAP completa en local y en el CI.

**Checkpoint**: SC-001, SC-002 y SC-003 verificados.

## Phase 4: Polish

- [ ] T010 [P] Documentar la convención de grants en `docs/architecture.md` (FR-008): tablas nuevas sin privilegios para la API; se otorga solo lo necesario.
- [ ] T011 [P] Registrar la capacidad `api-role-default-privileges` en `template-capabilities.json` (migración + prueba) y subir la versión de `isolated-ci-database` y `portable-typescript-tooling` por el cambio de `scripts/reset-db-ci.mjs`.
- [ ] T012 `pnpm lint`, `pnpm build`, `pnpm docs:check`, `pnpm template:capabilities:check` y `pnpm docs:schema` si cambia el esquema documentado.
- [ ] T013 Verificación en staging (quickstart.md, Staging): `pg_default_acl` de solo lectura antes y después de `migraciones-cloud`.
- [ ] T014 Code-review del diff contra `main` antes de pedir merge.

## Dependencies & Execution Order

- Phase 1 primero: sin ella, T005 no puede demostrar que la prueba falla en el CI.
- Phase 2 antes de Phase 3 para ver la invariante fallar y después pasar.
- Si `guarda-versiones-migraciones` se mergea antes, rebasar y volver a subir la versión de las capacidades que comparten `scripts/reset-db-ci.mjs`.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md` (regla del `CLAUDE.md` del template): sumar la fila de esta capacidad en "Backlog entregado" con el link a la spec. Avisar al producto derivado para la adopción selectiva (research.md, "Cómo vuelve al producto").
