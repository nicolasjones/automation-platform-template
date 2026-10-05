# Contrato: proveedor elegible por capacidad

Todas `security definer`, `set search_path = ''`.

## Panel (`authenticated`)

| Función | Permiso | Efecto |
|---|---|---|
| `public.elegir_proveedor_capacidad_organizacion(p_capacidad text, p_proveedor text, p_acepto_envio_credencial boolean default false) returns void` | administrador de la organización activa | valida catálogo activo; si `requiere_conexion_organizacion`, exige una conexión de ese sistema en la organización (error `PROVEEDOR_SIN_CONEXION`); si `envia_credencial_a_tercero` y no acepta → `ACEPTACION_REQUERIDA`; upsert + evento. |
| `public.elegir_proveedor_capacidad_cliente(p_cliente_id uuid, p_capacidad text, p_proveedor text, p_acepto_envio_credencial boolean default false) returns void` | administrador | mismas validaciones; cliente de la organización del llamante; upsert + evento. |
| `public.quitar_proveedor_capacidad_cliente(p_cliente_id uuid, p_capacidad text) returns void` | administrador | borra la excepción + evento; no-op si no existía o el cliente ya no existe. |
| `public.proveedores_capacidad_de_organizacion() returns table(capacidad, proveedor, nombre_visible, origen text, disponible boolean, opciones jsonb)` | miembro | solo capacidades con 2+ proveedores activos; `opciones` trae el catálogo activo completo para el selector. |
| `public.proveedores_efectivos_de_cliente(p_cliente_id uuid) returns table(capacidad, proveedor, nombre_visible, origen text, disponible boolean, motivo_no_disponible text)` | miembro | `origen in ('cliente','organizacion','catalogo')`; rechaza si el cliente no es de la organización del llamante. |

## Orquestación / workers

`private.resolver_proveedor_capacidad(p_organizacion_id uuid, p_cliente_id uuid, p_capacidad text) returns table(proveedor text, clave_ejecucion text, origen text, disponible boolean, motivo_no_disponible text)`

- `execute` solo a `kestra_orquestacion` y `workers_orquestacion` (no a
  `authenticated`).
- `disponible = false` con `motivo_no_disponible in ('SIN_CONEXION', 'CONEXION_INVALIDA', 'PROVEEDOR_RETIRADO')`.
  - `SIN_CONEXION` / `CONEXION_INVALIDA`: el proveedor nominal **no cambia**
    (nunca sustituye ante una falla, ver research.md R3); el consumidor
    decide.
  - `PROVEEDOR_RETIRADO`: caso degenerado, toda la capacidad quedó sin
    ningún proveedor activo (ver research.md R4 para el caso normal de un
    único proveedor retirado, que cae solo al siguiente nivel).
- Si no existe ninguna fila de catálogo para la capacidad → 0 filas (el
  consumidor usa su único proveedor, sin este mecanismo).

## Errores (código textual al inicio del mensaje, `errcode = 'P0001'` salvo
donde se indica)

- `NO_AUTORIZADO`: quien llama no administra la organización dueña.
- `PROVEEDOR_INEXISTENTE`: el proveedor no está activo para esa capacidad.
- `PROVEEDOR_SIN_CONEXION`: el proveedor exige una conexión que la
  organización no tiene.
- `ACEPTACION_REQUERIDA`: el proveedor envía credencial a un tercero y no
  se aceptó explícitamente.
- `CLIENTE_DESCONOCIDO` (`errcode = 'P0002'`): el cliente no existe.
