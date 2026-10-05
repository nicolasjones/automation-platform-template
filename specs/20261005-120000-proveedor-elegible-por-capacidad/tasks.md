# Tasks: Proveedor elegible por capacidad

## Phase 1: Setup

- [X] T001 Crear `supabase/migrations/20261005120000_proveedor_elegible_por_capacidad.sql` con encabezado de reversión

## Phase 2: Foundational

- [X] T002 Tablas `capacidades_proveedores`, `proveedor_capacidad_organizacion`, `proveedor_capacidad_cliente`, `eventos_proveedor_capacidad` con RLS, grants y trigger de consistencia de organización
- [X] T003 Trigger de retiro de catálogo (`activo` true → false): cascada + auditoría (research.md R4)

**Checkpoint**: catálogo vacío (a propósito) y protegido.

## Phase 3: User Story 1 - Elección por organización (P1)

- [X] T004 [US1] `public.elegir_proveedor_capacidad_organizacion` y `public.proveedores_capacidad_de_organizacion` (contracts/rpc.md)
- [X] T005 [US1] `private.resolver_proveedor_capacidad` con disponibilidad (`SIN_CONEXION`, `CONEXION_INVALIDA`, `PROVEEDOR_RETIRADO`) y grants a `kestra_orquestacion`/`workers_orquestacion`
- [X] T006 [US1] pgTAP: default de catálogo; elección de organización; `PROVEEDOR_SIN_CONEXION`; `ACEPTACION_REQUERIDA`; evento auditado; conexión inválida → no disponible sin sustitución

**Checkpoint**: una organización elige un proveedor y la resolución lo refleja.

## Phase 4: User Story 2 - Excepción por cliente (P2)

- [X] T007 [US2] `public.elegir_proveedor_capacidad_cliente`, `public.quitar_proveedor_capacidad_cliente`, `public.proveedores_efectivos_de_cliente`
- [X] T008 [US2] pgTAP: precedencia cliente → organización → catálogo en todas las combinaciones; quitar excepción vuelve a heredar; cliente de otra organización rechazado; cascada de borrado de cliente; retiro de catálogo

**Checkpoint**: mezcla de clientes con distintos proveedores, aislamiento verificado.

## Phase 5: Polish

- [X] T009 `pnpm test:db:validar-aditivas`; `pnpm test:db` (pgTAP completo del template)
- [X] T010 Code-review del diff contra `main` (skill `code-review`)

## Dependencies

- Fase 2 antes de US1. US2 depende de US1 (mismas funciones de catálogo/conexión).
- Sin UI: cada producto derivado monta su propio panel sobre estas funciones (fuera de alcance de este template).
