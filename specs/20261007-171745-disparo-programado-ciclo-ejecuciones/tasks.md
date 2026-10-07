---

description: "Task list for Disparo programado en el ciclo de ejecuciones"
---

# Tasks: Disparo programado en el ciclo de ejecuciones

**Input**: Design documents from `specs/20261007-171745-disparo-programado-ciclo-ejecuciones/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc.md, quickstart.md

**Tests**: pgTAP real (Technology and Quality Gates: "los cambios sensibles requieren una prueba del aislamiento, no solo revisión manual") — regresión de `ciclo_ejecuciones_workers.test.sql` incluida, no solo tests nuevos.

## ⚠️ Nota de ejecución 2026-10-07

El stack local de Supabase corriendo en esta máquina pertenece a otro worktree (`tmpl-proveedor-elegible-capacidad`, otra sesión activa) — no se tocó para no interferir con ese trabajo. Las migraciones y los 3 archivos `.test.sql` de abajo están escritos y revisados a mano contra el esquema real (línea por línea, no por analogía), pero **no se ejecutaron contra una base real todavía**. T001-T003/T005/T008 quedan `[X]` (el código existe); T004/T006/T007/T009 quedan `[ ]` hasta correrlos contra un stack propio o coordinar con la otra sesión — no marcar como verificado algo que no corrió.

## Phase 1: Setup

- [X] T001 Confirmar fixtures reutilizables de `supabase/tests/database/ciclo_ejecuciones_workers.test.sql` y `ejecucion_en_curso_worker.test.sql` para los tests nuevos (misma organización/conexión/capacidades donde tenga sentido, sin duplicar fixtures). Revisado; los tests nuevos usan su propio prefijo de UUID (`a1.../b1.../c1...`) para no colisionar, mismo estilo de fixtures.

## Phase 2: Foundational (bloqueante)

- [X] T002 Migración `supabase/migrations/20261007180000_programacion_ejecucion.sql`: tabla `public.programacion_ejecucion` (forma en `data-model.md` §1), con `unique (capacidad_id)`.
- [X] T003 RLS de `programacion_ejecucion`: `select` solo para administradores de la organización (mismo patrón que `capacidades_ejecucion_select`/`ejecuciones_worker_select`, no "cualquier miembro" — consistencia con las tablas hermanas del mismo módulo), sin escritura directa para `authenticated`.
- [ ] T004 [P] pgTAP `supabase/tests/database/programacion_ejecucion.test.sql`: escrito (aislamiento entre 2 organizaciones + rechazo de escritura directa + constraint de frecuencia semanal) — **pendiente de correr contra una base real** (ver nota arriba).
- [X] T005 Migración `supabase/migrations/20261007180100_despachar_programada_outbox.sql`: reemplaza `public.iniciar_ejecucion_worker` con el cambio de una línea de `data-model.md` §2 — copiado el cuerpo completo de `20260925210000_destrabar_conexion_invalida.sql` (la versión real más reciente), nada más cambia.
- [ ] T006 pgTAP de regresión: **pendiente de correr** `ciclo_ejecuciones_workers.test.sql` y `ejecucion_en_curso_worker.test.sql` sin modificarlos, para confirmar que siguen en verde (FR-009, no romper `manual`/`kestra`) — es el gate más importante de toda la spec, no se puede dar por cumplido sin ejecutarlo.
- [ ] T007 [P] pgTAP `supabase/tests/database/despacho_programado_outbox.test.sql`: escrito (`iniciar_ejecucion_worker(..., 'programada')` SÍ genera una fila en `despachos_ejecucion`, y `'kestra'` sigue sin generarla) — **pendiente de correr**.
- [X] T008 Función `private.conexion_en_curso(uuid)` (`data-model.md` §3, migración `20261007180200_conexion_en_curso.sql`), generalizando `estado_ejecucion_vigente` de ejecución puntual a conexión.
- [ ] T009 [P] pgTAP `supabase/tests/database/conexion_en_curso.test.sql`: escrito (misma conexión bloquea entre capacidades distintas, conexión distinta del mismo `sistema_externo` no se ve afectada, timeout y cierre de estado liberan el bloqueo) — **pendiente de correr**.

**Checkpoint**: el código del mecanismo de datos existe; falta ejecutarlo contra una base real antes de considerarlo probado.

## Phase 3: User Story 1 - Programar una capacidad para que corra sola (Priority: P1) 🎯 MVP

**Independent Test**: programar una capacidad, disparar el flow despachador manualmente (sin esperar el cron), confirmar ejecución real de punta a punta (quickstart.md escenario 1).

- [ ] T010 [P] [US1] RPC `public.programar_capacidad_ejecucion` (`contracts/rpc.md`) — exige `private.es_administrador_de`.
- [ ] T011 [P] [US1] RPC `public.quitar_programacion_capacidad` (`contracts/rpc.md`).
- [ ] T012 [US1] RPC `public.listar_programaciones_de_organizacion` (`contracts/rpc.md`), incluyendo el cálculo de "vencida" (`hasta < hoy`, de solo lectura).
- [ ] T013 [P] [US1] pgTAP de permisos de T010-T012: administrador puede, miembro no-administrador no puede, otra organización no puede.
- [ ] T014 [US1] Flow `infra/kestra/flows/despachador-programado.yml`: trigger `Schedule` (sintaxis de `research.md` #3), consulta `programacion_ejecucion` join `capacidades_ejecucion` por lo debido ahora, llama `private.conexion_en_curso` y `iniciar_ejecucion_worker(..., 'programada')` por cada capacidad que corresponda — sin inputs de sistema/imagen, sin ninguna condición específica de un sistema (FR-007).
- [ ] T015 [US1] Test estático del flow (mismo patrón que `infra/kestra/validar-reintentos-flows.test.mjs`): confirmar que `despachador-programado.yml` no referencia ningún nombre de sistema/imagen hardcodeado.
- [ ] T016 [US1] Ejecutar `quickstart.md` escenario 1 contra el stack local real (no solo mocks).

**Checkpoint**: una capacidad programada corre sola de punta a punta.

## Phase 4: User Story 2 - Evitar 2 ejecuciones de la misma conexión a la vez (Priority: P1)

**Independent Test**: quickstart.md escenario 2.

- [ ] T017 [US2] Conectar `private.conexion_en_curso` como chequeo previo dentro del propio flow `despachador-programado.yml` (ya cubierto por T014, este task es la prueba dedicada del comportamiento end-to-end, no solo de la función en aislamiento).
- [ ] T018 [P] [US2] pgTAP de integración: dos capacidades de la misma conexión, ambas vencidas/debidas en el mismo ciclo del despachador → solo una se dispara, la otra queda pendiente para el próximo ciclo (no se pierde, no se duplica).
- [ ] T019 [US2] Ejecutar `quickstart.md` escenario 2 (concurrencia) y escenario 3 (vigencia con timeout) contra el stack local real.

**Checkpoint**: SC-002 verificado en vivo, no solo en el diseño.

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T020 Actualizar `specs/016-ciclo-ejecuciones-workers/contracts/ciclo-ejecuciones.md` (tabla de orígenes: `'programada'` ahora genera orden) — Principio VII, el contrato original no puede quedar desactualizado.
- [ ] T021 Bump de `worker-execution-cycle` en `template-capabilities.json` (paths nuevos: la migración de `programacion_ejecucion`, el flow despachador) y evidencia verbosa en `template-adoption.json` si este repo también la consume (verificar el campo `version` real, no solo el texto — regla de proyecto).
- [ ] T022 `pnpm docs:check` / documentación equivalente del cambio (Principio VII) — este archivo de tasks + los artefactos de `specs/` ya cumplen, confirmar que no falta nada en `docs/` si existiera una guía general del ciclo de ejecuciones.
- [ ] T023 Code-review del diff completo contra `main` antes de pedir el cierre del PR (regla de proyecto).

## Dependencies & Execution Order

- Setup (Fase 1) sin dependencias.
- Foundational (Fase 2) depende de Fase 1; bloquea US1 y US2. **T006 (regresión) es el gate más importante de toda la spec** — si rompe, nada más puede avanzar.
- US1 (Fase 3) depende de Fase 2. US2 (Fase 4) depende de Fase 2 y de T014 (el flow) para su prueba end-to-end, aunque T008/T009 (la función en sí) ya se probaron en Fase 2.
- Polish depende de US1 y US2 completas.

## Implementation Strategy

1. Fase 1 + Fase 2 — con énfasis real en T006 (regresión) antes de seguir: si el cambio de `iniciar_ejecucion_worker` rompe algo de `manual`/`kestra`, hay que parar ahí, no avanzar con el despachador.
2. US1 (MVP) → validar con quickstart escenario 1 → demo.
3. US2 → validar con quickstart escenarios 2-3 → demo.
4. Polish → PR listo para review/merge.

No implementar todo en una sola corrida de `/speckit-implement` — `/clear` entre fases, mismo criterio que el resto de specs de este repo.
