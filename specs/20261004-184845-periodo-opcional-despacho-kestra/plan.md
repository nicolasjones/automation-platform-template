# Implementation Plan: Despachador por outbox con detalle opcional en Kestra

**Branch**: `periodo-opcional-despacho-kestra` | **Date**: 2026-10-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/20261004-184845-periodo-opcional-despacho-kestra/spec.md`

## Summary

El template incorpora el par de flows del despachador por outbox
(`despacho-outbox`, `despacho-capacidad`), generalizado desde el producto:
el `detalle` de la orden viaja entero y cada `case` lee sus campos con valor
por defecto. Dos verificaciones estáticas fijan las reglas que el producto
aprendió en vivo (default implica `required: true`; ninguna lectura de
`detalle` sin `??`), y una tercera, compartida con la publicación de flows,
impide publicar un flow que use una variable de entorno que el Compose no
declara.

## Technical Context

**Language/Version**: YAML de Kestra 1.3.35 (versión fijada en `infra/kestra/compose.yaml`), Node 22 ESM para verificaciones

**Primary Dependencies**: plugins `core` y `jdbc.postgresql` de Kestra; RPCs del outbox (`private.reclamar_despachos_ejecucion`, `private.resolver_despacho_ejecucion`)

**Storage**: Postgres (outbox existente, sin cambios de esquema)

**Testing**: `node --test` para las verificaciones estáticas; E2E con el Kestra local y la base local

**Target Platform**: Kestra local (Compose) y Kestra del VPS

**Project Type**: orquestación

**Performance Goals**: igual que el producto: reclamo cada minuto, lote de 10, lease de 3600 s

**Constraints**: sin HTTP desde Postgres; sin secretos ni negocio en los flows del template

**Scale/Scope**: 2 flows, 1 módulo de verificación, 1 cambio en la publicación

## Constitution Check

- **III. Idempotentes y auditables**: toda orden reclamada termina confirmada o liberada con motivo sanitizado. OK.
- **IV. Despliegues independientes**: solo `kestra`. OK.
- **V. Simplicidad**: el router no conoce campos de negocio (research.md, Decisión 2). OK.
- **VII. Documentación**: contrato y guía de adopción actualizados. OK.

## Delivery

| Producto | Archivo que cambia | Validación | Destino |
|---|---|---|---|
| kestra | `infra/kestra/flows/despacho-outbox.yml`, `infra/kestra/flows/despacho-capacidad.yml` | `node --test`, publicación y E2E en Kestra local | VPS (`publicar-flows-kestra` o `pnpm kestra:deploy-flow`) |
| kestra (tooling) | `infra/kestra/verificar-flows.mjs` (nuevo), `infra/kestra/desplegar-flow.mjs` | `node --test` | CI |

## Project Structure

### Documentation (this feature)

```text
specs/20261004-184845-periodo-opcional-despacho-kestra/
├── plan.md
├── research.md
├── quickstart.md
├── contracts/despacho-por-capacidad.md
└── tasks.md
```

### Source Code (repository root)

```text
infra/kestra/flows/despacho-outbox.yml          # nuevo
infra/kestra/flows/despacho-capacidad.yml       # nuevo, case de ejemplo + default CAPACIDAD_SIN_FLOW
infra/kestra/verificar-flows.mjs                # nuevo: envs declaradas, defaults/required, lecturas de detalle
infra/kestra/verificar-flows.test.mjs           # nuevo: árbol real + casos inyectados
infra/kestra/desplegar-flow.mjs                 # chequeo de envs antes de publicar
infra/kestra/desplegar-flow.test.mjs            # caso de rechazo
infra/kestra/renderizar-flow.mjs                # solo si hace falta sustituir concurrencyLimit del despachador
package.json                                    # test:kestra:flows
.github/workflows/validate.yml                  # correr test:kestra:flows
specs/019-outbox-ejecuciones/contracts/despacho-outbox.md   # campos opcionales del detalle
docs/adoptar-ciclo-ejecuciones.md               # adoptar el despachador; recrear Kestra al sumar variables
template-capabilities.json                      # durable-execution-outbox y safe-kestra-flow-publication suben
```

**Structure Decision**: el despachador entra en la capacidad
`durable-execution-outbox` (sus paths suman los dos flows), porque es la
mitad Kestra del mismo contrato. La verificación de envs entra en
`safe-kestra-flow-publication`.

## Complexity Tracking

Sin violaciones.
