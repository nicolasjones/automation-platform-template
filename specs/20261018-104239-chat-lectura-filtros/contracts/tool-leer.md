# Contrato: herramienta `leer` del chat companion

Contrato de la herramienta que la Edge Function `chat-ia-responder` expone al proveedor de IA, y de los RPCs que la alimentan. Es la parte observable del mecanismo: lo que el modelo puede pedir y lo que el usuario recibe.

## 1. Entrada del tool (JSON schema que ve el modelo)

```json
{
  "vista": "esquema.tabla",
  "filtros": { "empresa": "Maderas SA", "origen": "colppy" },
  "rango": { "fecha": { "desde": "2026-07-01", "hasta": "2026-07-31" } },
  "orden": { "columna": "fecha", "direccion": "desc" },
  "limite": 20,
  "agregar": {
    "total_debe": { "columna": "debe", "operacion": "suma" },
    "movimientos": { "columna": "id", "operacion": "cantidad" }
  }
}
```

| Campo | Obligatorio | Semántica |
|-------|-------------|-----------|
| `vista` | sí | Nombre exacto de una vista del catálogo legible. Nunca inventado: la descripción del tool lista los nombres válidos. |
| `filtros` | no | Igualdad por columna. Compatible con el contrato anterior (mismo nombre y forma). |
| `rango` | no | Por columna, `desde` (mayor o igual) y/o `hasta` (menor o igual). Al menos uno de los dos. Admite varias columnas (por ejemplo fecha y un monto). |
| `orden` | no | Columna y dirección (`asc` por defecto). |
| `limite` | no | Filas a devolver. Default 50, tope 1000 (el tope de la capa de datos). |
| `agregar` | no | Alias → `{columna, operacion}`. Operaciones: `suma`, `cantidad`, `promedio`, `minimo`, `maximo`. Devuelve totales en vez de filas. |

Reglas de negación que el modelo recibe en la instrucción de sistema:

1. `leer` solo acepta vistas del catálogo inyectado; si la vista pedida no está, el resultado es `FUENTE_NO_DISPONIBLE` y el chat debe decir que no tiene acceso a esos datos.
2. Filas vacías o agregado nulo significan **no hay resultados** para ese criterio: no es falta de acceso y no es un error.
3. `ERROR_AL_LEER` significa que la consulta no se pudo hacer: el chat debe decir que no pudo consultar, no "no tengo acceso".
4. Si la pregunta no sale de ninguna fuente, el chat dice qué sí puede consultar (en lenguaje claro, sin nombres técnicos de vistas) y ofrece lo más cercano.
5. Si no hay ninguna fuente legible, lo dice explícitamente (no un "no tengo acceso" genérico).

## 2. Validación previa (nunca llega a la base un criterio inválido)

Con las `columnas` de la fuente devueltas por `chat_fuentes_disponibles()`:

- Columna inexistente en `filtros`, `rango`, `orden` o `agregar` → el criterio se **descarta** y se informa en `criteriosDescartados`.
- `direccion` distinta de `asc`/`desc` → se normaliza a `asc`.
- `limite` no entero, cero o negativo → se usa el default (50); mayor al tope → se usa el tope (1000).
- Operación de agregación no soportada → se descarta ese alias.
- Alias de agregación fuera de `[a-z_][a-z0-9_]*` → se sanea.
- Consulta con agregados: no se aplican `orden` ni `limite`.

## 3. RPCs

### `public.chat_fuentes_disponibles()`
`security definer`, `stable`, `search_path = ''`. Devuelve `(vista text, descripcion text, feature_id text, columnas text[])`.

- Filtra por `public.puede_chat_leer_funcionalidad(feature_id)` (fail-closed).
- `columnas`: de `information_schema.columns` para la vista, ordenadas por `ordinal_position`; array vacío si la vista no existe.
- Orden de salida estable: `feature_id`, `vista`.
- `execute` solo para `authenticated` (revocado de `public`). Wrapper público de `private.chat_fuentes_disponibles()`.

### `public.registrar_fuente_chat_ia(p_feature_id text, p_vista text, p_descripcion text)`
Alta por convención, idempotente (upsert), solo superadmin. Valida: `feature_id` no vacío y existente en `features`; `vista` no vacía y con forma `tabla` o `esquema.tabla` (`^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$`). Registra la fuente y pone `capacidades_chat_ia.lectura = true` de forma atómica. `execute` solo para `authenticated`; núcleo `private.*` sin chequeo de actor (lo llama la migración como `postgres`).

## 4. Configuración del motor de lectura

`alter role authenticator set pgrst.db_aggregates_enabled = 'true'; notify pgrst, 'reload config';`

Sin esto, PostgREST responde `PGRST123` a cualquier `select` con función de agregado (está apagado por defecto en PostgREST). Reversión: `alter role authenticator reset pgrst.db_aggregates_enabled; notify pgrst, 'reload config';`.

## 5. Garantías

- **Aislamiento**: la lectura corre con la sesión del usuario; el recorte real lo hace la RLS de la vista registrada (cada producto publica con `security_invoker = true`). El mecanismo no usa credenciales elevadas para leer datos de negocio.
- **Solo lectura**: el tool `leer` no escribe; la ejecución de acciones es otro tool y no cambia en esta feature.
- **Fail-closed**: sin fuente registrada o sin permiso de lectura, `FUENTE_NO_DISPONIBLE`, aunque el nombre de la vista sea correcto.
- **Sin segunda capa de allowlist**: no se filtra por nombre de columna al devolver las filas — el límite de qué datos ve el chat es que el superadmin registró esa vista.
