# Implementation Plan: Fallback de navegación asistido por IA

**Branch**: `fallback-navegacion-ia-generico` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261003-150125-fallback-navegacion-ia/spec.md`

## Summary

Capa de orquestación, sin persistencia propia, que permite a un worker de navegador recuperar un paso bloqueado proponiendo (vía `@platform/ia`) una acción dentro de un vocabulario cerrado declarado por el consumidor, verificándola localmente antes de continuar. Se entrega como nuevo paquete `packages/ia-navegacion`, dependiente de `@platform/ia`, con una sola función pública (`intentarRecuperarPaso`, ver `contracts/ia-navegacion.md`). El hallazgo clave del research es que un rechazo de verificador ya es terminal en el núcleo existente (sin fallback) — ver `research.md` Decisión 2 — lo que simplificó la spec original.

## Technical Context

**Language/Version**: TypeScript ~6.0.2 (misma versión que `@platform/ia`), Node.js 24, ESM (`"type": "module"`).

**Primary Dependencies**: `@platform/ia` (workspace, obligatoria). Sin dependencia de Playwright en este paquete: los tipos de `Locator`/`Page` quedan del lado del consumidor, a través de `AdaptadorInvocacionIa.ejecutarAccion` — este paquete solo recibe y llama funciones que el consumidor ya conectó a su propio navegador.

**Storage**: N/A (ver research.md, Decisión 3 — sin tablas ni migraciones de Supabase).

**Testing**: Vitest (mismo runner que `@platform/ia`), con fixtures puras (sin red, sin navegador real) — ver `quickstart.md`.

**Target Platform**: biblioteca Node.js consumida por workers (`workers/*`) de productos derivados; también ejecutable desde el propio `@platform/web`/Kestra si algún consumidor futuro lo necesitara, aunque el caso previsto es workers.

**Project Type**: librería interna del monorepo (paquete en `packages/`), sin UI ni endpoint propio.

**Performance Goals**: N/A explícito — el presupuesto de intentos/tiempo ya lo acota `@platform/ia` (máximo 90s / 2 intentos por política). Esta capa no agrega latencia relevante más allá de la invocación al proveedor y la ejecución de una acción de navegador.

**Constraints**: no DEBE importar tipos de Playwright directamente (mantiene el paquete agnóstico de runtime de navegador); no DEBE agregar persistencia, auditoría ni canal de observabilidad propios (FR-010).

**Scale/Scope**: una función pública, cuatro tipos de acción permitida predefinidos (ver `data-model.md`), cero tablas, cero endpoints.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Aislamiento multi-tenant por diseño**: N/A directo — no hay tabla ni dato expuesto por RLS; el aislamiento por organización ya lo resuelve `@platform/ia` en su propia capa de políticas/claves. PASA.
- **II. Especificar antes de implementar**: spec, clarify y este plan preceden a tasks/implement. PASA.
- **III. Automatizaciones idempotentes y auditables**: el checkpoint de reanudación (FR-006) es responsabilidad declarada del consumidor, pero la propia invocación de esta capa es idempotente en el sentido de que nunca repite una acción tras un resultado terminal; la auditoría la hereda íntegra de `@platform/ia` (FR-010). PASA.
- **IV. Un monorepo, despliegues independientes**: nuevo paquete en `packages/`, sin Compose propio (no es un servicio desplegable). PASA.
- **V. Simplicidad operativa**: sin infraestructura nueva; corrige además un gap de CI preexistente necesario para que esta misma entrega sea verificable (research.md, Decisión 5). PASA.
- **VI. Panel operable y extensible**: N/A — no hay pantalla ni automatización operable en el panel; esta es una biblioteca de soporte sin superficie de UI.
- **VII. Documentación como parte del cambio**: este plan + `packages/ia-navegacion/README.md` (a crear en implement) + actualización de `docs/roadmap-template.md` satisfacen la regla. Pendiente de verificar con `pnpm docs:check` en implement.

Sin violaciones. No se requiere **Complexity Tracking**.

## Project Structure

### Documentation (this feature)

```text
specs/20261003-150125-fallback-navegacion-ia/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── ia-navegacion.md
└── tasks.md          # generado por /speckit-tasks
```

### Source Code (repository root)

```text
packages/ia-navegacion/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts
    ├── tipos.ts              # PasoRecuperable, AccionPermitida, Verificador, CheckpointReanudacion, ResultadoInvocacion
    ├── intentarRecuperarPaso.ts
    └── intentarRecuperarPaso.test.ts
```

**Structure Decision**: paquete nuevo `packages/ia-navegacion`, paralelo a `packages/ia`, mismo layout (`src/` plano, sin subcarpetas de framework) y mismo runner de test (Vitest) para minimizar la carga cognitiva de quien ya conoce `packages/ia`. Se agregan, en el mismo cambio: `test:ia` en el `package.json` raíz y su paso correspondiente en `.github/workflows/validate.yml` (research.md, Decisión 5).

## Complexity Tracking

No aplica — sin violaciones de la Constitution Check.
