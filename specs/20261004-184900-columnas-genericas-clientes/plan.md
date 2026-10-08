# Implementation Plan: Estado, contacto y borrado restringido de clientes

**Branch**: `columnas-genericas-clientes` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261004-184900-columnas-genericas-clientes/spec.md`

## Summary

Una migración aditiva suma a `public.clientes` estado, contacto,
observaciones y `updated_at`; fija las fechas por trigger; agrega el motivo de
no borrado (FK automáticas + punto de extensión del producto) y dos RPCs
(`cliente_es_borrable`, `borrar_cliente`). La pantalla de clientes muestra y
edita los campos nuevos, filtra por estado y ofrece "Borrar" o "Dar de baja"
según corresponda.

## Technical Context

**Language/Version**: SQL (Postgres 17), TypeScript + React (Refine, MUI) en `apps/web`

**Primary Dependencies**: Refine, `@refinedev/supabase`, componentes del kit `operable-refine-panel` (`ContenidoAdaptable`)

**Storage**: Postgres (`public.clientes`)

**Testing**: pgTAP (`clientes_ciclo_de_vida.test.sql`), Vitest para la pantalla

**Target Platform**: Supabase local/Cloud y Refine (Vercel)

**Project Type**: web + base de datos

**Performance Goals**: el motivo de no borrado hace un `exists` por FK hacia `clientes` (hoy 1); cada una usa el índice de su columna

**Constraints**: migración aditiva; sin `DELETE` directo; RLS sin cambios de alcance

**Scale/Scope**: 1 migración, 1 prueba pgTAP, 3 pantallas existentes

## Constitution Check

- **I. Aislamiento**: los RPCs verifican organización y permiso; `P0002` no distingue "otra organización". OK.
- **III. Auditables**: fechas fijadas por la base. OK.
- **V. Simplicidad**: motivo por FK en vez de listas que cada producto reescribe. OK.
- **VI. Panel operable**: usa el kit de páginas existente. OK.
- **VII. Documentación**: punto de extensión documentado en `docs/crear-producto-derivado.md`. OK.

## Delivery

| Producto | Archivo que cambia | Validación | Destino |
|---|---|---|---|
| supabase | `supabase/migrations/<version>_clientes_ciclo_de_vida.sql` | pgTAP local y CI | Supabase Cloud (`migraciones-cloud`) |
| refine | `apps/web/src/pages/clientes/{list,create,edit}.tsx` | Vitest, `pnpm build`, prueba manual | Vercel |

## Project Structure

### Documentation (this feature)

```text
specs/20261004-184900-columnas-genericas-clientes/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/rpc-clientes.md
└── tasks.md
```

### Source Code (repository root)

```text
supabase/migrations/<version>_clientes_ciclo_de_vida.sql
supabase/tests/database/clientes_ciclo_de_vida.test.sql
apps/web/src/pages/clientes/list.tsx      # columnas estado/contacto, filtro por estado, acciones
apps/web/src/pages/clientes/create.tsx    # contacto y observaciones
apps/web/src/pages/clientes/edit.tsx      # estado, contacto, observaciones, Borrar / Dar de baja
apps/web/src/pages/clientes/*.test.tsx    # pruebas de la pantalla
docs/crear-producto-derivado.md           # punto de extensión del motivo
docs/schema.html                          # pnpm docs:schema
template-capabilities.json                # capacidad clientes-ciclo-de-vida
```

**Structure Decision**: funciones de plataforma en `public`/`private`, como
el resto del template; nada en `dominio`. Skills a cargar al implementar:
`supabase-postgres-best-practices`, `refine-frontend`, `mui-refine`,
`frontend-design` y `authz-security` para la revisión.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| SQL dinámico en `private.motivo_cliente_no_borrable` | detectar referencias de tablas que todavía no existen | una lista fija obliga a cada producto a reescribir la función (research.md, Decisión 2) |
