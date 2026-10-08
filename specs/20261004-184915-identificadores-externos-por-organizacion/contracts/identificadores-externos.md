# Contrato: identificadores externos por organización

Reemplaza en lo que cambia a
`specs/20260930-135541-mapeo-identificadores-clientes/contracts/mapeo-identificadores-externos.md`.

## `vincular_identificador_externo(p_cliente_id, p_sistema, p_identificador_externo)`

- `P0002` si el cliente no existe; `42501` si quien llama no administra su organización.
- Busca `(organización del cliente, sistema, identificador)`:
  - no existe → crea asignado;
  - existe pendiente → lo asigna a `p_cliente_id`;
  - existe con el mismo cliente → no-op;
  - existe con otro cliente **de la misma organización** → `23505`.
- Nunca encuentra filas de otra organización.

## `desvincular_identificador_externo(p_id)`

Sin cambios de contrato: borra; no-op si no existe; `42501` sin permiso.

## `registrar_identificador_externo(p_organizacion_id, p_sistema, p_identificador_externo, p_nombre_en_sistema default null) returns uuid`

- Autoriza: `p_organizacion_id = private.organizacion_del_rol_actual()` o
  `private.es_administrador_de(p_organizacion_id)`; si no, `42501`.
- `22023` si `p_sistema` o `p_identificador_externo` están vacíos.
- `pg_advisory_xact_lock` por `(organización, sistema, identificador)`.
- No existe → crea pendiente, devuelve `null`.
- Existe → actualiza `nombre_en_sistema` si viene no vacío; devuelve su
  `cliente_id` (puede ser `null`). Nunca cambia `cliente_id`.

## `desasignar_identificador_externo(p_id)`

- `42501` sin permiso de administrador sobre la organización de la fila.
- No-op si no existe o ya está pendiente.
- Pone `cliente_id = null`.
