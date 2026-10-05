# Implementation Plan: Proveedor elegible por capacidad

**Branch**: `proveedor-elegible-por-capacidad` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

## Summary

Catálogo `public.capacidades_proveedores` (capacidad x proveedor, default,
requisitos), elección por organización y excepción por cliente con
auditoría (`public.eventos_proveedor_capacidad`), y una función de
resolución `private.resolver_proveedor_capacidad` (cliente → organización →
catálogo, con disponibilidad y sin sustitución). Trigger de consistencia
(`organizacion_id` del cliente) y trigger de retiro de catálogo (cascada +
auditoría cuando un proveedor pasa a inactivo).

## Technical Context

**Language/Version**: SQL (Postgres de Supabase).

**Primary Dependencies**: `sistemas_externos` (spec
`20260930-165358-catalogo-sistemas-externos`), `clientes`/`organizaciones`
(spec `003-fundacion-multitenant`), `conexiones` (spec
`013-orquestacion-multi-organizacion`), `private.organizacion_id()` /
`private.es_administrador_de()`.

**Storage**: 4 tablas nuevas en `public`, sin filas de catálogo (vacío a
propósito, igual criterio que `sistemas_externos`).

**Testing**: pgTAP (`supabase/tests/database/proveedor_elegible_por_capacidad.test.sql`):
RLS/aislamiento, precedencia completa, disponibilidad, no sustitución,
aceptación requerida, retiro de catálogo con auditoría, cascada de borrado
de cliente.

**Target Platform**: Supabase (sin UI: el panel que lo consuma es de cada
producto derivado).

**Performance Goals**: resolución < 10 ms por PK/índices (SC-004).

**Constraints**: migración aditiva, reversión documentada al pie del
archivo.

**Scale/Scope**: 1 migración, 4 tablas, 2 triggers, 6 funciones.

## Constitution Check

| Principio | Evaluación |
|---|---|
| Aislamiento multi-tenant | RLS por organización en elecciones/eventos; trigger de consistencia cliente → organización; pgTAP de aislamiento. |
| Spec primero | Esta spec. |
| Auditable | `eventos_proveedor_capacidad` con anterior/nuevo/actor/aceptación, incluida la auditoría automática de un retiro de catálogo. |
| Simplicidad | Sin servicio nuevo; resolución en SQL, sin lógica de negocio de ningún producto. |
| Documentación obligatoria | Esta spec + comentarios SQL; `pnpm docs:check` exige specs/docs junto al código. |

## Project Structure

```text
specs/20261005-120000-proveedor-elegible-por-capacidad/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, contracts/rpc.md, tasks.md
supabase/
├── migrations/20261005120000_proveedor_elegible_por_capacidad.sql
└── tests/database/proveedor_elegible_por_capacidad.test.sql
```

**Structure Decision**: sin componente de Refine ni worker propio: el
template es plataforma pura (ver spec.md, Alcance); cada producto derivado
monta su propia pantalla sobre estas funciones (ya lo hace
`nicolasjones/estudio-contable-automation` en el producto).
