# Implementation Plan: Privilegios por defecto acotados en los esquemas expuestos

**Branch**: `privilegios-por-defecto-public` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261004-184815-privilegios-por-defecto-public/spec.md`

## Summary

Una migración revoca `TRUNCATE`, `REFERENCES`, `TRIGGER` y `MAINTAIN` de
`anon`/`authenticated` en todas las relaciones de `public` y `dominio`, y
corrige los default privileges de `postgres` en esos esquemas. Una prueba
pgTAP fija la invariante. El reset de la base del CI pasa a vaciar `public`
en vez de borrarlo, para no perder los default privileges de Supabase y que
la prueba no pase en vacío (research.md, Decisión 4).

## Technical Context

**Language/Version**: SQL (Postgres 17 de Supabase), Node 22 ESM para el reset del CI

**Primary Dependencies**: Supabase CLI, pgTAP, `psql`

**Storage**: Postgres (catálogo de privilegios)

**Testing**: pgTAP (`supabase test db` en local, `pnpm test:db:ci` en el CI), `node --test scripts/supabase-ci.test.mjs`

**Target Platform**: Supabase local (CLI) y Supabase Cloud

**Project Type**: monorepo de plataforma

**Performance Goals**: N/A (migración de catálogo, segundos)

**Constraints**: idempotente; no tocar grants explícitos ni `service_role`

**Scale/Scope**: todas las relaciones de dos esquemas

## Constitution Check

- **I. Aislamiento multi-tenant**: refuerza la defensa en profundidad de RLS. OK.
- **II. Especificar antes de implementar**: esta spec. OK.
- **III. Idempotentes y auditables**: la migración es idempotente (`revoke` de algo inexistente no falla). OK.
- **IV. Despliegues independientes**: solo `supabase`. OK.
- **V. Simplicidad**: una migración, una prueba, un cambio acotado al reset. OK.
- **VII. Documentación**: convención en `docs/architecture.md` y `docs/adoptar-ci-base-aislada.md`. OK.

## Delivery

| Producto | Archivo que cambia | Validación | Destino |
|---|---|---|---|
| supabase | `supabase/migrations/<version>_privilegios_por_defecto_api.sql` | pgTAP local y CI | Supabase Cloud (`migraciones-cloud`) |
| supabase (tooling CI) | `scripts/reset-db-ci.mjs` | job `database` del CI | CI |

## Project Structure

### Documentation (this feature)

```text
specs/20261004-184815-privilegios-por-defecto-public/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/migrations/<version>_privilegios_por_defecto_api.sql   # nueva
supabase/tests/database/privilegios_por_defecto_api.test.sql    # nueva
scripts/reset-db-ci.mjs                                         # vaciar public en vez de borrarlo
template-capabilities.json                                      # capacidad nueva + isolated-ci-database y portable-typescript-tooling suben versión
docs/architecture.md                                            # convención de grants
docs/adoptar-ci-base-aislada.md                                 # el reset ya no borra public
```

**Structure Decision**: la migración usa un bloque `do` que recorre
`pg_class` de los dos esquemas (`relkind in ('r','p','v','m','f')`) y emite
`revoke truncate, references, trigger, maintain on <rel> from anon,
authenticated`. Después, `alter default privileges for role postgres in
schema public, dominio revoke truncate, references, trigger, maintain on
tables from anon, authenticated`. El reset del CI recorre los objetos de
`public` (tablas, vistas, funciones, tipos, secuencias sueltas) y los borra
con `cascade`, conservando el esquema.

**Coordinación**: `guarda-versiones-migraciones` también cambia
`scripts/reset-db-ci.mjs` y sube las mismas capacidades. La que se mergee
segunda rebasa y sube la versión una vez más.

## Complexity Tracking

Sin violaciones.
