# Implementation Plan: validación real de esquemas de entrada/salida para IA

**Branch**: `herramientas-ia-esquemas` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

## Summary

Hace cumplir `esquemaEntrada`/`esquemaSalida` de `ContratoConsumidor` con JSON Schema real (`ajv`): `prepararInvocacion` valida `entrada` cruda contra `esquemaEntrada` antes de sanitizar; `validarSalida` valida contra `esquemaSalida` (parámetro opcional nuevo). Sin registro de "herramienta" nuevo — el contrato existente ya es la función explícita que pide el roadmap (#15).

## Technical Context

**Language/Version**: TypeScript ~6.0.2, mismo paquete `@platform/ia`.

**Primary Dependencies**: `ajv` (nueva, MIT).

**Storage**: N/A — reutiliza columnas `jsonb` ya existentes, sin migración.

**Testing**: Vitest, extendiendo `ejecutar.test.ts` y `validarContrato.test.ts`.

**Constraints**: compatibilidad total con `ai-navigation-fallback` (esquemas `{}`) y con el único test existente de `validarSalida` (una sola llamada con un argumento).

## Constitution Check

- **I. Aislamiento multi-tenant por diseño**: N/A directo, no es un cambio de aislamiento (eso ya lo cerró `contexto-permisos-ia`).
- **II. Especificar antes de implementar**: spec, clarify, este plan preceden a tasks/implement.
- **III. Automatizaciones idempotentes y auditables**: sin cambios de persistencia.
- **IV. Un monorepo**: sin cambios de despliegue.
- **V. Simplicidad operativa**: explícitamente se reutiliza `ContratoConsumidor` en vez de crear un concepto nuevo (research.md, Decisión 2) — evita infraestructura redundante.
- **VI. Panel operable**: N/A, sin UI.
- **VII. Documentación**: `packages/ia/README.md` gana una sección sobre esquemas reales.

Sin violaciones.

## Project Structure

```text
packages/ia/src/
├── validarContrato.ts        # + validarContraEsquema, validarSalida gana esquemaSalida opcional
├── validarContrato.test.ts   # + casos de esquema real
├── ejecutar.ts                # prepararInvocacion llama validarContraEsquema sobre esquemaEntrada
├── ejecutar.test.ts           # + casos de esquema real
└── package.json                # + dependencia ajv
```

**Structure Decision**: dentro de `packages/ia` existente, mismo criterio que `contexto-permisos-ia` — es una extensión directa del núcleo, no un paquete nuevo.
