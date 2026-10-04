---

description: "Task list template for feature implementation"
---

# Tasks: validación real de esquemas de entrada/salida para IA

**Input**: Design documents from `specs/20261003-164825-herramientas-ia-esquemas/`

## Phase 1: Setup

- [x] T001 Agregar `ajv` a `packages/ia/package.json` (dependencies).

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T002 Crear `validarContraEsquema(valor, esquema, codigoError)` en `packages/ia/src/validarContrato.ts` usando `ajv` (depende de T001).

**Checkpoint**: función base lista.

## Phase 3: User Story 1 - Rechazar entrada que no cumple el esquema (Priority: P1) 🎯 MVP

### Tests ⚠️

- [x] T003 [P] [US1] Test "entrada cumple esquema real, prepara con normalidad" en `packages/ia/src/ejecutar.test.ts` (quickstart Escenario 1).
- [x] T004 [P] [US1] Test "entrada no cumple esquema real (tipo equivocado), lanza ENTRADA_IA_FUERA_DE_ESQUEMA antes de sanitizar" en `packages/ia/src/ejecutar.test.ts` (quickstart Escenario 2).
- [x] T005 [P] [US1] Test "esquemaEntrada {} no rechaza nada" en `packages/ia/src/ejecutar.test.ts` (quickstart Escenario 4).

### Implementation

- [x] T006 [US1] Llamar `validarContraEsquema(entrada, contrato.esquemaEntrada, 'ENTRADA_IA_FUERA_DE_ESQUEMA')` dentro de `prepararInvocacion` (`packages/ia/src/ejecutar.ts`), sobre `entrada` cruda, antes de `validarAislamientoOrganizacion` y `sanitizarDato` (depende de T002).

**Checkpoint**: MVP funcional.

## Phase 4: User Story 2 - Rechazar salida que no cumple el esquema (Priority: P1)

### Tests ⚠️

- [x] T007 [P] [US2] Test "salida cumple esquema real, no lanza" en `packages/ia/src/validarContrato.test.ts` (quickstart Escenario 3, caso positivo).
- [x] T008 [P] [US2] Test "salida no cumple esquema real, lanza RESPUESTA_IA_FUERA_DE_ESQUEMA" en `packages/ia/src/validarContrato.test.ts` (quickstart Escenario 3).
- [x] T009 [P] [US2] Test "sin segundo argumento, comportamiento idéntico al actual (solo objeto)" en `packages/ia/src/validarContrato.test.ts` — confirma que el test existente (`validarSalida('respuesta')`) sigue pasando sin modificarlo.

### Implementation

- [x] T010 [US2] Agregar parámetro opcional `esquemaSalida: object = {}` a `validarSalida` (`packages/ia/src/validarContrato.ts`) y llamar `validarContraEsquema` después del chequeo de objeto existente (depende de T002).

**Checkpoint**: ambas historias funcionan.

## Phase 5: Polish

- [x] T011 [P] Agregar sección breve a `packages/ia/README.md` sobre esquemas reales.
- [x] T012 Confirmar `pnpm --filter @platform/ia-navegacion test` (17/17) sin ninguna modificación a ese paquete (SC-004).
- [x] T013 Correr `pnpm --filter @platform/ia build`, `pnpm --filter @platform/ia test`, `pnpm lint`, `pnpm build`, `pnpm infra:config`, `pnpm docs:check`.
- [x] T014 Subir versión de `governed-ai-core` en `template-capabilities.json`/`template-adoption.json` (minor).

## Notas de desvío

- `import Ajv from 'ajv'` no compila bajo `moduleResolution: NodeNext` (no construible a nivel de tipos, aunque funciona en runtime); se usó `import { Ajv } from 'ajv'` en su lugar — ver commit `2267d16`.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md`: el ítem #15 (Herramientas IA) queda parcialmente resuelto — la validación de esquemas de entrada/salida está cubierta; el resto de su descripción ("permisos") ya lo cubre `datosPermitidos` del contrato existente, así que en los hechos el ítem #15 queda completo con lo ya construido en `016-capacidad-ia-gobernada` + esta entrega. Marcar Estado en consecuencia, no borrar la fila.
