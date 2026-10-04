---

description: "Task list template for feature implementation"
---

# Tasks: UI de IA y corrección de esperando_aprobacion en la base

**Input**: Design documents from `specs/20261003-182325-ui-ia-aprobacion-pendiente/`

## Phase 1: User Story 1 - Corregir la base (Priority: P1) 🎯 MVP

### Tests ⚠️

- [x] T001 [P] [US1] pgTAP "respuesta_validada -> esperando_aprobacion es una transición válida" en `supabase/tests/database/capacidad_ia_gobernada.test.sql`.
- [x] T002 [P] [US1] pgTAP "esperando_aprobacion -> completada y -> rechazada son transiciones válidas" en el mismo archivo.
- [x] T003 [P] [US1] pgTAP "las transiciones existentes (incluida revision_humana) siguen pasando sin cambios" — correr la suite completa, no solo los casos nuevos (quickstart, SC-001).

### Implementation

- [x] T004 [US1] Migración nueva en `supabase/migrations/`: agregar `esperando_aprobacion` al check de `ia_interacciones.estado` y las dos ramas nuevas a `private.registrar_evento_interaccion_ia` (depende de ningún task previo; es la base).

**Checkpoint**: MVP — el estado es alcanzable y resoluble en la base.

## Phase 2: User Story 2 - Insignia de estado reutilizable (Priority: P2)

### Tests ⚠️

- [x] T005 [P] [US2] Test "los 10 valores de EstadoInteraccion producen una de las 4 categorías documentadas, sin caso por defecto silencioso" en `apps/web/src/components/ia/InsigniaEstadoInteraccionIA.test.tsx` (quickstart; SC-003).

### Implementation

- [x] T006 [US2] Crear `InsigniaEstadoInteraccionIA` en `apps/web/src/components/ia/InsigniaEstadoInteraccionIA.tsx` (depende de T005 para TDD, no de T001-T004).

## Phase 3: User Story 3 - Acciones de resolución reutilizables (Priority: P2)

### Tests ⚠️

- [x] T007 [P] [US3] Test "se muestran las mismas tres acciones para revision_humana y esperando_aprobacion" en `apps/web/src/components/ia/AccionesResolucionInteraccionIA.test.tsx`.
- [x] T008 [P] [US3] Test "no se muestra nada para cualquier otro estado" en el mismo archivo.

### Implementation

- [x] T009 [US3] Crear `AccionesResolucionInteraccionIA` en `apps/web/src/components/ia/AccionesResolucionInteraccionIA.tsx`, llamando `resolver_revision_ia` (depende de T007/T008).
- [x] T010 [US3] Refactorizar `apps/web/src/pages/ia/interacciones.tsx`: usar `InsigniaEstadoInteraccionIA`/`AccionesResolucionInteraccionIA`, adoptar `EstadoCargaPagina` (en vez de `return null`) y `EstadoVacio` (cuando `interacciones.length === 0`) — FR-006, SC-004 (depende de T006, T009).

## Phase 4: Polish

- [x] T011 [P] Confirmar visualmente (`pnpm dev:refine`, quickstart) que `/ia/interacciones` sigue funcionando igual para el superadmin. Ver nota de desvío: la verificación en navegador real no fue alcanzable en este entorno (Claude-in-Chrome sin red hacia `localhost` de esta máquina); cubierto en su lugar por render real (Testing Library/jsdom) de los 10 estados y de las tres interacciones fixture (`esperando_aprobacion`, `revision_humana`, `fallida_tecnica`) creadas y resueltas contra una base Postgres real.
- [x] T012 Correr `pnpm dev:supabase` + `pnpm test:db`, `pnpm --filter @platform/web test`, `pnpm lint`, `pnpm build`, `pnpm infra:config`, `pnpm docs:check`.
- [x] T013 Subir versión de `operable-refine-panel` en `template-capabilities.json`/`template-adoption.json` (los componentes nuevos son parte de esa capacidad, no de `governed-ai-core` — son UI de panel, no núcleo de IA). También se subió `governed-ai-core` (1.4.0 → 1.5.0): el fix de `esperando_aprobacion` en la base es de esa capacidad, no del panel.

## Dependencies & Execution Order

- US1 (Phase 1) es independiente de US2/US3 — toca únicamente la base, no el frontend. Puede validarse y cerrarse sola.
- US2 y US3 son independientes entre sí; ambas alimentan T010 (el refactor de la pantalla), que depende de las dos.

## Notas de desvío

- T011: verificación visual en navegador real no realizable en este entorno (ver T011 arriba). Cubierto por verificación equivalente con render real + datos reales en Postgres.
- Code-review de dos ejes (Standards + Spec) tras T012: 1 hallazgo real de Spec (faltaba indicador de progreso, Historia 2/Escenario 4) y 3 judgement calls de Standards (duplicación de `ESTADOS_NECESITAN_ACCION_HUMANA`, matching frágil por substring en la migración, sobre-reclamo del Principio VI en plan.md) — los 4 corregidos, ver commit 85296ba.
- Pasada adicional de `web-design-guidelines` + `authz-security` sobre toda la spec (regla permanente nueva, aplicada retroactivamente): 4 hallazgos de UX/accesibilidad (prefers-reduced-motion, tooltips para distinguir rechazar/cancelar, indicador de carga, aria-live) y 1 hallazgo de seguridad P1 (`registrar_evento_interaccion_ia` no exigía superadmin específicamente para resolver una revisión/aprobación pendiente — un worker podía saltear `resolver_revision_ia`) — los 5 corregidos, ver commit 4e3e50c y data-model.md.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md`: ítem #20 queda parcialmente implementado (insignia de estado y acciones de resolución reutilizables); progreso/fuentes de una generación en curso (más allá del indicador de "en curso" de la insignia) quedan pendientes para cuando exista un consumidor que efectivamente muestre streaming o fuentes.
