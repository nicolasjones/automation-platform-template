# Implementation Plan: aprobación humana antes de completar una interacción

**Branch**: `aprobacion-humana-ia` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

## Summary

Extiende la máquina de estados de `InteraccionEnCurso` con `esperando_aprobacion`, gateado por un parámetro opcional de `completarInteraccion`, y dos funciones nuevas (`aprobarInteraccion`, `rechazarInteraccion`). Mismo patrón que `revision_humana`: modela el estado, no la autorización. Sin persistencia nueva.

## Technical Context

**Language/Version**: TypeScript ~6.0.2, mismo paquete `@platform/ia`.

**Primary Dependencies**: ninguna nueva.

**Storage**: N/A.

**Testing**: Vitest, extendiendo `packages/ia/src/interacciones.test.ts`.

**Constraints**: `completarInteraccion(interaccion)` sin segundo argumento debe comportarse exactamente igual que hoy.

## Constitution Check

- **V. Simplicidad operativa**: sin tabla/RPC nueva (research.md Decisión 3).
- **VII. Documentación**: README de `packages/ia` gana una sección.
- Resto: N/A o ya cubierto por el patrón de `revision_humana`.

Sin violaciones.

## Project Structure

```text
packages/ia/src/
├── types.ts              # EstadoInteraccion + 'esperando_aprobacion'
├── interacciones.ts       # completarInteraccion extendida; aprobarInteraccion, rechazarInteraccion nuevas
└── interacciones.test.ts  # + casos nuevos
```

**Structure Decision**: dentro de `packages/ia`, extendiendo `interacciones.ts` existente — no hay paquete nuevo, mismo criterio que las entregas anteriores de esta ronda.
