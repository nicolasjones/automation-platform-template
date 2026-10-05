# Implementation Plan: Promover todo a producción (botón único)

**Branch**: `20261005-140934-boton-unico-prd` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261005-140934-promover-todo-produccion/spec.md`

## Summary

Un workflow de GitHub Actions nuevo (`promover-todo-a-produccion.yml`, solo `workflow_dispatch`) agrupa en un único disparo manual la promoción a producción de los 3 mecanismos ya gateados por `gate-migraciones-stg-prd` (reutilizados vía `workflow_call`, sin duplicar sus steps) más un 4º mecanismo nuevo para Refine/Vercel (hoy sin ningún gate): se introduce una rama `production` como destino explícito de promoción, reasignando el dominio de producción del proyecto Vercel a esa rama en vez de `main` — `main` pasa a comportarse como el staging persistente que falta hoy.

## Technical Context

**Language/Version**: YAML (GitHub Actions) + Node.js ESM (scripts ya existentes, sin cambios de lenguaje)

**Primary Dependencies**: `workflow_call` nativo de GitHub Actions; `scripts/verificar-staging-exitoso.mjs` (ya existente, reutilizado sin cambios); API REST de Vercel (`PATCH /v9/projects/{id}/domains/{domain}`, una sola vez, fuera del workflow recurrente)

**Storage**: N/A

**Testing**: `node --test` sobre los scripts existentes (sin scripts nuevos en esta spec); verificación en vivo del workflow nuevo vía `workflow_dispatch` de prueba, igual que `gate-migraciones-stg-prd`

**Target Platform**: GitHub Actions self-hosted (`[self-hosted, platform-local]`, regla ya vigente del CLAUDE.md); Vercel (proyecto ya existente, sin infraestructura nueva)

**Project Type**: automatización de CI/CD — extensión de un mecanismo de plataforma ya existente, no una pantalla ni una librería

**Performance Goals**: N/A — acción manual de baja frecuencia, no sensible a latencia

**Constraints**: no depender de GitHub Team/Enterprise ni de que el repo sea público (mismo criterio que `gate-migraciones-stg-prd`); no duplicar los steps de los 3 workflows ya gateados; no introducir un secret nuevo (`VERCEL_TOKEN`) si el enfoque de rama lo evita; no tocar el disparo automático de `staging` de ningún mecanismo

**Scale/Scope**: 4 mecanismos de producción hoy (migraciones Supabase, VPS/Kestra/Superset/Nango, flows de Kestra, Refine); diseñado para que mecanismos futuros se sumen sin rediseñar el punto de disparo único (FR-007/SC-004)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principio IV (Un monorepo, despliegues independientes)** — PASA. El botón único no fusiona los ciclos de despliegue de Refine/Supabase/Kestra/Superset en uno solo: cada mecanismo sigue siendo su propio job con su propia verificación de staging; el workflow nuevo es solo un punto de disparo compartido, no un pipeline fusionado.
- **Principio V (Simplicidad operativa)** — PASA. No se agrega infraestructura nueva: reutiliza `workflow_call` (nativo de GitHub Actions) y la integración Git ya existente de Vercel. La única credencial nueva evaluada (`VERCEL_TOKEN` para `vercel promote`) se descartó explícitamente en `research.md` §3 por no ser necesaria.
- **Principio VI (Panel operable y extensible)** — N/A. No agrega, mueve ni rediseña ninguna pantalla del panel de Refine.
- **Technology and Quality Gates** — PASA. No hay migraciones de Supabase ni cambios de Compose en esta spec; los scripts reutilizados ya tienen sus tests (`node --test`), no se tocan.
- **Delivery Workflow** — PASA. PR #29 abierto contra `main` al crear la rama (antes de este plan), consistente con la regla de abrir el PR al crear la rama, no al terminar.
- **Principio VII (Documentación como parte del cambio)** — EN PROGRESO, se resuelve en Phase 1: `contracts/workflow-gate.md` gana la regla de que todo mecanismo nuevo con staging→producción se suma a este punto único (FR-007), y `docs/adoptar-cicd-staging-produccion.md` documenta el workflow nuevo y el bootstrap de Vercel.

Sin violaciones — no aplica Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/20261005-140934-promover-todo-produccion/
├── plan.md
├── research.md
├── contracts/
│   └── promover-todo-a-produccion.md
├── quickstart.md
└── tasks.md          # Phase 2 output (/speckit-tasks — no se crea en este comando)
```

### Source Code (repository root)

```text
.github/workflows/
├── migraciones-cloud.yml              # gana trigger workflow_call + if ampliado (sin duplicar steps)
├── deploy-infraestructura-vps.yml     # idem
├── publicar-flows-kestra.yml          # idem
└── promover-todo-a-produccion.yml     # nuevo — workflow_dispatch único, llama a los 3 + job de Refine

docs/
├── adoptar-cicd-staging-produccion.md  # documenta el workflow nuevo y el bootstrap de Vercel
└── (sin cambios de código en apps/web ni en scripts/ — no hace falta ningún script nuevo)

specs/20261003-105444-cicd-staging-produccion/contracts/
└── workflow-gate.md                    # gana la regla: todo mecanismo nuevo se suma al punto único
```

**Structure Decision**: No hay proyecto de aplicación nuevo — esta spec extiende únicamente la capa de CI/CD (`.github/workflows/`) y su documentación de contrato ya existente, sin tocar `apps/`, `scripts/` (nuevos) ni `supabase/`. No aplica ningún Option de la plantilla (single-project/web-app/mobile).
