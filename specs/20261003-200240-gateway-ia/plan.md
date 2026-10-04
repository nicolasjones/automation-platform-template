# Implementation Plan: Invocación real de proveedor en la capacidad de IA gobernada

**Branch**: `gateway-ia` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261003-200240-gateway-ia/spec.md`

## Summary

Expone `invocarProveedorIa` en `packages/ia/src/proveedores/`, reutilizando la lógica de headers por adaptador que ya existe (sin exportar) para `descubrirModelos`, más una función nueva `endpointInvocacion` que deriva la URL real de inferencia por adaptador (no existía — `endpointModelos` es solo de listado). Transporte puro: no interpreta cuerpo de petición ni de respuesta.

## Technical Context

**Language/Version**: TypeScript, mismo stack que el resto de `packages/ia`.

**Primary Dependencies**: ninguna nueva.

**Storage**: N/A.

**Testing**: Vitest, `fetch` inyectado (sin red real), mismo patrón que `descubrirModelos.test.ts`.

**Target Platform**: Node.js (librería, consumida por workers y futuros consumidores de IA).

**Project Type**: library (paquete dentro del monorepo).

**Performance Goals**: N/A — una llamada HTTP por invocación, sin presupuesto de performance propio distinto del que ya impone la política de IA.

**Constraints**: cero cambios de comportamiento para `ai-navigation-fallback` (FR-005); la función no debe acoplarse a ningún formato de negocio de petición/respuesta (FR-003).

**Scale/Scope**: cuatro adaptadores soportados (`openai`, `openai-compatible`, `anthropic`, `gemini`); `baidu` queda fuera (research.md, Decisión 1).

## Constitution Check

- **I. Aislamiento multi-tenant**: N/A — sin tabla, sin RLS, sin dato de organización.
- **II. Especificar antes de implementar**: spec → research → plan preceden a tasks/implement.
- **III. Automatizaciones idempotentes y auditables**: N/A directo — no persiste nada; la auditoría de la invocación sigue siendo responsabilidad del consumidor (vía `ia_eventos_interaccion`, sin cambios).
- **IV. Un monorepo**: sin cambios de despliegue, cambio solo en `packages/ia`.
- **V. Simplicidad operativa**: deliberadamente NO normaliza petición/respuesta entre proveedores (research.md, Decisión 2) — evita construir una capa de traducción sin un consumidor real que la necesite.
- **VI. Panel operable y extensible**: N/A — sin UI.
- **VII. Documentación**: este plan + comentarios en el código citando por qué `endpointInvocacion` existe separado de `endpointModelos`.

## Project Structure

### Documentation (this feature)

```text
specs/20261003-200240-gateway-ia/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/ia/src/proveedores/
├── catalogo.ts       # + endpointInvocacion
├── catalogo.test.ts  # nuevo
├── index.ts          # + invocarProveedorIa (reutiliza encabezados())
└── index.test.ts     # + casos de invocarProveedorIa
```

**Structure Decision**: todo el cambio vive dentro de `packages/ia/src/proveedores/`, junto a `descubrirModelos` y `catalogo.ts` — mismos archivos que ya tienen la lógica que se reutiliza, sin paquete ni directorio nuevo.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
