# Implementation Plan: UI de IA y corrección de esperando_aprobacion en la base

**Branch**: `ui-ia-aprobacion-pendiente` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

## Summary

Migración aditiva que agrega `esperando_aprobacion` al check constraint de `ia_interacciones.estado` y a la tabla de transiciones de `registrar_evento_interaccion_ia` (bug real, no feature). Dos componentes de React nuevos (`InsigniaEstadoInteraccionIA`, `AccionesResolucionInteraccionIA`) extraídos de `interacciones.tsx`, que además adopta `EstadoCargaPagina`/`EstadoVacio`.

## Technical Context

**Language/Version**: SQL (Postgres, migración aditiva) + TypeScript/React (Refine + MUI), mismo stack que el resto de `apps/web`.

**Primary Dependencies**: ninguna nueva.

**Storage**: migración aditiva sobre `ia_interacciones` (existente).

**Testing**: pgTAP (`supabase/tests/database/capacidad_ia_gobernada.test.sql`, extendido) + Vitest/Testing Library para los componentes nuevos (mismo patrón que `EstadosPagina.test.tsx`).

**Constraints**: cero cambios a transiciones ya válidas (FR-003); `resolver_revision_ia` sin cambios de firma.

## Constitution Check

- **I. Aislamiento multi-tenant**: N/A directo — `ia_interacciones` ya es de alcance superadmin global, sin cambio de RLS en esta entrega.
- **II. Especificar antes de implementar**: spec/clarify/plan preceden a tasks/implement.
- **III. Automatizaciones idempotentes y auditables**: la migración documenta su reversión implícita (constraint aditivo, se puede acotar de nuevo si hiciera falta); sin cambio de comportamiento para transiciones existentes.
- **IV. Un monorepo**: sin cambios de despliegue.
- **V. Simplicidad operativa**: no se agrega la función de creación de interacciones (sigue sin caso de uso real que la use completa, ver Assumptions); se corrige solo lo que bloquea un estado que YA existe en TypeScript.
- **VI. Panel operable y extensible**: corrige el sub-punto de carga/vacío (la pantalla no usaba `EstadoCargaPagina`/`EstadoVacio`) y el de error al resolver (`EstadoError` en vez de `Alert` inline) — no cubre el sub-punto de identidad visible: `interacciones.tsx` sigue mostrando `consumidor_codigo`/`origen` como texto plano, sin el tratamiento de identificador técnico que el principio también pide; eso es preexistente y queda fuera de este alcance (FR-006 no lo incluye).
- **VII. Documentación**: este plan + comentario de migración.

Las migraciones de Supabase son aditivas (regla explícita del CLAUDE.md) — cumplido, sin alter destructivo.

## Project Structure

```text
supabase/migrations/
└── <timestamp>_esperando_aprobacion_ia.sql   # nuevo, aditivo

supabase/tests/database/
└── capacidad_ia_gobernada.test.sql            # + casos nuevos

apps/web/src/components/ia/
├── InsigniaEstadoInteraccionIA.tsx            # nuevo
├── InsigniaEstadoInteraccionIA.test.tsx       # nuevo
├── AccionesResolucionInteraccionIA.tsx        # nuevo
└── AccionesResolucionInteraccionIA.test.tsx   # nuevo

apps/web/src/pages/ia/
└── interacciones.tsx                           # adopta los componentes + EstadoCargaPagina/EstadoVacio
```

**Structure Decision**: componentes nuevos en `apps/web/src/components/ia/`, paralelo a `components/estados/` (research.md, Decisión 3) — no dentro de `pages/ia/`.
