# Implementation Plan: CI/CD staging → producción para migraciones, VPS, flows y dashboards

**Branch**: `20261003-105444-cicd-staging-produccion` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261003-105444-cicd-staging-produccion/spec.md`

**Actualización (decisión del coordinador, ver `tasks.md` T027)**: donde este plan dice "`needs` + GitHub Environment de producción con required reviewers", leer "`production` disparado manualmente vía `workflow_dispatch`, sin `needs`" — required reviewers resultó no estar disponible sin un plan de pago de GitHub. Detalle en `research.md` §6 (revisado) y `contracts/workflow-gate.md`.

## Summary

Extender el patrón "push → deploy automático a staging → aprobación manual → producción" (ya vigente para la app web vía Vercel y las imágenes de workers vía `worker-images.yml`) a los tres componentes que hoy son manuales — migraciones de Supabase cloud, deploy de infraestructura del VPS, y publicación de flows de Kestra — usando el mismo gate nativo de GitHub Actions (dos jobs por workflow, `needs` + GitHub Environment de producción con required reviewers), y dejar listo un cuarto mecanismo (wrapper de import de dashboards de Superset) sin wiring automático todavía. El enfoque técnico prioriza reutilizar scripts ya existentes (`scripts/deploy-vps.mjs`, `infra/kestra/desplegar-flow.mjs`) sin reescribirlos, resolviendo la conectividad del runner hacia el VPS real mediante `DOCKER_HOST=ssh://...` (mismo patrón SSH ya usado para el despacho de workers, spec 014) en vez de migrar el runner de máquina.

## Technical Context

**Language/Version**: Node.js ESM (`.mjs`), consistente con `portable-typescript-tooling` (capacidad ya adoptada por el repo)

**Primary Dependencies**: GitHub Actions (runner self-hosted `[self-hosted, platform-local]`), Supabase CLI (`supabase db push`), Docker CLI + `docker compose` (vía SSH remoto), API REST de Kestra (ya consumida por `desplegar-flow.mjs`), API REST de Superset (nueva integración)

**Storage**: N/A para esta spec (no agrega tablas; toca Postgres cloud de staging/producción solo a través de `supabase db push`)

**Testing**: `node --test` (patrón ya usado por `desplegar-flow.test.mjs`, `supabase-ci.test.mjs`) para los scripts nuevos/ampliados; validación end-to-end manual vía `quickstart.md` para los tres workflows (no hay forma de testear un GitHub Environment con required reviewers fuera de GitHub mismo)

**Target Platform**: runner self-hosted de GitHub Actions (contenedor Linux, Docker-fuera-de-Docker, socket montado) controlando remotamente el Docker del VPS por SSH

**Project Type**: tooling de plataforma (scripts CLI + workflows de CI) — no es ni librería, ni app web, ni móvil

**Performance Goals**: N/A — no es una ruta con requisitos de latencia; el objetivo es correctitud y trazabilidad del gate, no velocidad

**Constraints**: `runs-on: [self-hosted, platform-local]` obligatorio (nunca `ubuntu-latest`); ninguna credencial persiste en el filesystem del VPS; ninguna migración destructiva sin camino de reversión en el mismo PR que la crea; el wrapper de Superset no se dispara automáticamente mientras no exista un paquete de dashboard versionado

**Scale/Scope**: 3 workflows nuevos + 1 script nuevo (`migrar-supabase-cloud.mjs`) + 1 script nuevo (`importar-dashboards.mjs`) + 1 cambio a `infra/runner/Dockerfile` (agregar `openssh-client`) + actualización de `template-capabilities.json` + nueva guía `docs/adoptar-cicd-staging-produccion.md` + actualización de `docs/deployment.md`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación |
|---|---|
| I. Aislamiento multi-tenant por diseño | Cumple — ninguna credencial nueva vive en el navegador; `SUPABASE_DB_URL` es una cadena de conexión acotada al proyecto, no una service-role key ni un token de cuenta amplio (ver `research.md` §3). |
| II. Especificar antes de implementar | Cumple — esta spec es el resultado del pipeline `speckit-assess-*` (verdict go) seguido de `/speckit-specify`; este plan referencia FR-001 a FR-015 concretos. |
| III. Automatizaciones idempotentes y auditables | Cumple — `supabase db push` es idempotente (no reaplica migraciones ya aplicadas); `docker compose up -d` es idempotente; `desplegar-flow.mjs` ya hace PUT si el flow existe o POST si no; el log de cada job de GitHub Actions + el click de aprobación del reviewer ya registran actor y timestamp sin necesidad de una tabla de auditoría nueva. |
| IV. Un monorepo, despliegues independientes | Cumple — tres workflows separados, uno por mecanismo; ninguno introduce un Compose raíz. |
| V. Simplicidad operativa | **Excepción documentada** — el wrapper de import de dashboards de Superset (User Story 4) se construye sin que exista hoy ningún caso de uso real, lo que en principio choca con "se agrega infraestructura sólo cuando existe un caso de uso". Ver Complexity Tracking abajo: excepción explícitamente aceptada por el coordinador del producto (`.specify/assessments/cicd-staging-produccion/decision.md`), no una decisión unilateral de este plan. |
| VI. Panel operable y extensible | N/A — esta spec no agrega ni modifica ninguna pantalla del panel de Refine. |
| VII. Documentación como parte del cambio | Cumple (planificado) — `docs/deployment.md`, nuevo `docs/adoptar-cicd-staging-produccion.md`, y `template-capabilities.json` se actualizan como parte de la misma entrega; `pnpm docs:check` lo exige en CI. |

**Resultado**: Gate superado, con una excepción documentada (Principio V) ya aceptada explícitamente por el coordinador antes de llegar a esta fase — ver Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/20261003-105444-cicd-staging-produccion/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/             # Phase 1 output (/speckit-plan command)
│   ├── workflow-gate.md
│   ├── cli-migrar-supabase-cloud.md
│   ├── cli-deploy-vps-ci.md
│   └── cli-importar-dashboards-superset.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
.github/workflows/
├── migraciones-cloud.yml              # nuevo — User Story 1
├── deploy-infraestructura-vps.yml     # nuevo — User Story 2
└── publicar-flows-kestra.yml          # nuevo — User Story 3

scripts/
├── migrar-supabase-cloud.mjs          # nuevo — User Story 1
├── migrar-supabase-cloud.test.mjs     # nuevo
└── deploy-vps.mjs                     # sin cambios de código (ver research.md §1-2)

infra/
├── runner/Dockerfile                  # modificado — agrega openssh-client
├── kestra/desplegar-flow.mjs          # sin cambios de código — User Story 3
└── superset/
    ├── importar-dashboards.mjs        # nuevo — User Story 4
    └── importar-dashboards.test.mjs   # nuevo

docs/
├── deployment.md                      # actualizado
└── adoptar-cicd-staging-produccion.md # nuevo

template-capabilities.json             # actualizado — nueva(s) capacidad(es)
.env.example                           # actualizado — claves nuevas, sin valores
```

**Structure Decision**: Es tooling de plataforma, no una app con capas model/service/api — se mantiene la convención ya vigente del repo (`scripts/*.mjs`, `infra/<producto>/*.mjs`, workflows en `.github/workflows/`), sin introducir ninguna carpeta `src/`/`backend/`/`frontend/` nueva. No aplica ninguna de las opciones de estructura del template genérico (no es un proyecto single/web/mobile) — se documenta la estructura real en vez de forzar el template.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Principio V (simplicidad operativa): construir el wrapper de import de dashboards de Superset sin ningún caso de uso de negocio activo | El coordinador del producto confirmó explícitamente incluirlo ya en esta spec (Opción A de `.specify/assessments/cicd-staging-produccion/concept.md`), para no tener que retomar esta pieza en una segunda spec cuando el producto en paralelo exporte su primer dashboard. Documentado como decisión consciente, no como omisión. | Diferirlo a una spec aparte (Opción B del assessment) era la alternativa más alineada con el principio — se rechazó porque el coordinador prioriza tener el mecanismo listo de antemano sobre minimizar superficie construida sin uso inmediato. |
