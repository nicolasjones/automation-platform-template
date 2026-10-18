# Implementation Plan: Lectura del chat companion con descubrimiento de fuentes y filtros

**Branch**: `20261018-104239-chat-lectura-filtros` | **Date**: 2026-10-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261018-104239-chat-lectura-filtros/spec.md`

## Summary

El tool `leer` del chat companion hoy tiene una descripción estática (el modelo no puede conocer los nombres de vista), solo sabe filtrar por igualdad y no puede acotar filas. El plan es en dos partes:

1. **Paridad**: traer al template el mecanismo de lectura que un producto derivado (`estudio-contable-automation`, spec `20261017-153259-chat-ia-consulta-datos`) ya construyó y verificó en vivo — `chat_fuentes_disponibles()` (descubrimiento por permisos), `registrar_fuente_chat_ia()` (alta por convención), resolución de `esquema.tabla`, catálogo inyectado en la descripción del tool y en la instrucción de sistema, tres desenlaces distinguidos y lectura resiliente ante una columna inexistente.
2. **Filtros nuevos**: rango, orden, límite explícito y agregaciones (suma/cantidad/promedio/mínimo/máximo), con la validación de columnas contra la metadata de la fuente, y habilitación de las agregaciones de PostgREST (que están apagadas por defecto).

Las dos partes comparten la misma pieza clave: la fuente declara qué columnas tiene, y el modelo nunca inventa un nombre de columna ni de vista.

## Technical Context

**Language/Version**: SQL (Postgres 15+, migraciones Supabase) + TypeScript sobre Deno (Edge Function `chat-ia-responder`) con módulos puros testeables en Node 24 (`node --test`, type stripping).

**Primary Dependencies**: `governed-ai-core` (`packages/ia/`: `prepararInvocacion`, `ContratoConsumidor`, `invocarProveedorIa`) y el mecanismo `chat-companion-mechanism` (tablas `fuentes_chat_ia`, `capacidades_chat_ia`, `puede_chat_leer_funcionalidad`, Edge Function, UI del chat flotante). PostgREST (vía `supabase-js`) para la lectura.

**Storage**: Postgres. `fuentes_chat_ia` (feature_id, vista, descripcion) y `capacidades_chat_ia` ya existen: **no se crean ni alteran tablas** en esta spec (las columnas de cada fuente se leen de `information_schema.columns` en runtime).

**Testing**: pgTAP (`supabase/tests/database/*.test.sql`, `pnpm test:db`) para RPCs y setting del rol; `node --test` para la lógica pura (armado de la consulta y armado del catálogo); verificación real contra PostgREST con el stack local (`pnpm dev:supabase`) para las agregaciones.

**Target Platform**: Supabase (self-hosted local y Supabase Cloud gestionado). La habilitación de agregaciones debe funcionar en los dos: se hace por rol, en migración, con `notify pgrst`.

**Project Type**: plataforma (monorepo con despliegues independientes) — acá solo `supabase`.

**Performance Goals**: la lectura no debe depender del tope de filas de PostgREST (`max_rows = 1000`): límite por defecto acotado (50) y tope duro; las agregaciones resuelven los totales en la base. Las agregaciones no deben habilitar un escaneo descontrolado: se aceptan solo sobre columnas declaradas/verificadas de la fuente y con los filtros aplicados.

**Constraints**: solo lectura con la sesión del usuario (RLS/`security_invoker`), nunca service-role; fail-closed; sin UI nueva; el system prompt sigue siendo configurable por producto (`CHAT_COMPANION_SYSTEM_PROMPT`) sin identidad hardcodeada; migraciones aditivas con reversión documentada.

**Scale/Scope**: mecanismo genérico, sin ninguna vista de negocio: en las pruebas se usan funciones/vistas mínimas creadas por los propios tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Verificación | Estado |
|-----------|--------------|--------|
| I. Aislamiento multi-tenant | La lectura corre con la sesión del usuario (`asUser`, RLS de la vista registrada + `security_invoker`); el descubrimiento recorta por `puede_chat_leer_funcionalidad`. No se agrega ningún camino con service-role. Se prueba aislamiento entre dos organizaciones. | Pasa |
| II. Especificar antes de implementar | `spec.md` + `contracts/tool-leer.md` + `research.md` (con hallazgo verificado de agregaciones apagadas por defecto). | Pasa |
| III. Automatizaciones idempotentes y auditables | `registrar_fuente_chat_ia` es upsert idempotente; la migración es reejecutable. Nada de escrituras nuevas por lectura. | Pasa |
| IV. Un monorepo, despliegues independientes | Cambio acotado a `supabase/` (migración + Edge Function + tests). No toca Compose ni otros productos. | Pasa |
| V. Simplicidad operativa | No se agregan tablas, ni servicios, ni infraestructura. La habilitación de agregaciones es una línea de migración por rol. | Pasa |
| VI. Panel operable y extensible | No agrega, mueve ni rediseña pantallas: el chat flotante y la pantalla de capacidades ya existen. | No aplica |
| VII. Plataforma y dominio (esquemas) | No crea ni altera tablas; las funciones viven donde ya viven (`private`/`public`, mecanismo de plataforma). No se toca `dominio`. | Pasa |

Sin violaciones: no hay entradas en Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/20261018-104239-chat-lectura-filtros/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones y hallazgos (incluye agregaciones)
├── data-model.md        # Fase 1: entidades y contrato de datos
├── quickstart.md        # Fase 1: cómo validar (SQL, tests, request real)
├── contracts/
│   └── tool-leer.md     # Fase 1: contrato de la herramienta de lectura
└── tasks.md             # Fase 2 (comando /speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── <timestamp>_chat_lectura_filtros.sql      # RPCs (paridad + columnas) y habilitación de agregaciones
├── functions/
│   └── chat-ia-responder/
│       ├── index.ts                              # tool `leer` con rango/orden/límite/agregación + 3 desenlaces
│       ├── catalogo.ts                           # (paridad) catálogo inyectable: listarFuentes/descripción/prompt
│       ├── catalogo.test.ts                      # (paridad) tests puros del catálogo
│       ├── consulta.ts                           # nuevo: armado y validación de la consulta (pura, sin Deno)
│       └── consulta.test.ts                      # nuevo: tests puros de la consulta
└── tests/database/
    ├── chat_lectura_fuentes.test.sql             # pgTAP: descubrimiento con columnas, permisos, fail-closed, agregaciones
    └── ...

scripts/
└── (sin cambios)

.github/workflows/validate.yml                   # corre pnpm test:edge (lógica pura de las Edge Functions)
package.json                                     # nuevo script test:edge, sumado a test
```

**Structure Decision**: se mantiene la estructura existente del mecanismo (`supabase/functions/chat-ia-responder/` + migraciones en `supabase/migrations/`). La lógica de armado de la consulta se separa en `consulta.ts` (módulo puro, sin Deno, mismo patrón que `catalogo.ts` en el producto de origen) para poder testearla con `node --test` y para que CI no dependa de un runtime de Deno.

## Complexity Tracking

Sin violaciones de la constitución: no se completa.
