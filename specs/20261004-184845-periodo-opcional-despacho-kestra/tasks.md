---

description: "Task list for periodo-opcional-despacho-kestra"
---

# Tasks: Despachador por outbox con detalle opcional en Kestra

**Input**: Design documents from `specs/20261004-184845-periodo-opcional-despacho-kestra/`

## Phase 1: Foundational - verificaciones estáticas (bloquea las demás)

- [ ] T001 Crear `infra/kestra/verificar-flows.mjs` con tres funciones puras sobre el texto de un flow: inputs con `defaults` y `required: false`, lecturas de `detalle.<campo>` sin `??`, y `envs.<nombre>` sin `ENV_<NOMBRE>` en `infra/kestra/compose.yaml`.
- [ ] T002 Crear `infra/kestra/verificar-flows.test.mjs`: un caso inyectado por regla (falla) y el árbol real de `infra/kestra/flows/` (pasa).
- [ ] T003 `package.json`: `test:kestra:flows`; sumarlo al job `application` de `.github/workflows/validate.yml`.

**Checkpoint**: las tres reglas fallan con su caso inyectado y pasan con el árbol actual.

## Phase 2: User Stories 1 y 2 - Despachador genérico con detalle opcional (Priority: P1) 🎯 MVP

- [ ] T004 [US2] Crear `infra/kestra/flows/despacho-capacidad.yml` según `contracts/despacho-por-capacidad.md`: inputs, `Switch` con un `case` de ejemplo y `default` `CAPACIDAD_SIN_FLOW`, `confirmar` y `errors` con `liberar`.
- [ ] T005 [US2] Crear `infra/kestra/flows/despacho-outbox.yml`: reclamo, `ForEach` con `allowFailure`, `Subflow` con el `detalle` entero (`?? {}`). Si hace falta, sumar la sustitución de `concurrencyLimit` en `infra/kestra/renderizar-flow.mjs`.
- [ ] T006 [US1] Publicar los dos flows en el Kestra local (`pnpm kestra:deploy-flow`) y verificar que Kestra 1.3.35 acepta el input `detalle` como JSON; si no, aplicar el fallback STRING de research.md (Decisión 2) y anotar el desvío con `ver commit <hash>`.
- [ ] T007 [US1] E2E local (quickstart.md): orden con `detalle = {}` y con campo cargado, ambas confirmadas en el primer reclamo; capacidad sin `case` liberada con `CAPACIDAD_SIN_FLOW`.

**Checkpoint**: SC-001, SC-002.

## Phase 3: User Story 3 - Variables de entorno al publicar (Priority: P2)

- [ ] T008 [US3] `infra/kestra/desplegar-flow.mjs`: antes de llamar a la API, aplicar la verificación de envs de T001 y abortar nombrando la variable.
- [ ] T009 [US3] `infra/kestra/desplegar-flow.test.mjs`: caso de rechazo con una variable no declarada, sin llamada HTTP.
- [ ] T010 [US3] `docs/adoptar-ciclo-ejecuciones.md`: recrear el contenedor de Kestra al sumar una variable en `compose.yaml`, con el incidente del producto como ejemplo.

**Checkpoint**: SC-003.

## Phase 4: Polish

- [ ] T011 [P] `specs/019-outbox-ejecuciones/contracts/despacho-outbox.md`: campos opcionales del `detalle` y regla de inputs con default; actualizar el comentario de las plantillas que hoy describe el reclamo.
- [ ] T012 [P] `template-capabilities.json`: sumar los dos flows a `durable-execution-outbox` y subir su versión; subir `safe-kestra-flow-publication`.
- [ ] T013 `pnpm lint`, `pnpm build`, `pnpm infra:config`, `pnpm docs:check`, `pnpm template:capabilities:check`, `pnpm test:kestra:deploy-flow`.
- [ ] T014 Code-review del diff contra `main` antes de pedir merge (más `kestra-orquestacion` para los flows).

## Dependencies & Execution Order

- Phase 1 antes de Phase 2: los flows nuevos tienen que pasar las verificaciones desde el primer commit.
- T006 antes de T007: confirma la forma del input `detalle`.
- Phase 3 depende solo de T001.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md` (regla del `CLAUDE.md` del template): fila en "Backlog entregado" con el link a la spec. Anotar como candidato pendiente el usuario JDBC del pooler (research.md, Decisión 5). Avisar al producto derivado (research.md, "Cómo vuelve al producto").
