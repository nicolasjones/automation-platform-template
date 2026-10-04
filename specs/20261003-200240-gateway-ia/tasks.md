---

description: "Task list template for feature implementation"
---

# Tasks: Invocación real de proveedor en la capacidad de IA gobernada

**Input**: Design documents from `specs/20261003-200240-gateway-ia/`

## Phase 1: User Story 1 - Invocar sin reimplementar el cliente HTTP por proveedor (Priority: P1) 🎯 MVP

### Tests ⚠️

- [x] T001 [P] [US1] Test "endpointInvocacion produce la URL correcta para openai/openai-compatible/anthropic/gemini, y lanza PROVEEDOR_IA_SIN_ENDPOINT_INVOCACION para baidu" en `packages/ia/src/proveedores/catalogo.test.ts` (nuevo). Desvío real encontrado escribiendo el test: la firma original tomaba solo `adaptador`, pero `openai-compatible` agrupa hosts distintos (x.ai, DeepSeek, etc.) — se corrigió a recibir el `ProveedorCatalogo` completo, ver research.md.
- [x] T002 [P] [US1] Test "invocarProveedorIa arma método POST, URL y headers correctos por adaptador (anthropic: x-api-key+anthropic-version; gemini: x-goog-api-key, modelo en el path; resto: Authorization Bearer)" en `packages/ia/src/proveedores/index.test.ts` (nuevo). Bug real encontrado en el primer consumidor real (ver commit 74dafd3): faltaba `Content-Type: application/json` en los tres adaptadores — nunca se manifestó porque el único consumidor hasta entonces (`descubrirModelos`) es un GET sin body.
- [x] T003 [P] [US1] Test "respuesta no exitosa lanza INVOCACION_PROVEEDOR_IA_FALLO_<status>" en el mismo archivo.
- [x] T004 [P] [US1] Test "respuesta exitosa devuelve el json() crudo sin transformar" en el mismo archivo.

### Implementation

- [x] T005 [US1] Agregar `endpointInvocacion(proveedor, modeloId)` a `packages/ia/src/proveedores/catalogo.ts`.
- [x] T006 [US1] Agregar `invocarProveedorIa` a `packages/ia/src/proveedores/index.ts`, reutilizando `encabezados()` y `endpointInvocacion`.
- [x] T007 [US1] Exportar `invocarProveedorIa` y `endpointInvocacion` desde `packages/ia/src/index.ts` — ya cubierto por los `export *` existentes, sin cambio de código.

**Checkpoint**: MVP — un consumidor nuevo puede invocar un proveedor real sin reimplementar headers/URL.

## Phase 2: User Story 2 - Una sola fuente de verdad para headers (Priority: P2)

- [x] T008 [P] [US2] Confirmado por inspección: `invocarProveedorIa` y `descubrirModelos` llaman a la misma `encabezados()`, sin segunda copia.

## Phase 3: Polish

- [x] T009 [P] `pnpm --filter @platform/ia test` (54/54), `pnpm test:ia` (incluye `packages/ia-navegacion`, 17/17 sin tocar su código — FR-005 confirmado), `pnpm lint`, `pnpm build` — todo verde.
- [x] T010 Subida versión de `governed-ai-core` 1.5.0 → 1.6.0 en `template-capabilities.json`/`template-adoption.json`.

## Dependencies & Execution Order

- US1 es la única historia con implementación real; US2 es una verificación derivada de cómo se implementó US1 (si T006 reutiliza `encabezados()` en vez de copiarla, US2 ya está satisfecha).

## Notas de desvío

Ninguna todavía.

## Al cerrar (merge del PR)

Actualizar `docs/roadmap-template.md`: ítem #9 pasa a "Parcialmente resuelto por composición" — la gobernanza (auth/límites/política) ya estaba centralizada antes de esta spec; con esta spec, además, ningún consumidor reimplementa su propio cliente HTTP por proveedor. No llega a "Resuelto por composición, sin código nuevo" como el #19 porque esta spec sí agrega código nuevo (la pieza de invocación que faltaba).
