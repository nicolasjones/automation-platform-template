---

description: "Task list for identificadores-externos-por-organizacion"
---

# Tasks: Identificadores externos únicos por organización y entidades pendientes

**Input**: Design documents from `specs/20261004-184915-identificadores-externos-por-organizacion/`

## Phase 1: User Story 1 - Unicidad por organización (Priority: P1) 🎯 MVP

### Tests (primero, para verlos fallar)

- [ ] T001 [US1] En `supabase/tests/database/mapeo_identificadores_clientes.test.sql`: dos organizaciones vinculan el mismo par con éxito; mismo par en dos clientes de la misma organización → `23505`; cada admin ve solo su fila; el mensaje de conflicto no se produce entre organizaciones. Reemplazar la aserción que fijaba la unicidad global.

### Implementation

- [ ] T002 [US1] Crear `supabase/migrations/<version>_identificadores_externos_por_organizacion.sql` con el encabezado de reversión (research.md, "Reversión"): `unique (id, organizacion_id)` en `clientes`; `organizacion_id` con backfill desde `clientes` y `set not null`; FK compuesta; cambio de unicidad.
- [ ] T003 [US1] En la misma migración: RLS de select por `organizacion_id`; policies de insert/delete por `es_administrador_de(organizacion_id)`; `vincular_identificador_externo` y `desvincular_identificador_externo` con el `on conflict` y la resolución por organización (contracts/identificadores-externos.md).
- [ ] T004 [US1] Verificar que una base con vínculos previos conserva todos y con su organización correcta (pgTAP con filas insertadas antes de la migración en el test de upgrade, o prueba manual en local con datos de ejemplo).

**Checkpoint**: SC-001, SC-002.

## Phase 2: User Story 2 - Entidades pendientes (Priority: P2)

### Tests

- [ ] T005 [US2] pgTAP: registración nueva → pendiente (`null`); segunda registración idempotente; `vincular` sobre pendiente lo asigna; registración posterior devuelve el cliente; `desasignar` vuelve a pendiente; rol técnico de otra organización → `42501`; vínculo con cliente de otra organización imposible por la FK compuesta.

### Implementation

- [ ] T006 [US2] `cliente_id` nullable, `nombre_en_sistema`, `updated_at` e índice parcial de pendientes.
- [ ] T007 [US2] `public.registrar_identificador_externo` y `public.desasignar_identificador_externo` con sus grants (`workers_orquestacion` y `authenticated`), `revoke ... from public, anon`.
- [ ] T008 [US2] Prueba de concurrencia: dos registraciones simultáneas del mismo identificador dejan una fila (dos sesiones `psql` con `pg_sleep`, documentado en el test o en quickstart).

**Checkpoint**: SC-003.

## Phase 3: Polish

- [ ] T009 [P] Nota en `specs/20260930-135541-mapeo-identificadores-clientes/research.md` (Decisión 2): revisada por esta spec, con link.
- [ ] T010 [P] `template-capabilities.json`: `mapeo-identificadores-externos` 2.0.0 con la migración nueva en sus paths; `pnpm docs:schema`.
- [ ] T011 `pnpm lint`, `pnpm build`, `pnpm docs:check`, `pnpm template:capabilities:check`; pgTAP completo en local y CI.
- [ ] T012 Revisión `authz-security` de las funciones y la RLS, y code-review del diff contra `main` antes de pedir merge.

## Dependencies & Execution Order

- Phase 1 antes que Phase 2 (la FK compuesta y `organizacion_id` son prerequisito de los pendientes).
- Independiente de `columnas-genericas-clientes`; si esa se mergea antes, su motivo de no borrado ya detecta esta tabla por FK.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md` (regla del `CLAUDE.md` del template): fila de la capacidad `mapeo-identificadores-externos` con la versión nueva y el link a esta spec. Avisar al producto derivado (research.md, "Cómo vuelve al producto").
