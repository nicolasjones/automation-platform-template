---

description: "Task list template for feature implementation"
---

# Tasks: Saneamiento de contenido no confiable para IA

**Input**: Design documents from `specs/20261003-204520-saneamiento-contenido-ia/`

## Phase 1: User Story 1 - Marcado automático de contenido no confiable (Priority: P1) 🎯 MVP

### Tests ⚠️

- [x] T001 [P] [US1] Test "marcarContenidoNoConfiable envuelve el texto con un delimitador que incluye un nonce distinto en cada llamada, mismo texto intacto adentro" en `packages/ia/src/sanitizar.test.ts` (nuevo).
- [x] T002 [P] [US1] Test "prepararInvocacion con clavesNoConfiables declaradas envuelve esas claves (string) y deja las demás igual" en `packages/ia/src/ejecutar.test.ts`.
- [x] T003 [P] [US1] Test "prepararInvocacion con una clave no confiable de valor no-string la deja sin modificar" en el mismo archivo (Edge Case, FR-004).
- [x] T004 [P] [US1] Test "prepararInvocacion sin clavesNoConfiables declaradas: resultado idéntico al comportamiento actual" en el mismo archivo (FR-006).

### Implementation

- [x] T005 [US1] Agregar `clavesNoConfiables?: readonly string[]` a `ContratoConsumidor` en `packages/ia/src/types.ts`.
- [x] T006 [US1] Agregar `marcarContenidoNoConfiable` a `packages/ia/src/sanitizar.ts`.
- [x] T007 [US1] Aplicar el marcado automático en `prepararInvocacion` (`packages/ia/src/ejecutar.ts`), después de `sanitizarDato`.

**Checkpoint**: MVP — un contrato que declara contenido no confiable lo tiene marcado automáticamente, sin acción manual del consumidor.

## Phase 2: User Story 2 - Señal de activación para auditoría (Priority: P2)

### Tests ⚠️

- [x] T008 [P] [US2] Test "clavesActivadas devuelve solo las claves declaradas presentes como string en la entrada" en `packages/ia/src/sanitizar.test.ts`.
- [x] T009 [P] [US2] Test "clavesActivadas devuelve vacío si no se declaró ninguna clave o ninguna está presente" en el mismo archivo.

### Implementation

- [x] T010 [US2] Agregar `clavesActivadas` a `packages/ia/src/sanitizar.ts`.

## Phase 3: Polish

- [x] T011 [P] `pnpm --filter @platform/ia test` (63/63), `pnpm test:ia` (incluye `packages/ia-navegacion`, 17/17 sin tocar su código — FR-006 confirmado), `pnpm lint`, `pnpm build` — todo verde.
- [x] T012 Subida versión de `governed-ai-core` en `template-capabilities.json`/`template-adoption.json`.

## Dependencies & Execution Order

- US1 (marcado automático) es el MVP — resuelve el gap real por sí sola.
- US2 (señal de activación) es independiente de US1 una vez que existen `clavesNoConfiables` en el contrato — no depende de que `prepararInvocacion` haya aplicado el marcado, solo del contrato y la entrada.

## Notas de desvío

Code-review de dos ejes (Standards + Spec) tras T012 encontró 3 hallazgos reales, los 3 corregidos antes de mergear: (1) `clavesActivadas` no filtraba por `datosPermitidos`, podía reportar como "activada" una clave que `sanitizarDato` ya descarta — señal de auditoría falsa; (2) la instrucción de sistema explícita que pedía el propio Input de spec.md nunca se implementó, solo el delimitador; (3) spec.md/research.md decían que la señal iría "en el resultado de `prepararInvocacion`", pero se implementó como función separada para no arriesgar FR-006 — se corrigió la redacción de spec.md en vez de forzar el cambio de firma. Ver commit de corrección y research.md Decisiones 1 y 3.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md`: ítem #24 pasa a "Implementado" — cubre exactamente lo que pide el roadmap (delimitadores y marcado explícito de contenido no confiable, instrucción de sistema implícita en el propio delimitador, registro de cuándo se activó la defensa vía `clavesActivadas`). No incluye el patrón "dual LLM" (mitigación más fuerte, fuera de alcance por falta de caso de uso real — ver Assumptions de spec.md).
