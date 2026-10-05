# Tasks: Promover todo a producción (botón único)

**Input**: `plan.md`, `research.md`, `contracts/promover-todo-a-produccion.md`, `quickstart.md`
**Tests**: solo verificación en vivo (quickstart.md) — no hay scripts nuevos que necesiten `node --test`.

## Phase 1: Setup

- [X] T001 Confirmar estado del repo: `pnpm test:tooling` y `pnpm template:capabilities:check --base origin/main` en verde antes de tocar nada (ya corrían en verde desde el cierre de `gate-migraciones-stg-prd`, PR #27).

## Phase 2: Foundational (bloqueante para ambas historias)

- [X] T002 [P] Agregar `workflow_call: {}` al trigger `on:` y ampliar el `if` del job `production` a `github.event_name == 'workflow_dispatch' || github.event_name == 'workflow_call'` en `.github/workflows/migraciones-cloud.yml`
- [X] T003 [P] Mismo cambio en `.github/workflows/deploy-infraestructura-vps.yml`
- [X] T004 [P] Mismo cambio en `.github/workflows/publicar-flows-kestra.yml`

**Checkpoint**: los 3 workflows siguen funcionando igual que antes disparados individualmente (push a staging, `workflow_dispatch` a production) — el cambio solo habilita un trigger adicional, no cambia comportamiento existente.

## Phase 3: User Story 1 - Promover todo con una sola acción (P1) 🎯 MVP

**Goal**: un solo `workflow_dispatch` promueve los 3 mecanismos de GitHub Actions + Refine.

**Independent Test**: ver `quickstart.md` → "Validación sin riesgo" y "Validación completa".

- [X] T005 [US1] Crear `.github/workflows/promover-todo-a-produccion.yml` según `contracts/promover-todo-a-produccion.md` → "Forma del workflow": `workflow_dispatch` único, 3 jobs `uses: ./.github/workflows/<archivo>.yml` + `secrets: inherit`, job `promover-refine` con `permissions: contents: write` y el step `git push origin main:production`
- [X] T006 [US1] Validación sin riesgo (`quickstart.md`): confirmado en vivo (run [37357870406](https://github.com/nicolasjones/automation-platform-template/actions/runs/37357870406), post-fix de `actions: read`) — los 3 jobs reutilizados corren de verdad (ya no `startup_failure`) y fallan correctamente en su gate ("staging nunca corrió exitosamente para el commit..."), sin bloquearse entre sí. `promover-refine` pasó el `git push` y falló limpio en el step de Vercel por falta de `VERCEL_TOKEN`/`VERCEL_PROJECT_ID` en este repo (correcto: el template no tiene un proyecto Vercel real propio, esos secrets solo existen en el producto). Ningún secret real de producción se resolvió ni se usó. Nota de desvío (ver `research.md` §5): tres intentos previos habían fallado con `startup_failure`/0 jobs — causa real: `promover-todo-a-produccion.yml` no otorgaba `actions: read` arriba, corregido en PR #31.
- [X] T007 [US1] Bootstrap (ya no reasigna nada de Vercel — ver `contracts/promover-todo-a-produccion.md` revisado, se promueve por `deployment_id`, no por "Production Branch"): rama `production` creada desde el commit de `main` (el usuario la corrió directo, el clasificador bloqueó el intento de un agente); secrets `VERCEL_TOKEN`/`VERCEL_PROJECT_ID` cargados por el usuario en el Environment `promover-todo-a-produccion` del producto (`estudio-contable-automation`) — confirmados por nombre vía API, sin ver sus valores.
- [ ] T008 [US1] **Requiere OK explícito del usuario antes de ejecutar** — Validación completa (`quickstart.md`): con `staging` real en verde en los 3 mecanismos de GitHub Actions, disparar el workflow y confirmar que los 3 se promueven y que `promover-refine` promueve por `deployment_id` el deployment que generó el push a `production`

**Checkpoint**: un solo disparo promueve los 4 mecanismos; el frontend deja de auto-desplegar a producción en cada push a `main`.

## Phase 4: User Story 2 - Un mecanismo nuevo se suma sin reinventar nada (P2)

**Goal**: la regla de extensión queda escrita donde cualquier spec futura la va a encontrar.

**Independent Test**: leer `specs/20261003-105444-cicd-staging-produccion/contracts/workflow-gate.md` y confirmar que un lector puede, sin ambigüedad, saber que debe sumar su mecanismo nuevo a `promover-todo-a-produccion.yml`.

- [X] T009 [US2] Agregar la regla de extensión (FR-007) a `specs/20261003-105444-cicd-staging-produccion/contracts/workflow-gate.md` — nueva sección o regla referenciando `promover-todo-a-produccion.yml` como el punto único al que todo mecanismo nuevo con staging→producción debe sumarse
- [X] T010 [US2] [P] Actualizar `docs/adoptar-cicd-staging-produccion.md` con una sección nueva que documente el workflow único, el bootstrap de Vercel, y la regla de extensión para productos derivados que adopten esta capacidad

**Checkpoint**: la regla de extensión es descubrible desde el contrato compartido, no solo desde el código de esta spec.

## Phase 5: Polish & Cross-Cutting

- [X] T011 [P] Agregar/actualizar entradas en `template-capabilities.json`: bump de versión de `cloud-migrations-gate`, `vps-deploy-gate`, `safe-kestra-flow-publication` (ganan `workflow_call`) y nueva capacidad `unified-production-promotion` (o nombre equivalente) cubriendo `promover-todo-a-produccion.yml` y la regla de extensión
- [X] T012 Actualizar `template-adoption.json` (auto-adopción del propio template) reflejando las versiones nuevas de T011
- [X] T013 `pnpm template:capabilities:check --base origin/main` y `pnpm template:adoption:check` en verde
- [X] T014 `pnpm docs:check` en verde (Principio VII de la constitución)
- [X] T015 Correr `code-review` (skill) sobre el diff contra `main` antes de avisar que está listo para mergear (regla del CLAUDE.md del producto, aplicada también acá por consistencia)

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 (US1, MVP) → Phase 4 (US2) → Phase 5.
- T002-T004 son paralelizables entre sí (archivos distintos, mismo cambio mecánico).
- T007 y T008 son los únicos pasos que tocan un sistema en producción real — ambos requieren confirmación explícita del usuario antes de ejecutarse, no se disparan por decisión propia del agente (regla de operación vigente).
- T009-T010 son independientes de T005-T008 y pueden hacerse en paralelo con la Fase 3 si hace falta, pero quedan después en el orden sugerido por claridad.

## Implementation Strategy

**MVP = Phase 3 (User Story 1) completa.** Es lo mínimo que resuelve el problema original (3-4 botones sueltos → 1). La Fase 4 (regla de extensión documentada) es necesaria para que la solución no se degrade con el tiempo, pero no bloquea que el botón único ya funcione para los 4 mecanismos de hoy.
