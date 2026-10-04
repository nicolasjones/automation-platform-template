---

description: "Task list for guarda-versiones-migraciones"
---

# Tasks: Guarda de versiones únicas de migraciones

**Input**: Design documents from `specs/20261004-184830-guarda-versiones-migraciones/`

## Phase 1: User Story 1 - El PR con versiones duplicadas no pasa (Priority: P1) 🎯 MVP

### Tests

- [ ] T001 [P] [US1] Copiar `scripts/verificar-versiones-migraciones.test.mjs` del producto (`estudio-contable-automation`, `main`, PR #26) y reescribir las referencias a PRs del producto. 4 casos: únicas, caso real de dos pares duplicados, `.sql` sin prefijo, directorio real del repo.

### Implementation

- [ ] T002 [US1] Copiar `scripts/verificar-versiones-migraciones.mjs` del producto, con el comentario del "por qué" reescrito en términos del template (el reset del CI aplica con `psql`).
- [ ] T003 [US1] `package.json`: script `migrations:check`; sumar el test a `test:tooling`.
- [ ] T004 [US1] `.github/workflows/validate.yml`, job `application`: pasos `node --test scripts/verificar-versiones-migraciones.test.mjs` y `pnpm migrations:check` antes de `pnpm lint`.
- [ ] T005 [US1] Verificar el caso de falla con un duplicado en una rama descartable (quickstart.md) y el caso verde con el árbol actual.

**Checkpoint**: SC-001 y SC-003.

## Phase 2: User Story 2 - El reset del CI también falla (Priority: P2)

- [ ] T006 [US2] `scripts/reset-db-ci.mjs`: importar `verificarVersionesMigraciones` y abortar, con el mismo mensaje, antes de `verificarDestinoCiActual()`.
- [ ] T007 [US2] Correr `pnpm db:reset:ci` con un duplicado (falla sin tocar la base) y sin él (comportamiento idéntico al actual; job `database` verde).

**Checkpoint**: SC-002.

## Phase 3: Polish

- [ ] T008 [P] `template-capabilities.json`: capacidad `migration-version-guard` 1.0.0; subir `isolated-ci-database` y `portable-typescript-tooling`.
- [ ] T009 [P] Documentar la convención (versión única, cómo elegir una libre en paralelo) en `docs/architecture.md` y la llamada desde el reset en `docs/adoptar-ci-base-aislada.md`.
- [ ] T010 `pnpm lint`, `pnpm build`, `pnpm docs:check`, `pnpm template:capabilities:check`.
- [ ] T011 Code-review del diff contra `main` antes de pedir merge.

## Dependencies & Execution Order

- Phase 2 depende de T002 (importa la función).
- Si `privilegios-por-defecto-public` se mergea antes, rebasar y volver a subir las versiones de las capacidades que comparten `scripts/reset-db-ci.mjs`.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md` (regla del `CLAUDE.md` del template): fila en "Backlog entregado" con el link a la spec. Avisar al producto derivado (research.md, "Cómo vuelve al producto").
