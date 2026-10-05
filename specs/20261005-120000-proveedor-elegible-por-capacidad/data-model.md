# Data Model: Proveedor elegible por capacidad

Migración aditiva; reversión documentada en el encabezado de
`supabase/migrations/20261005120000_proveedor_elegible_por_capacidad.sql`.

## `public.capacidades_proveedores` (catálogo)

| Columna | Tipo | Notas |
|---|---|---|
| `capacidad` | text | slug libre, define cada producto |
| `proveedor` | text | FK `sistemas_externos(id)` |
| `nombre_visible` | text | nombre legible para UI |
| `clave_ejecucion` | text | puntero de texto al mecanismo de ejecución de cada producto, sin FK |
| `es_default` | boolean | exactamente uno por capacidad (índice único parcial `where es_default`) |
| `requiere_conexion_organizacion` | text null | FK `sistemas_externos(id)` |
| `envia_credencial_a_tercero` | boolean | exige aceptación explícita al elegirlo |
| `activo` | boolean | retirar sin borrar (ver research.md R4) |

PK `(capacidad, proveedor)`. RLS: `select` a `authenticated`; sin
escritura (solo migraciones de cada producto derivado).

## `public.proveedor_capacidad_organizacion`

`organizacion_id` (FK `organizaciones` on delete cascade), `capacidad`,
`proveedor`, `acepto_envio_credencial_en` (timestamptz null),
`actualizado_por`/`actualizado_en`. PK `(organizacion_id, capacidad)`; FK
`(capacidad, proveedor)` → catálogo.

## `public.proveedor_capacidad_cliente`

`cliente_id` (FK `clientes` on delete cascade), `organizacion_id` (fijado
por trigger desde `clientes.organizacion_id`, nunca confiado del llamante),
`capacidad`, `proveedor`, `acepto_envio_credencial_en`,
`actualizado_por`/`actualizado_en`. PK `(cliente_id, capacidad)`; FK
`(capacidad, proveedor)` → catálogo.

## `public.eventos_proveedor_capacidad`

`id bigint identity`, `organizacion_id`, `cliente_id` (null, on delete set
null — el evento sobrevive al cliente), `capacidad`, `proveedor_anterior`
null, `proveedor_nuevo` null, `acepto_envio_credencial` bool, `actor` uuid
null (null = sistema, p. ej. un retiro de catálogo), `ocurrido_en`. Solo
inserción vía funciones y vía el trigger de retiro.

## RLS

- Lectura de elecciones/eventos: miembros de la organización (o
  superadmin), vía `private.organizacion_id()`.
- Escritura: solo funciones `security definer` con
  `private.es_administrador_de`; policies de insert/update/delete quedan
  como cinturón de seguridad (sin GRANT de escritura a `authenticated`).
- Lectura de resolución para orquestación/workers vía función privada
  (`private.resolver_proveedor_capacidad`), `execute` solo a
  `kestra_orquestacion` y `workers_orquestacion`.

## Triggers

- `proveedor_capacidad_cliente_fijar_organizacion` (before insert/update):
  fija `organizacion_id` desde `clientes`.
- `capacidades_proveedores_retirar_elecciones` (after update, `activo`
  true → false): borra elecciones/excepciones del proveedor retirado y
  audita cada baja con `actor = null`.

## Reversión

```sql
drop trigger if exists proveedor_capacidad_cliente_fijar_organizacion on public.proveedor_capacidad_cliente;
drop function if exists private.fijar_organizacion_proveedor_capacidad_cliente();
drop trigger if exists capacidades_proveedores_retirar_elecciones on public.capacidades_proveedores;
drop function if exists private.retirar_elecciones_proveedor_capacidad();
drop function if exists public.proveedores_efectivos_de_cliente(uuid);
drop function if exists public.proveedores_capacidad_de_organizacion();
drop function if exists private.resolver_proveedor_capacidad(uuid, uuid, text);
drop function if exists public.quitar_proveedor_capacidad_cliente(uuid, text);
drop function if exists public.elegir_proveedor_capacidad_cliente(uuid, text, text, boolean);
drop function if exists public.elegir_proveedor_capacidad_organizacion(text, text, boolean);
drop table if exists public.eventos_proveedor_capacidad;
drop table if exists public.proveedor_capacidad_cliente;
drop table if exists public.proveedor_capacidad_organizacion;
drop table if exists public.capacidades_proveedores;
```
