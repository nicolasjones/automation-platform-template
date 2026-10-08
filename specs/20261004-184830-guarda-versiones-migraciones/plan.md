# Implementation Plan: Guarda de versiones únicas de migraciones

**Branch**: `guarda-versiones-migraciones` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261004-184830-guarda-versiones-migraciones/spec.md`

## Summary

Traer del producto la guarda que falla si dos migraciones comparten versión,
correrla en el job `application` del CI y llamarla desde
`scripts/reset-db-ci.mjs` antes de tocar la base.

## Technical Context

**Language/Version**: Node 22 ESM

**Primary Dependencies**: solo `node:` (sin dependencias nuevas)

**Storage**: N/A

**Testing**: `node --test`

**Target Platform**: runners self-hosted del CI y máquinas de desarrollo

**Project Type**: tooling del monorepo

**Performance Goals**: N/A (lee un directorio)

**Constraints**: falla antes de cualquier efecto sobre la base

**Scale/Scope**: un script, un test, dos cambios de CI/tooling

## Constitution Check

- **II. Especificar antes de implementar**: esta spec. OK.
- **IV. Despliegues independientes**: no toca despliegues. OK.
- **V. Simplicidad**: una función pura reutilizada en dos puntos. OK.
- **VII. Documentación**: convención en `docs/adoptar-ci-base-aislada.md` y `docs/architecture.md`. OK.

## Delivery

| Producto | Archivo que cambia | Validación | Destino |
|---|---|---|---|
| supabase (tooling) | `scripts/verificar-versiones-migraciones.mjs`, `scripts/reset-db-ci.mjs` | `node --test`, job `database` | CI |
| CI | `.github/workflows/validate.yml` | el propio workflow | GitHub Actions (runners self-hosted) |

## Project Structure

### Documentation (this feature)

```text
specs/20261004-184830-guarda-versiones-migraciones/
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
scripts/verificar-versiones-migraciones.mjs        # nuevo (copia del producto)
scripts/verificar-versiones-migraciones.test.mjs   # nuevo (copia del producto)
scripts/reset-db-ci.mjs                            # importa y llama a la guarda primero
package.json                                       # migrations:check; test sumado a test:tooling
.github/workflows/validate.yml                     # pasos en el job application
template-capabilities.json                         # migration-version-guard + versiones
docs/adoptar-ci-base-aislada.md, docs/architecture.md
```

**Structure Decision**: sin `data-model.md` ni `contracts/`: no hay datos ni
API. El contrato es la salida del script (código de salida y lista de
problemas), fijado por su test.

**Coordinación**: `privilegios-por-defecto-public` también cambia
`scripts/reset-db-ci.mjs`; la que se mergee segunda rebasa y vuelve a subir
las versiones.

## Complexity Tracking

Sin violaciones.
