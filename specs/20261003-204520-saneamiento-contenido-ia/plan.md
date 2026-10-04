# Implementation Plan: Saneamiento de contenido no confiable para IA

**Branch**: `saneamiento-contenido-ia` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261003-204520-saneamiento-contenido-ia/spec.md`

## Summary

`packages/ia` gana `marcarContenidoNoConfiable` (delimitador con nonce aleatorio, no etiqueta fija — research.md Decisión 1) y `clavesActivadas` (señal de auditoría, sin persistencia propia). `ContratoConsumidor.clavesNoConfiables` declara qué campos son contenido externo no controlado; `prepararInvocacion` los envuelve automáticamente, sin cambiar su firma ni su comportamiento para quien no los declara.

## Technical Context

**Language/Version**: TypeScript, mismo stack que el resto de `packages/ia`.

**Primary Dependencies**: `crypto.randomUUID()` (Node.js nativo, ya usado en el repo).

**Storage**: N/A.

**Testing**: Vitest.

**Target Platform**: Node.js (librería).

**Project Type**: library.

**Performance Goals**: N/A.

**Constraints**: cero cambio de comportamiento para un contrato sin `clavesNoConfiables` (FR-006); el marcado es solo de texto, no de estructura (FR-004).

**Scale/Scope**: cambio acotado a `packages/ia/src/{types.ts,sanitizar.ts,ejecutar.ts}` y sus tests.

## Constitution Check

- **I. Aislamiento multi-tenant**: N/A — sin tabla, sin RLS.
- **II. Especificar antes de implementar**: spec → research → plan preceden a tasks/implement.
- **III. Automatizaciones idempotentes y auditables**: la señal de activación (`clavesActivadas`) existe precisamente para que la auditoría ya existente (`ia_eventos_interaccion`) pueda registrar esto si el consumidor lo decide — sin que `packages/ia` persista nada por su cuenta.
- **IV. Un monorepo**: sin cambios de despliegue.
- **V. Simplicidad operativa**: se descarta deliberadamente el patrón "dual LLM" (la mitigación más fuerte según la investigación) por no tener un caso de uso real que lo justifique hoy — research.md Decisión 1.
- **VI. Panel operable y extensible**: N/A — sin UI.
- **VII. Documentación**: este plan + research.md con las fuentes de la investigación de 2026.

## Project Structure

### Documentation (this feature)

```text
specs/20261003-204520-saneamiento-contenido-ia/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/ia/src/
├── types.ts           # + ContratoConsumidor.clavesNoConfiables
├── sanitizar.ts        # + marcarContenidoNoConfiable, clavesActivadas
├── sanitizar.test.ts   # nuevo
└── ejecutar.ts          # prepararInvocacion aplica el marcado automáticamente
```

**Structure Decision**: todo el cambio vive en `packages/ia/src/`, junto a `sanitizarDato`/`redactarSecretos` (mismo archivo, mismo tipo de utilidad) y `prepararInvocacion` (mismo flujo que ya orquesta sanitización). Sin paquete ni directorio nuevo.
