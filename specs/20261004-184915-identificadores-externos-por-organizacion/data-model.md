# Data Model: Identificadores externos únicos por organización

## `public.clientes` (existente)

- Nuevo: `unique (id, organizacion_id)` (`clientes_id_organizacion_key`),
  destino de la FK compuesta. No cambia datos.

## `public.clientes_identificadores_externos` (existente)

| Columna | Antes | Después |
|---|---|---|
| `id` | `uuid pk` | sin cambios |
| `organizacion_id` | — | `uuid not null references organizaciones on delete cascade`; backfill desde `clientes` |
| `cliente_id` | `uuid not null references clientes on delete cascade` | `uuid null`; FK compuesta `(cliente_id, organizacion_id) → clientes (id, organizacion_id) on delete cascade` |
| `sistema` | `text not null` | sin cambios |
| `identificador_externo` | `text not null` | sin cambios |
| `nombre_en_sistema` | — | `text null`, `≤ 255` |
| `created_at` | `timestamptz` | sin cambios |
| `updated_at` | — | `timestamptz not null default now()` (cambia al asignar o desasignar) |

Restricciones:

- Se quita `clientes_identificadores_externos_sistema_identificador_key`
  (global).
- Se agrega `clientes_identificadores_externos_org_sistema_identificador_key`
  `unique (organizacion_id, sistema, identificador_externo)`.
- Se conserva `clientes_identificadores_externos_no_vacio`.
- Índice parcial `(organizacion_id) where cliente_id is null` para la lista
  de pendientes.

Estados: **pendiente** (`cliente_id is null`) ↔ **asignado** (`cliente_id`
no nulo). Asignar: `vincular_identificador_externo`. Desasignar:
`desasignar_identificador_externo`. Borrar: `desvincular_identificador_externo`
o borrado del cliente (cascade).

## RLS

- `select`: `organizacion_id = (select private.organizacion_id())`.
- `insert`/`delete`: policies de cinturón de seguridad con
  `private.es_administrador_de(organizacion_id)`; sin grants de escritura.

## Funciones

| Función | Cambio | Grant |
|---|---|---|
| `vincular_identificador_externo(uuid, text, text)` | `on conflict` por organización; asigna un pendiente | `authenticated` |
| `desvincular_identificador_externo(uuid)` | resuelve organización por la fila | `authenticated` |
| `registrar_identificador_externo(uuid, text, text, text) returns uuid` | nueva | `authenticated`, `workers_orquestacion` |
| `desasignar_identificador_externo(uuid)` | nueva | `authenticated` |
