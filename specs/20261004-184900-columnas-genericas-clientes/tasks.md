---

description: "Task list for columnas-genericas-clientes"
---

# Tasks: Estado, contacto y borrado restringido de clientes

**Input**: Design documents from `specs/20261004-184900-columnas-genericas-clientes/`

## Phase 1: Foundational - columnas y triggers (bloquea las historias)

- [ ] T001 Crear `supabase/migrations/<version>_clientes_ciclo_de_vida.sql` con el encabezado de reversión (data-model.md) y las columnas nuevas, checks, `update ... set updated_at = created_at` e índice `(organizacion_id, estado)`.
- [ ] T002 En la misma migración, `private.preparar_cliente()` y `private.fijar_fechas_auditoria()` con sus triggers sobre `public.clientes`; `revoke execute ... from public, anon`.
- [ ] T003 Crear `supabase/tests/database/clientes_ciclo_de_vida.test.sql` con el bloque de columnas y checks.

**Checkpoint**: migración aplicada en local, pruebas existentes de aislamiento y mapeo verdes.

## Phase 2: User Story 1 - Baja lógica (Priority: P1) 🎯 MVP

- [ ] T004 [US1] pgTAP: estado inválido rechazado; baja y reactivación por administrador; miembro sin escritura rechazado por RLS.
- [ ] T005 [US1] `apps/web/src/pages/clientes/list.tsx`: columna de estado, filtro (activos por defecto) y acción "Dar de baja"/"Reactivar" para quien puede escribir.
- [ ] T006 [US1] Prueba Vitest del filtro por estado y de la acción visible solo con permiso.

## Phase 3: User Story 3 - Fechas fijadas por la base (Priority: P1)

- [ ] T007 [US3] pgTAP: los cuatro casos de fechas del quickstart (alta de API, update de API, `updated_at`, restauración como `postgres`).

**Checkpoint**: SC-002.

## Phase 4: User Story 2 - Contacto y observaciones (Priority: P2)

- [ ] T008 [US2] pgTAP: email inválido, largos, espacios → `null`.
- [ ] T009 [US2] `create.tsx` y `edit.tsx`: campos de contacto y observaciones; traducción de los `23514` (contracts/rpc-clientes.md).
- [ ] T010 [US2] Prueba Vitest del formulario.

## Phase 5: User Story 4 - Borrado restringido (Priority: P2)

- [ ] T011 [US4] En la migración: `private.motivo_cliente_no_borrable_producto`, `private.motivo_cliente_no_borrable` (FK dinámicas, research.md Decisión 2), `public.cliente_es_borrable` y `public.borrar_cliente` (contracts/rpc-clientes.md); grants a `authenticated` solo de las públicas.
- [ ] T012 [US4] pgTAP: sin referencias → borra; con identificador externo → `P0001`; tabla de prueba con FK creada en la transacción → `P0001`; punto de extensión redefinido en la transacción → `P0001` con su motivo; `42501`; `P0002` para otra organización.
- [ ] T013 [US4] `edit.tsx`: consulta `cliente_es_borrable` y ofrece "Borrar" (con confirmación) o "Dar de baja".
- [ ] T014 [US4] Prueba Vitest de las dos variantes de la acción.

**Checkpoint**: SC-003, SC-004.

## Phase 6: Polish

- [ ] T015 [P] `docs/crear-producto-derivado.md`: cómo extender el motivo de no borrado y cómo adoptar las fechas genéricas en otras tablas.
- [ ] T016 [P] `pnpm docs:schema`; `template-capabilities.json` con la capacidad `clientes-ciclo-de-vida` (migración, prueba, páginas de clientes).
- [ ] T017 `pnpm lint`, `pnpm build`, `pnpm test:web`, `pnpm docs:check`, `pnpm template:capabilities:check`; pgTAP en el CI.
- [ ] T018 Revisión `authz-security` de las RPCs y la RLS, `web-design-guidelines` de la pantalla y code-review del diff contra `main` antes de pedir merge.

## Dependencies & Execution Order

- Phase 1 antes de todo. US1 y US3 (P1) antes de US2 y US4.
- Si `identificadores-externos-por-organizacion` se mergea antes, la prueba de T012 con un identificador externo usa la tabla ya corregida; el resultado esperado no cambia (la FK sigue apuntando a `clientes`).

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md` (regla del `CLAUDE.md` del template): fila en "Backlog entregado" con el link a la spec. Avisar al producto derivado (research.md, "Cómo vuelve al producto").
