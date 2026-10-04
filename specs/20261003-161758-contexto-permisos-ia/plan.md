# Implementation Plan: Contexto y permisos de organización para IA

**Branch**: `contexto-permisos-ia` | **Date**: 2026-10-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261003-161758-contexto-permisos-ia/spec.md`

## Summary

Extiende `prepararInvocacion` (`packages/ia/src/ejecutar.ts`) con un chequeo de aislamiento por organización: un contrato declara opcionalmente una clave de aislamiento; toda invocación declara su organización efectiva (resuelta por el consumidor, nunca desde los datos de entrada); si los datos de entrada referencian otra organización, se rechaza antes de sanitizar o invocar al proveedor. Sin persistencia nueva (research.md, Decisión 1) — compatible al 100% con consumidores existentes (parámetros opcionales con default).

## Technical Context

**Language/Version**: TypeScript ~6.0.2, Node.js 24, ESM — mismo paquete `@platform/ia`, sin paquete nuevo.

**Primary Dependencies**: ninguna nueva.

**Storage**: N/A (research.md, Decisión 1).

**Testing**: Vitest, extendiendo `packages/ia/src/ejecutar.test.ts` y agregando `contextoOrganizacion.test.ts`.

**Target Platform**: biblioteca interna, igual que el resto de `packages/ia`.

**Project Type**: extensión de librería existente (no hay paquete nuevo esta vez).

**Performance Goals**: N/A — el recorrido recursivo de `entrada` ya lo hace `sanitizarDato` hoy; esta validación agrega un recorrido equivalente, no una llamada de red ni E/S.

**Constraints**: no DEBE romper la firma de `prepararInvocacion` para llamadas existentes (compatibilidad binaria — `ai-navigation-fallback` no debe requerir cambios).

**Scale/Scope**: una función nueva (`validarAislamientoOrganizacion`), un tipo nuevo (`ContextoOrganizacion`), un campo opcional nuevo en `ContratoConsumidor`, una llamada nueva dentro de `prepararInvocacion`.

## Constitution Check

- **I. Aislamiento multi-tenant por diseño**: esta entrega ES, directamente, una extensión de esa garantía al dominio de IA. PASA — de hecho, es la razón de ser de la spec.
- **II. Especificar antes de implementar**: spec, clarify y este plan preceden a tasks/implement. PASA.
- **III. Automatizaciones idempotentes y auditables**: N/A directo (sin persistencia nueva); no empeora la auditabilidad existente.
- **IV. Un monorepo, despliegues independientes**: sin cambios de despliegue, mismo paquete.
- **V. Simplicidad operativa**: explícitamente NO se agrega la tabla/columna que no tiene escritor todavía (research.md, Decisión 1) — cumple el principio al no construir infraestructura sin caso de uso.
- **VI. Panel operable y extensible**: N/A — sin UI.
- **VII. Documentación como parte del cambio**: este plan + actualización de `packages/ia/README.md` (flujo de una invocación) en implement.

Sin violaciones. Sin **Complexity Tracking**.

## Project Structure

### Documentation (this feature)

```text
specs/20261003-161758-contexto-permisos-ia/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── prepararInvocacion.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/ia/src/
├── types.ts                       # + ContextoOrganizacion, ContratoConsumidor.claveAislamientoOrganizacion
├── contextoOrganizacion.ts        # nuevo: validarAislamientoOrganizacion
├── contextoOrganizacion.test.ts   # nuevo
├── ejecutar.ts                    # prepararInvocacion llama a validarAislamientoOrganizacion
├── ejecutar.test.ts               # + casos de organización
└── index.ts                       # re-exporta contextoOrganizacion.ts
```

**Structure Decision**: todo dentro de `packages/ia` existente — no hay paquete nuevo esta vez, es una extensión directa del núcleo, consistente con que el ítem #10 del roadmap depende de "Gateway IA" (ya `packages/ia`) y no introduce un concepto de dominio nuevo que justifique separación (a diferencia de `ai-navigation-fallback`, que sí tenía razón propia para ser un paquete aparte — ver su `research.md`, Decisión 1).

## Complexity Tracking

No aplica.
