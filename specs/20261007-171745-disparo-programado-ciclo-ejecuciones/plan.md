# Implementation Plan: Disparo programado en el ciclo de ejecuciones

**Branch**: `tmpl-programacion-automatizaciones` | **Date**: 2026-10-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261007-171745-disparo-programado-ciclo-ejecuciones/spec.md`

## Summary

Generaliza `worker-execution-cycle` con una tabla de programación recurrente por capacidad, un flow despachador con trigger `Schedule`, y una regla de concurrencia por **conexión** (no por capacidad ni por nombre de sistema). El hallazgo clave de Phase 0 (`research.md`): `iniciar_ejecucion_worker` ya reserva el origen `'programada'` pero **no genera una orden de despacho** para él (solo para `'manual'`) — el despachador genérico no puede ejecutar el trabajo inline como sí hace un flow `'kestra'` (no conoce el sistema), así que necesita el outbox. Cerrar ese hueco es un cambio mínimo y aditivo, no una ruta de disparo nueva.

## Technical Context

**Language/Version**: PL/pgSQL (Supabase), YAML (Kestra) — mismo stack que el resto del ciclo de ejecuciones, sin lenguajes nuevos.

**Primary Dependencies**: `public.capacidades_ejecucion`, `public.conexiones`, `public.ejecuciones_worker`, `public.despachos_ejecucion` + `private.reclamar_despachos_ejecucion` (outbox ya existente), `private.estado_ejecucion_vigente` (vigencia con timeout ya existente).

**Storage**: PostgreSQL vía Supabase. Una tabla nueva aditiva (`public.programacion_ejecucion` o equivalente). Un cambio aditivo mínimo en `iniciar_ejecucion_worker` (extender la condición de inserción en `despachos_ejecucion` de `p_origen = 'manual'` a `p_origen in ('manual', 'programada')`) — no cambia su firma ni el comportamiento ya contractual de `manual`/`kestra`.

**Testing**: pgTAP (`supabase/tests/database/*.test.sql`), siguiendo el estilo ya usado en `ciclo_ejecuciones_workers.test.sql`/`ejecucion_en_curso_worker.test.sql`.

**Target Platform**: PostgreSQL administrado por Supabase + Kestra self-hosted — mismos entornos que el resto del ciclo de ejecuciones.

**Project Type**: Capacidad de plataforma dentro del template (sin UI — ver spec, fuera de alcance).

**Performance Goals**: Sin requisitos de throughput — el despachador corre en un intervalo periódico (minutos, no segundos); SC-001 de la spec fija una ventana de 15 minutos como razonable.

**Constraints**: No modificar la firma de `iniciar_ejecucion_worker` ni el comportamiento ya contractual para `manual`/`kestra` (FR-009). No introducir un segundo mecanismo de outbox/lock paralelo al ya existente.

**Scale/Scope**: Genérico — cualquier cantidad de capacidades/conexiones de cualquier producto derivado, sin lógica específica de ninguno (FR-007).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Aislamiento multi-tenant por diseño** — PASS (planeado). La tabla nueva lleva `organizacion_id` + RLS + prueba pgTAP de aislamiento real.
- **II. Especificar antes de implementar** — PASS. Spec y clarify completos antes de este plan.
- **III. Automatizaciones idempotentes y auditables** — PASS: el despachador llama al mismo `iniciar_ejecucion_worker` que ya registra origen/actor/estado/timestamps/error; la generalización de concurrencia reusa `estado_ejecucion_vigente` (timeout ya auditado como tal).
- **IV. Un monorepo, despliegues independientes** — PASS, sin cambios de Compose.
- **V. Simplicidad operativa** — PASS: se cierra un hueco ya anticipado en el propio diseño original (spec 016 ya reservaba `'programada'`) en vez de construir un mecanismo nuevo paralelo.
- **VI. Panel operable y extensible** — N/A, esta spec no agrega ni modifica ninguna pantalla (explícitamente fuera de alcance).
- **VII. Documentación como parte del cambio** — PASS planeado: actualiza `specs/016-ciclo-ejecuciones-workers/contracts/ciclo-ejecuciones.md` (el contrato original que reservó `'programada'`) y `template-capabilities.json`/`template-adoption.json` (bump de versión de `worker-execution-cycle`).

## Project Structure

### Documentation (this feature)

```text
specs/20261007-171745-disparo-programado-ciclo-ejecuciones/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   ├── <timestamp>_programacion_ejecucion.sql        # tabla + RLS + RPCs programar/quitar
│   └── <timestamp>_despachar_programada_outbox.sql   # extiende iniciar_ejecucion_worker: 'programada' también genera orden
└── tests/database/
    ├── programacion_ejecucion.test.sql                # pgTAP: aislamiento + permisos de administrador
    └── concurrencia_por_conexion.test.sql              # pgTAP: 2 capacidades de la misma conexión no corren juntas

infra/kestra/flows/
└── despachador-programado.yml   # trigger Schedule, genérico, sin lógica de sistema

specs/016-ciclo-ejecuciones-workers/contracts/ciclo-ejecuciones.md   # actualizar: 'programada' ahora SÍ genera orden de despacho

template-capabilities.json / template-adoption.json   # bump worker-execution-cycle
```

**Structure Decision**: Se extiende el mismo módulo de ciclo de ejecuciones (`supabase/migrations`, `infra/kestra/flows`) donde ya vive `worker-execution-cycle` — no se crea un módulo nuevo separado. El flow despachador es el único archivo `.yml` nuevo; ningún flow existente se modifica.

## Complexity Tracking

> No hay violaciones de la Constitución que requieran justificación.
