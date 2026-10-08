# Contrato: operaciones de ciclo de vida de clientes

## `public.cliente_es_borrable(p_cliente_id uuid) returns boolean`

- `42501`: quien llama no puede escribir en su organización.
- `P0002`: el cliente no existe o es de otra organización (no se distinguen).
- `true` si `private.motivo_cliente_no_borrable(p_cliente_id)` es `null`.

## `public.borrar_cliente(p_cliente_id uuid) returns void`

- Mismos `42501`/`P0002`.
- Toma la fila del cliente con `for update`.
- `P0001`, mensaje "El cliente tiene datos asociados; dalo de baja en su
  lugar", `detail` = motivo (`datos_asociados` u otro del producto).
- Si no hay motivo, borra la fila.

## Punto de extensión

```sql
create or replace function private.motivo_cliente_no_borrable_producto(p_cliente_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$ select null::text $$;
```

Un producto la reemplaza en su propia migración, con la misma firma, y
devuelve su motivo (texto corto en `snake_case`) o `null`. No reemplaza
`private.motivo_cliente_no_borrable`.

## Baja y reactivación

Sin RPC: `update public.clientes set estado = 'inactivo' | 'activo'` por la
API, con la RLS de update existente.

## Mensajes en la pantalla

| Código | Mensaje |
|---|---|
| `23514` en `clientes_email_contacto_valido` | "El email no tiene un formato válido." |
| `23514` en los checks de largo | "El texto supera el largo permitido." |
| `P0001` de `borrar_cliente` | "Tiene datos asociados. Podés darlo de baja." |
| `42501` | "No tenés permiso para esta acción." |
