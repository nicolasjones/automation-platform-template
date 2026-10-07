---

description: "Task list for Disparo programado en el ciclo de ejecuciones"
---

# Tasks: Disparo programado en el ciclo de ejecuciones

**Input**: Design documents from `specs/20261007-171745-disparo-programado-ciclo-ejecuciones/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rpc.md, quickstart.md

**Tests**: pgTAP real (Technology and Quality Gates: "los cambios sensibles requieren una prueba del aislamiento, no solo revisión manual") — regresión de `ciclo_ejecuciones_workers.test.sql` incluida, no solo tests nuevos.

## ✅ Verificación real 2026-10-07

El stack local de Supabase de esta máquina pertenece a otro worktree (otra sesión activa) — nunca se tocó. En su lugar, cada push a este PR corrió contra el stack **aislado** del CI (self-hosted runner, proyecto propio, puertos propios) — mismo criterio que cualquier otro PR del repo. El CI atrapó 3 bugs reales que la revisión manual no vio (documentados en los commits): falta `insert into auth.users` antes de `usuarios_organizacion` en 2 fixtures, orden de parámetros inválido en `programar_capacidad_ejecucion` ("input parameters after one with a default value must also have defaults"), y una referencia ambigua a `estado` en un JOIN. Los 4 checks del PR #37 (`database`, `application`, `infrastructure`, `verificar`) están en verde después de corregirlos — ver `gh pr checks 37 --repo nicolasjones/automation-platform-template`.

## Phase 1: Setup

- [X] T001 Confirmar fixtures reutilizables de `supabase/tests/database/ciclo_ejecuciones_workers.test.sql` y `ejecucion_en_curso_worker.test.sql` para los tests nuevos (misma organización/conexión/capacidades donde tenga sentido, sin duplicar fixtures). Revisado; los tests nuevos usan su propio prefijo de UUID (`a1.../b1.../c1.../d1...`) para no colisionar, mismo estilo de fixtures.

## Phase 2: Foundational (bloqueante)

- [X] T002 Migración `supabase/migrations/20261007180000_programacion_ejecucion.sql`: tabla `public.programacion_ejecucion` (forma en `data-model.md` §1), con `unique (capacidad_id)`.
- [X] T003 RLS de `programacion_ejecucion`: `select` solo para administradores de la organización (mismo patrón que `capacidades_ejecucion_select`/`ejecuciones_worker_select`, no "cualquier miembro" — consistencia con las tablas hermanas del mismo módulo), sin escritura directa para `authenticated`.
- [X] T004 [P] pgTAP `supabase/tests/database/programacion_ejecucion.test.sql`: **verde en CI** (aislamiento entre 2 organizaciones + rechazo de escritura directa + constraint de frecuencia semanal).
- [X] T005 Migración `supabase/migrations/20261007180100_despachar_programada_outbox.sql`: reemplaza `public.iniciar_ejecucion_worker` con el cambio de una línea de `data-model.md` §2 — copiado el cuerpo completo de `20260925210000_destrabar_conexion_invalida.sql` (la versión real más reciente), nada más cambia.
- [X] T006 pgTAP de regresión: **verde en CI** — `ciclo_ejecuciones_workers.test.sql` y `ejecucion_en_curso_worker.test.sql` corrieron sin modificarlos y siguen pasando (FR-009, `manual`/`kestra` intactos). Era el gate más importante de la spec; confirmado antes de seguir con las demás fases.
- [X] T007 [P] pgTAP `supabase/tests/database/despacho_programado_outbox.test.sql`: **verde en CI** (`iniciar_ejecucion_worker(..., 'programada')` SÍ genera una fila en `despachos_ejecucion`; `'kestra'` sigue sin generarla).
- [X] T008 Función `private.conexion_en_curso(uuid)` (`data-model.md` §3, migración `20261007180200_conexion_en_curso.sql`), generalizando `estado_ejecucion_vigente` de ejecución puntual a conexión.
- [X] T009 [P] pgTAP `supabase/tests/database/conexion_en_curso.test.sql`: **verde en CI** (misma conexión bloquea entre capacidades distintas, conexión distinta del mismo `sistema_externo` no se ve afectada, timeout y cierre de estado liberan el bloqueo).

**Checkpoint**: el mecanismo de datos existe y está probado contra una base real (CI), no solo revisado a mano. ✅

## Phase 3: User Story 1 - Programar una capacidad para que corra sola (Priority: P1) 🎯 MVP

**Independent Test**: programar una capacidad, disparar el flow despachador manualmente (sin esperar el cron), confirmar ejecución real de punta a punta (quickstart.md escenario 1).

- [X] T010 [P] [US1] RPC `public.programar_capacidad_ejecucion` (`contracts/rpc.md`) — exige `private.es_administrador_de`. Migración `20261007180500_rpc_programacion_ejecucion.sql`.
- [X] T011 [P] [US1] RPC `public.quitar_programacion_capacidad` (`contracts/rpc.md`).
- [X] T012 [US1] RPC `public.listar_programaciones_de_organizacion` (`contracts/rpc.md`), incluyendo el cálculo de "vencida" (`hasta < hoy`, de solo lectura).
- [X] T013 [P] [US1] pgTAP `supabase/tests/database/rpc_programacion_ejecucion.test.sql`: **verde en CI** — administrador puede, miembro no-administrador no puede, administrador de otra organización no puede, lectura vía RPC abierta a cualquier miembro.
- [X] T014 [US1] Flow `infra/kestra/flows/despachador-programado.yml`: trigger `Schedule` cada 10 minutos, consulta `private.capacidades_programadas_debidas()` (join `programacion_ejecucion`+`capacidades_ejecucion`), llama `private.conexion_en_curso` y `iniciar_ejecucion_worker(..., 'programada')` por cada capacidad que corresponda, y `private.marcar_programacion_disparada` para no repetir el disparo el mismo día — sin inputs de sistema/imagen, sin ninguna condición específica de un sistema (FR-007). Columna `ultima_disparada_en` (migración `20261007180300`) y las 2 funciones de apoyo (migración `20261007180400`) se agregaron durante esta tarea: eran necesarias para la idempotencia del disparo diario, no estaban en el diseño original.
- [X] T015 [US1] Test estático `infra/kestra/validar-despachador-programado.test.mjs` (mismo patrón que `validar-reintentos-flows.test.mjs`) — **corrido localmente, 5/5 en verde** (no requiere base de datos, es seguro de ejecutar): sin `sistema_externo`/`imagen`, sin SSH/docker, con trigger `Schedule`, llama a `iniciar_ejecucion_worker` con `'programada'`, y chequea `conexion_en_curso` antes de disparar.
- [ ] T016 [US1] Ejecutar `quickstart.md` escenario 1 contra un Kestra real (deploy del flow + disparo real) — **pendiente**: requiere una instancia de Kestra corriendo, que el CI de este PR no levanta (los 4 checks validan SQL/JS, no despliegan flows). Queda para la verificación manual antes de mergear, o para el `/speckit-implement` del producto derivado que la va a consumir.

**Checkpoint**: una capacidad programada corre sola de punta a punta a nivel de base de datos y de validación estática del flow; falta la prueba end-to-end contra Kestra real (T016).

## Phase 4: User Story 2 - Evitar 2 ejecuciones de la misma conexión a la vez (Priority: P1)

**Independent Test**: quickstart.md escenario 2.

- [X] T017 [US2] `private.conexion_en_curso` conectada dentro del propio flow `despachador-programado.yml` (tarea `conexion_bloqueada` + `io.kestra.plugin.core.flow.If`, ver T014) — confirmado por el test estático T015 que el chequeo ocurre antes del disparo, no después.
- [X] T018 [P] [US2] pgTAP `supabase/tests/database/conexion_en_curso.test.sql` (ampliado): **verde en CI** — dos capacidades de la misma conexión, la primera en_curso bloquea a la segunda (`conexion_en_curso` = true count as blocking antes de disparar); al cerrar/vencer la primera, la conexión vuelve a estar libre para la segunda. La verificación de "no se pierde, no se duplica" a nivel del flow completo (dos filas debidas en el mismo ciclo del despachador) queda documentada en el comentario de `despachador-programado.yml` (`ultima_disparada_en` no se toca si `conexion_en_curso` bloqueó) — sin un test de integración Kestra real (requiere T016).
- [ ] T019 [US2] Ejecutar `quickstart.md` escenario 2 (concurrencia) y escenario 3 (vigencia con timeout) contra Kestra real — **pendiente**, misma razón que T016.

**Checkpoint**: SC-002 verificado a nivel de base de datos (CI); falta la verificación end-to-end contra Kestra real (T016/T019), fuera del alcance de lo que este CI puede probar.

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T020 Actualizar `specs/016-ciclo-ejecuciones-workers/contracts/ciclo-ejecuciones.md` (tabla de orígenes: `'programada'` ahora genera orden) — Principio VII, el contrato original no puede quedar desactualizado.
- [ ] T021 Bump de `worker-execution-cycle` en `template-capabilities.json` (paths nuevos: la migración de `programacion_ejecucion`, el flow despachador) y evidencia verbosa en `template-adoption.json` si este repo también la consume (verificar el campo `version` real, no solo el texto — regla de proyecto).
- [ ] T022 `pnpm docs:check` / documentación equivalente del cambio (Principio VII) — este archivo de tasks + los artefactos de `specs/` ya cumplen, confirmar que no falta nada en `docs/` si existiera una guía general del ciclo de ejecuciones.
- [X] T023 Code-review del diff completo contra `main` (regla de proyecto). Hallazgo real corregido: `private.capacidades_programadas_debidas()` no filtraba por `capacidades_ejecucion.habilitada`/`conexiones.estado = 'activa'` — sin eso, una capacidad deshabilitada o con credencial inválida quedaría "debida" para siempre (nunca llega a `marcar_programacion_disparada` porque `iniciar_ejecucion_worker` la rechaza antes), generando ruido cada ciclo del despachador. No era un bug de corrección (el disparo real ya estaba bien rechazado), sí de limpieza operativa — corregido con su propio pgTAP (`capacidades_programadas_debidas.test.sql`), verde en CI.

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
