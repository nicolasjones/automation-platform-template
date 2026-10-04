---

description: "Task list template for feature implementation"
---

# Tasks: aprobación humana antes de completar una interacción

**Input**: Design documents from `specs/20261003-173044-aprobacion-humana-ia/`

## Phase 1: Foundational

- [x] T001 Agregar `'esperando_aprobacion'` a `EstadoInteraccion` en `packages/ia/src/types.ts`.

## Phase 2: User Story 1 - Pausar antes de completar (Priority: P1) 🎯 MVP

### Tests ⚠️

- [x] T002 [P] [US1] Test "requiere aprobación, queda en esperando_aprobacion" en `packages/ia/src/interacciones.test.ts` (quickstart Escenario 1).
- [x] T003 [P] [US1] Test "sin requerir aprobación, completarInteraccion se comporta igual que antes" en `packages/ia/src/interacciones.test.ts` (quickstart Escenario 2, compatibilidad).

### Implementation

- [x] T004 [US1] Extender `completarInteraccion` en `packages/ia/src/interacciones.ts` con el parámetro opcional `opciones?: { requiereAprobacionHumana?: boolean }` (depende de T001).

## Phase 3: User Story 2 - Aprobar o rechazar (Priority: P1)

### Tests ⚠️

- [x] T005 [P] [US2] Test "aprobar desde esperando_aprobacion pasa a completada" en `packages/ia/src/interacciones.test.ts` (quickstart Escenario 3).
- [x] T006 [P] [US2] Test "rechazar desde esperando_aprobacion pasa a rechazada" en `packages/ia/src/interacciones.test.ts` (quickstart Escenario 4).
- [x] T007 [P] [US2] Test "aprobar o rechazar desde cualquier otro estado lanza TRANSICION_IA_INVALIDA" en `packages/ia/src/interacciones.test.ts` (quickstart Escenario 5; cubre también el Edge Case de aprobar/rechazar dos veces).

### Implementation

- [x] T008 [US2] Implementar `aprobarInteraccion` y `rechazarInteraccion` en `packages/ia/src/interacciones.ts` (depende de T001).

## Phase 4: Polish

- [x] T009 [P] Agregar sección breve a `packages/ia/README.md`.
- [x] T010 Confirmar que `ai-navigation-fallback` sigue pasando sus 17 tests sin modificación (SC-004).
- [x] T011 Correr `pnpm --filter @platform/ia build`, `pnpm --filter @platform/ia test`, `pnpm lint`, `pnpm build`, `pnpm infra:config`, `pnpm docs:check`.
- [x] T012 Subir versión de `governed-ai-core` en `template-capabilities.json`/`template-adoption.json`.

## Notas de desvío

Ninguna todavía.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md`: ítem #16 queda parcialmente implementado (estado y transiciones); la conexión a una tabla/pantalla real de aprobación queda pendiente para cuando exista un consumidor concreto.
