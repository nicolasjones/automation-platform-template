---

description: "Task list template for feature implementation"
---

# Tasks: Contexto y permisos de organización para IA

**Input**: Design documents from `specs/20261003-161758-contexto-permisos-ia/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/prepararInvocacion.md, quickstart.md

**Tests**: incluidos — mismo criterio que el resto de `packages/ia`.

## Phase 1: Setup

- [x] T001 Ninguna tarea de setup: se extiende `packages/ia` existente, sin paquete ni dependencia nueva.

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T002 Agregar `ContextoOrganizacion` y el campo opcional `claveAislamientoOrganizacion?: string | null` a `ContratoConsumidor` en `packages/ia/src/types.ts`.

**Checkpoint**: tipos listos.

## Phase 3: User Story 1 - Rechazar datos de otra organización (Priority: P1) 🎯 MVP

**Goal**: una invocación con datos de otra organización se rechaza antes de sanitizar o invocar al proveedor; sin clave declarada, no hay chequeo.

**Independent Test**: quickstart.md, Escenarios 1-3.

### Tests for User Story 1 ⚠️

- [x] T003 [P] [US1] Test "organización coincide, pasa con normalidad" en `packages/ia/src/contextoOrganizacion.test.ts` (quickstart Escenario 1).
- [x] T004 [P] [US1] Test "organización distinta en el nivel raíz se rechaza" en `packages/ia/src/contextoOrganizacion.test.ts`.
- [x] T005 [P] [US1] Test "organización distinta anidada dentro de un array se rechaza" en `packages/ia/src/contextoOrganizacion.test.ts` (quickstart Escenario 2).
- [x] T006 [P] [US1] Test "sin clave de aislamiento declarada, cualquier dato pasa sin chequeo" en `packages/ia/src/contextoOrganizacion.test.ts` (quickstart Escenario 3).
- [x] T007 [P] [US1] Test "clave declarada ausente en los datos de entrada no rechaza" (Edge Case de la spec) en `packages/ia/src/contextoOrganizacion.test.ts`.

### Implementation for User Story 1

- [x] T008 [US1] Crear `validarAislamientoOrganizacion(entrada, claveAislamiento, contexto)` en `packages/ia/src/contextoOrganizacion.ts`: recorrido recursivo igual al de `sanitizarDato`, lanza `ORGANIZACION_IA_NO_AUTORIZADA` si corresponde (depende de T002).
- [x] T009 [US1] Llamar `validarAislamientoOrganizacion` dentro de `prepararInvocacion` (`packages/ia/src/ejecutar.ts`), después de `validarPresupuesto` y antes de `sanitizarDato`, con el nuevo parámetro opcional `contextoOrganizacion` (default `{ organizacionId: null }`) (depende de T008).
- [x] T010 [US1] Re-exportar `contextoOrganizacion.ts` desde `packages/ia/src/index.ts`.

**Checkpoint**: Historia 1 funcional e independientemente testeable — MVP.

## Phase 4: User Story 2 - La organización nunca viene de los datos de entrada (Priority: P1)

**Goal**: confirmar, con un test explícito, que la organización efectiva solo puede venir del parámetro dedicado.

**Independent Test**: quickstart.md — mismo mecanismo que US1, documentado desde el ángulo de "qué NO hace".

### Tests for User Story 2 ⚠️

- [x] T011 [P] [US2] Test "un campo de entrada que coincide con la clave de aislamiento y con un valor de otra organización se rechaza, sin importar qué otros campos acompañen" (confirma que no hay forma de que el dato de entrada redefina la organización efectiva) en `packages/ia/src/contextoOrganizacion.test.ts`.

### Implementation for User Story 2

- [x] T012 [US2] Ninguna — ya la satisface la implementación de US1 por construcción (la función nunca lee `contexto.organizacionId` desde `entrada`, solo compara contra él). Este task es de verificación, no de código nuevo.

**Checkpoint**: ambas historias funcionan juntas.

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T013 [P] Agregar a `packages/ia/README.md` una sección breve sobre `claveAislamientoOrganizacion`/`contextoOrganizacion`, con el mismo estilo que el resto del README.
- [x] T014 Confirmar compatibilidad: correr la suite completa de `packages/ia` (`ejecutar.test.ts`, `interacciones.test.ts`, etc.) sin modificar ningún test existente — si alguno necesitara cambiar, sería señal de una ruptura de compatibilidad no permitida por FR-005.
- [x] T015 Correr `pnpm --filter @platform/ia build`, `pnpm --filter @platform/ia test`, `pnpm lint`, `pnpm build`, `pnpm infra:config`, `pnpm docs:check`.
- [x] T016 Subir versión de `governed-ai-core` en `template-capabilities.json` y `template-adoption.json` (minor: nueva capacidad de validación, no solo un fix de empaquetado).

## Dependencies & Execution Order

- Phase 2 bloquea todo lo demás (tipos compartidos).
- US1 (Phase 3) es el MVP; US2 (Phase 4) reutiliza la misma implementación y solo agrega un test de verificación adicional.
- Polish (Phase 5) depende de ambas historias completas.

## Notas de desvío

Ninguna todavía.

## Al cerrar esta spec (merge del PR)

Actualizar `docs/roadmap-template.md`: mover el ítem #10 (Contexto y permisos IA) de "Exploración" a una referencia en "Backlog entregado", análogo a como quedó `ai-navigation-fallback`. Paso manual, no automatizable.
