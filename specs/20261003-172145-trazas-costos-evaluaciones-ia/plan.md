# Implementation Plan: costo estimado y arnés de evaluación para IA

**Branch**: `trazas-costos-evaluaciones-ia` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

## Summary

Dos funciones puras nuevas en `packages/ia`: `calcularCostoEstimado` y `ejecutarCasosEvaluacion`. Sin persistencia, sin extender ninguna función existente — cierran lo verificable del ítem #13 del roadmap sin inventar una fuente de tarifas ni de tokens que no existe hoy.

## Technical Context

**Language/Version**: TypeScript ~6.0.2, mismo paquete `@platform/ia`.

**Primary Dependencies**: ninguna nueva.

**Storage**: N/A.

**Testing**: Vitest, archivo nuevo `trazasCostosEvaluaciones.test.ts`.

**Constraints**: no debe tocar `prepararInvocacion`, `validarSalida` ni ningún consumidor existente — son funciones independientes (SC-003).

## Constitution Check

- **I-IV, VI**: N/A directo, sin tocar aislamiento, despliegue ni UI.
- **V. Simplicidad operativa**: explícitamente el motivo de research.md Decisión 1 — no crear tarifas ni tablas sin un consumidor real.
- **VII. Documentación**: `packages/ia/README.md` gana una sección breve.

Sin violaciones.

## Project Structure

```text
packages/ia/src/
├── trazasCostosEvaluaciones.ts        # calcularCostoEstimado, ejecutarCasosEvaluacion, tipos
├── trazasCostosEvaluaciones.test.ts   # nuevo
└── index.ts                            # re-exporta
```

**Structure Decision**: dentro de `packages/ia`, mismo criterio que las dos entregas anteriores — funciones independientes, sin paquete nuevo.
