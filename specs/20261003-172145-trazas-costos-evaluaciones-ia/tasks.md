---

description: "Task list template for feature implementation"
---

# Tasks: costo estimado y arnés de evaluación para IA

**Input**: Design documents from `specs/20261003-172145-trazas-costos-evaluaciones-ia/`

## Phase 1: Foundational

- [x] T001 Crear `TarifaIa`, `CasoEvaluacion`, `ResultadoEvaluacion` en `packages/ia/src/trazasCostosEvaluaciones.ts`.

## Phase 2: User Story 1 - Calcular costo estimado (Priority: P1) 🎯 MVP

### Tests ⚠️

- [x] T002 [P] [US1] Test "costo con tokens de entrada y salida conocidos" en `packages/ia/src/trazasCostosEvaluaciones.test.ts` (quickstart Escenario 1).
- [x] T003 [P] [US1] Test "cero tokens de un tipo no contribuye al costo" en `packages/ia/src/trazasCostosEvaluaciones.test.ts`.

### Implementation

- [x] T004 [US1] Implementar `calcularCostoEstimado` en `packages/ia/src/trazasCostosEvaluaciones.ts` (depende de T001).

## Phase 3: User Story 2 - Arnés de evaluación (Priority: P1)

### Tests ⚠️

- [x] T005 [P] [US2] Test "caso aprobado y caso rechazado, reporte correcto para ambos" en `packages/ia/src/trazasCostosEvaluaciones.test.ts` (quickstart Escenario 2).
- [x] T006 [P] [US2] Test "comparador personalizado aprueba un caso que la igualdad por defecto rechazaría" en `packages/ia/src/trazasCostosEvaluaciones.test.ts` (quickstart Escenario 3).
- [x] T007 [P] [US2] Test "una excepción en un caso lo marca rechazado sin detener el resto" en `packages/ia/src/trazasCostosEvaluaciones.test.ts` (quickstart Escenario 4).
- [x] T008 [P] [US2] Test "lista de casos vacía devuelve reporte vacío sin error" (Edge Case) en `packages/ia/src/trazasCostosEvaluaciones.test.ts`.

### Implementation

- [x] T009 [US2] Implementar `ejecutarCasosEvaluacion` en `packages/ia/src/trazasCostosEvaluaciones.ts`, con `try/catch` por caso y comparador por defecto vía serialización (depende de T001).

## Phase 4: Polish

- [x] T010 [P] Re-exportar `trazasCostosEvaluaciones.ts` desde `packages/ia/src/index.ts`.
- [x] T011 [P] Agregar sección breve a `packages/ia/README.md`.
- [x] T012 Confirmar que ningún test existente de `packages/ia` ni de `packages/ia-navegacion` cambia (SC-003).
- [x] T013 Correr `pnpm --filter @platform/ia build`, `pnpm --filter @platform/ia test`, `pnpm lint`, `pnpm build`, `pnpm infra:config`, `pnpm docs:check`.
- [x] T014 Subir versión de `governed-ai-core` en `template-capabilities.json`/`template-adoption.json`.

## Notas de desvío

Ninguna todavía.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md`: ítem #13 queda parcialmente implementado (costo estimado y arnés de evaluación); la parte de "trazas" ya la cubre `EventoInteraccion` desde `016-capacidad-ia-gobernada`. Nota explícita de qué sigue pendiente si alguna vez hace falta: descubrimiento de tarifas y extracción de tokens por proveedor.
