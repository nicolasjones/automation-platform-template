# Data Model: Estado, contacto y borrado restringido de clientes

## `public.clientes` (existente; columnas nuevas)

| Columna | Tipo | Regla |
|---|---|---|
| `estado` | `text not null default 'activo'` | `check (estado in ('activo', 'inactivo'))` |
| `email_contacto` | `text null` | `≤ 255`, `~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'` |
| `telefono_contacto` | `text null` | `≤ 64` |
| `observaciones` | `text null` | `≤ 2000` |
| `updated_at` | `timestamptz not null default now()` | fijada por trigger |

Filas existentes: `estado = 'activo'`, `updated_at = created_at`.

Índice: `(organizacion_id, estado)` para el listado por defecto (activos de la organización).

## Funciones

| Función | Tipo | Grant |
|---|---|---|
| `private.preparar_cliente()` | trigger `before insert or update`: `btrim` de `nombre`; vacío → `null` en contacto y observaciones | — |
| `private.fijar_fechas_auditoria()` | trigger genérico `before insert or update` (research.md, Decisión 3) | — |
| `private.motivo_cliente_no_borrable_producto(uuid) returns text` | punto de extensión; el template devuelve `null` | ninguno |
| `private.motivo_cliente_no_borrable(uuid) returns text` | extensión primero; después FK hacia `clientes` → `datos_asociados` | ninguno |
| `public.cliente_es_borrable(uuid) returns boolean` | `security definer` | `authenticated` |
| `public.borrar_cliente(uuid) returns void` | `security definer`, `for update` | `authenticated` |

Grants de tabla sin cambios: `select, insert, update` a `authenticated`, sin `DELETE`.

## Reversión (encabezado de la migración)

```sql
-- drop function if exists public.borrar_cliente(uuid);
-- drop function if exists public.cliente_es_borrable(uuid);
-- drop function if exists private.motivo_cliente_no_borrable(uuid);
-- drop function if exists private.motivo_cliente_no_borrable_producto(uuid);
-- drop trigger if exists clientes_fijar_fechas on public.clientes;
-- drop trigger if exists clientes_preparar on public.clientes;
-- drop function if exists private.fijar_fechas_auditoria();
-- drop function if exists private.preparar_cliente();
-- drop index if exists public.clientes_organizacion_estado_idx;
-- alter table public.clientes drop column updated_at, drop column observaciones,
--   drop column telefono_contacto, drop column email_contacto, drop column estado;
-- Se pierden estado/contacto/observaciones cargados después de aplicarla.
```

Un producto que ya redefinió `private.motivo_cliente_no_borrable_producto`
tiene que borrar su versión antes de revertir.
