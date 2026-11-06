# Contrato: despacho por capacidad

Complementa `specs/019-outbox-ejecuciones/contracts/despacho-outbox.md`.

## `despacho-outbox` (namespace `platform.orquestacion`)

- Trigger `Schedule` cada minuto.
- Reclama con `select * from private.reclamar_despachos_ejecucion(10, 3600)`
  (rol `kestra_orquestacion`).
- Por cada fila, `Subflow` a `despacho-capacidad` con `wait: true` y
  `allowFailure: true` en el `ForEach` (una orden fallida no cancela las
  demás). Inputs: `clave_capacidad`, `organizacion_id`, `conexion_id`,
  `despacho_id`, `ejecucion_id`, `intento` y `detalle`.
- `detalle` se pasa entero; si la fila no lo trae, `{}`.

## `despacho-capacidad`

Inputs:

| Input | Tipo | Regla |
|---|---|---|
| `clave_capacidad`, `organizacion_id`, `conexion_id`, `despacho_id`, `ejecucion_id` | STRING | obligatorios |
| `intento` | INT | obligatorio |
| `detalle` | JSON (fallback STRING, research.md Decisión 2) | `required: true`, `defaults: {}` |

- `Switch` por `clave_capacidad`. Cada `case` es un `Subflow` con
  `wait: true` y `transmitFailed: true`, y lee los campos que necesita con
  `{{ inputs.detalle.<campo> ?? '' }}`.
- `default`: `Fail` con `CAPACIDAD_SIN_FLOW`.
- Éxito: `private.resolver_despacho_ejecucion(despacho_id, intento, 'confirmar')`.
- `errors`: `private.resolver_despacho_ejecucion(despacho_id, intento, 'liberar', 'FALLA_TECNICA_SANITIZADA')`.
  Supabase decide reintento o agotamiento.

## Reglas para cualquier flow del repo (verificación estática)

1. Un input con `defaults` es `required: true`.
2. Toda lectura `detalle.<campo>` lleva `?? <valor>`.
3. Todo `envs.<nombre>` tiene `ENV_<NOMBRE>` declarado en
   `infra/kestra/compose.yaml`. `desplegar-flow.mjs` aplica la misma regla
   antes de publicar.
