---

description: "Task list template for feature implementation"
---

# Tasks: Fallback de navegación asistido por IA

**Input**: Design documents from `specs/20261003-150125-fallback-navegacion-ia/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ia-navegacion.md, quickstart.md

**Tests**: incluidos — la constitución exige que toda entrega pase `pnpm test`, y el gap de CI descubierto en research.md (Decisión 5) hace que esta sea la primera entrega cuyos tests de `packages/ia*` realmente corren en CI.

**Organization**: tareas agrupadas por historia de usuario de `spec.md`.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Crear `packages/ia-navegacion/package.json` (nombre `@platform/ia-navegacion`, `"type": "module"`, scripts `build`/`test` iguales a `packages/ia/package.json`, dependencia de workspace `@platform/ia`, devDependencies `typescript`/`vitest` con las mismas versiones que `packages/ia`).
- [x] T002 [P] Crear `packages/ia-navegacion/tsconfig.json` (mismo patrón que `packages/ia/tsconfig.json`).
- [x] T003 [P] Agregar script `test:ia` en el `package.json` raíz (`pnpm --filter @platform/ia --filter @platform/ia-navegacion test`) y encadenarlo desde `pnpm test` (research.md, Decisión 5).
- [x] T004 [P] Agregar el paso `pnpm test:ia` al job `application` de `.github/workflows/validate.yml`, después de `pnpm test:web` (research.md, Decisión 5).

**Checkpoint**: el paquete existe, compila vacío y está conectado a CI/`pnpm test`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: ninguna historia puede empezar sin esto.

- [x] T005 Crear `packages/ia-navegacion/src/tipos.ts` con `PasoRecuperable`, la unión discriminada `AccionPermitida` (`completar_campo`, `click_en_elemento`, `esperar_elemento`, `confirmar_descarga`), `Verificador`, `CheckpointReanudacion`, `ResultadoInvocacion` y `AdaptadorInvocacionIa`, exactamente como los documenta `data-model.md` y `contracts/ia-navegacion.md`.
- [x] T006 Crear `packages/ia-navegacion/src/index.ts` re-exportando `tipos.ts` e `intentarRecuperarPaso.ts` (este último se crea en Phase 3).

**Checkpoint**: tipos compartidos listos; las historias de usuario pueden empezar.

---

## Phase 3: User Story 1 - Recuperar un paso de navegación bloqueado (Priority: P1) 🎯 MVP

**Goal**: el mecanismo propone una acción del vocabulario declarado, la ejecuta en la sesión ya autenticada del consumidor, y solo confirma éxito cuando el verificador del consumidor lo valida.

**Independent Test**: ver `quickstart.md`, Escenario 1 — fixture con una acción permitida y verificador que resuelve `true`.

### Tests for User Story 1 ⚠️

> Escribir primero, deben fallar antes de implementar.

- [x] T007 [P] [US1] Test "recuperación exitosa ejecuta exactamente una acción del vocabulario declarado y devuelve estado 'recuperado'" en `packages/ia-navegacion/src/intentarRecuperarPaso.test.ts` (quickstart.md, Escenario 1).

### Implementation for User Story 1

- [x] T008 [US1] Implementar `intentarRecuperarPaso` en `packages/ia-navegacion/src/intentarRecuperarPaso.ts`: validar `politica` con `validarPoliticaActiva` (de `@platform/ia`) y presupuesto con `validarPresupuesto`; usar `iniciarInteraccion`/`iniciarInvocacion` de `@platform/ia` para abrir la interacción; sanitizar el `contexto` del paso con `sanitizarDato` según `contratoConsumidor.datosPermitidos`; llamar `adaptadorIa.invocarProveedor` con la entrada sanitizada; validar la acción propuesta contra `paso.accionesPermitidas` (ver Phase 5 para el camino de rechazo); ejecutar con `adaptadorIa.ejecutarAccion`; llamar `paso.verificador`; si confirma, cerrar con `completarInteraccion` y devolver `{ estado: 'recuperado', checkpoint: paso.checkpoint, interaccionId, motivo: null }` (depende de T005).

**Checkpoint**: User Story 1 funcional y testeable de forma independiente — este es el MVP.

---

## Phase 4: User Story 2 - Reanudar sin duplicar efectos (Priority: P1)

**Goal**: el checkpoint declarado por el consumidor se devuelve intacto solo cuando hubo éxito verificado, y la acción se ejecuta como máximo una vez por invocación.

**Independent Test**: ver `quickstart.md`, Escenario 1 (reutilizado) — confirmar que `adaptadorFixture.ejecutarAccion` se llamó exactamente una vez y que `checkpoint` en la respuesta es idéntico (misma referencia de valor) al declarado en `paso.checkpoint`.

### Tests for User Story 2 ⚠️

- [x] T009 [P] [US2] Test "el checkpoint devuelto es idéntico al declarado y `ejecutarAccion` se llama exactamente una vez" en `packages/ia-navegacion/src/intentarRecuperarPaso.test.ts`.
- [x] T010 [P] [US2] Test "en un resultado 'no_recuperable', `checkpoint` es `null`" en `packages/ia-navegacion/src/intentarRecuperarPaso.test.ts` (depende de que Phase 5 exista para tener un caso `no_recuperable` real; si se implementa antes, usar el fixture de política inactiva de T008 como caso no_recuperable mínimo).

### Implementation for User Story 2

- [x] T011 [US2] Ajustar `intentarRecuperarPaso` para que `checkpoint` solo se incluya cuando `estado === 'recuperado'` y para que ninguna rama del código llame a `adaptadorIa.ejecutarAccion` más de una vez por invocación (revisar T008; probablemente ya cumple por construcción — este task es de verificación explícita + test, no de reescritura).

**Checkpoint**: User Stories 1 y 2 funcionan juntas de forma independiente.

---

## Phase 5: User Story 3 - Detener un caso no recuperable (Priority: P1)

**Goal**: dominio fuera de contrato, acción fuera de vocabulario, verificador rechazado, sin política activa o presupuesto agotado detienen el mecanismo sin ejecutar nada no autorizado, y sin inventar un canal de escalamiento propio.

**Independent Test**: ver `quickstart.md`, Escenarios 2, 3 y 4.

### Tests for User Story 3 ⚠️

- [x] T012 [P] [US3] Test "acción propuesta fuera del vocabulario declarado se rechaza sin ejecutarse, motivo 'accion_no_declarada'" en `packages/ia-navegacion/src/intentarRecuperarPaso.test.ts`. (Resuelto durante code-review: `sin_acciones_permitidas` quedó reservado exclusivamente para el pre-check de vocabulario vacío, que nunca llega a invocar al proveedor — ver `data-model.md`.)
- [x] T013 [P] [US3] Test "acción cuyo objetivo resuelve a un dominio distinto de `paso.alcance.dominioPermitido` se rechaza sin ejecutarse, motivo 'dominio_no_autorizado'" en `packages/ia-navegacion/src/intentarRecuperarPaso.test.ts` (quickstart.md, Escenario 3).
- [x] T014 [P] [US3] Test "verificador que resuelve `false` o lanza termina la invocación de inmediato, motivo 'verificador_rechazado', sin segunda llamada a `ejecutarAccion`" en `packages/ia-navegacion/src/intentarRecuperarPaso.test.ts` (quickstart.md, Escenario 2).
- [x] T015 [P] [US3] Test "política inactiva (`validarPoliticaActiva` lanza) devuelve motivo 'sin_politica_activa' sin invocar al proveedor" en `packages/ia-navegacion/src/intentarRecuperarPaso.test.ts` (quickstart.md, Escenario 4).
- [x] T016 [P] [US3] Test "presupuesto agotado (`validarPresupuesto` lanza) devuelve motivo 'presupuesto_agotado'" en `packages/ia-navegacion/src/intentarRecuperarPaso.test.ts`.
- [x] T017 [P] [US3] Test "un reintento de infraestructura del orquestador (misma tarea invocada de nuevo externamente) no incrementa ningún contador propio de esta capa" — documentar en el test que esta capa no mantiene contador propio (FR-008 se satisface por diseño, no por lógica a probar en runtime); verificar que `intentarRecuperarPaso` no recibe ni expone ningún parámetro de "número de intento" fuera del que ya gestiona `@platform/ia`.

### Implementation for User Story 3

- [x] T018 [US3] Agregar en `intentarRecuperarPaso` la validación de vocabulario y dominio ANTES de ejecutar cualquier acción: si la acción propuesta por `adaptadorIa.invocarProveedor` no coincide con ninguna variante de `paso.accionesPermitidas` o su `objetivo` no resuelve dentro de `paso.alcance.dominioPermitido`, devolver `{ estado: 'no_recuperable', motivo: 'accion_no_declarada' | 'dominio_no_autorizado', checkpoint: null, interaccionId }` sin llamar `adaptadorIa.ejecutarAccion` (depende de T008).
- [x] T019 [US3] Envolver la llamada a `paso.verificador` para que una resolución `false` o una excepción llame `registrarFallo(interaccion, politica, 'verificador')` (de `@platform/ia`) y traduzca el resultado a `{ estado: 'no_recuperable', motivo: 'verificador_rechazado', checkpoint: null, interaccionId }` (depende de T008).
- [x] T020 [US3] Envolver `validarPoliticaActiva` y `validarPresupuesto` para capturar sus errores (`POLITICA_IA_INACTIVA`, `LIMITE_INTENTOS_IA_INVALIDO`, `LIMITE_TIEMPO_IA_INVALIDO`, `LIMITE_INTENTOS_IA`, `LIMITE_TIEMPO_IA`) y traducirlos a `motivo: 'sin_politica_activa'` o `'presupuesto_agotado'` según corresponda, sin dejar que la excepción cruda escape de `intentarRecuperarPaso` (depende de T008).

**Checkpoint**: las tres historias de usuario quedan funcionales de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T021 [P] Escribir `packages/ia-navegacion/README.md` siguiendo el mismo formato que `packages/ia/README.md` ("Antes de adoptar", "Flujo de una invocación", "Límites de esta capacidad"), dejando explícito que la adopción real para un sistema externo concreto requiere su propia spec de producto.
- [x] T022 Correr `pnpm docs:check` y resolver cualquier falta de documentación detectada. (Localmente compara contra `HEAD~1` por defecto; en CI usa `GITHUB_BASE_REF` contra la base real del PR — validado con `DOCUMENTATION_CHECK_BASE=origin/main pnpm docs:check`, ver commit `1988307` en adelante: OK.)
- [x] T023 Correr la validación completa de `quickstart.md` (los 4 escenarios) contra la implementación final. (Cubiertos por `intentarRecuperarPaso.test.ts`: recuperación exitosa, verificador rechazado, dominio no autorizado, sin política activa — 13/13 tests pasan.)
- [x] T024 Correr `pnpm lint`, `pnpm build`, `pnpm infra:config` y `pnpm test` (con `pnpm test:ia` ya encadenado). `lint`/`build`/`infra:config` pasan; de `pnpm test` se corrieron explícitamente `test:template:adoption` (11/11), `test:web` (103/103) y `test:ia` (28/28) — `test:db` (`supabase test db --local`) requiere `pnpm dev:supabase` corriendo y esta spec no agrega ninguna migración, así que no se levantó el stack solo para esto; queda pendiente de una corrida con el stack arriba antes de mergear si se quiere el `pnpm test` literal completo.

---

## Dependencies & Execution Order

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Phase 1 — bloquea las tres historias.
- **US1 (Phase 3)**: depende de Phase 2. Es el MVP.
- **US2 (Phase 4)**: depende de Phase 2 y reutiliza la implementación de US1 (T008) — no la duplica, solo la verifica y, si hiciera falta, la ajusta (T011).
- **US3 (Phase 5)**: depende de Phase 2 y de T008 (extiende la misma función con los caminos de rechazo). Las tres historias terminan compartiendo un único archivo de implementación (`intentarRecuperarPaso.ts`) porque la spec describe una sola función pública — no hay forma de hacerlas tocar archivos distintos sin fragmentar artificialmente el contrato de `contracts/ia-navegacion.md`.
- **Polish (Phase 6)**: depende de Phases 3, 4 y 5 completas.

### Parallel Opportunities

- T001-T004 en paralelo (archivos distintos).
- T007, T009, T010, T012-T017 son todos `[P]` entre sí dentro de su fase (mismo archivo de test, pero casos independientes — si se prefiere evitar conflictos de edición concurrente sobre el mismo archivo, ejecutarlos en el orden listado dentro de una misma sesión en vez de en paralelo real; quedan marcados `[P]` porque no tienen dependencia de datos entre sí, no porque deban editarse en procesos simultáneos).
- T018, T019, T020 modifican el mismo archivo que T008 — secuenciales, no paralelos entre sí.

---

## Implementation Strategy

### MVP First

1. Phase 1 → Phase 2 → Phase 3 (US1). Detener y validar con `quickstart.md` Escenario 1.

### Incremental Delivery

1. Setup + Foundational.
2. US1 → validar → esto ya es un mecanismo de recuperación funcional para el caso feliz.
3. US2 → validar → confirma que no hay duplicación de efectos ni checkpoint filtrado en rechazos.
4. US3 → validar → cierra todos los caminos de rechazo exigidos por FR-003/FR-004/FR-005/FR-009.
5. Polish → README, CI, `pnpm docs:check`, validación completa.

---

## Notas de desvío

Ninguna todavía — el único desvío respecto del plan original ocurrió en `/speckit-plan` (corrección de la spec sobre reintentos tras rechazo de verificador) y ya quedó documentado en `research.md` y en el commit `932727d`.

## Al cerrar esta spec (merge del PR)

Actualizar `docs/roadmap-template.md`: agregar una fila en "Backlog entregado" para esta capacidad (referenciando este spec y `packages/ia-navegacion`), como extensión directa de la fila de `016-capacidad-ia-gobernada`. Es un paso manual, no automatizable — no corre como parte de `implement`.
