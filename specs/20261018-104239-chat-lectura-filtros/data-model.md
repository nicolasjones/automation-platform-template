# Data Model: Lectura del chat companion con descubrimiento de fuentes y filtros

**Sin cambios de esquema.** No se crean, alteran ni destruyen tablas, columnas, políticas ni vistas. La feature es de comportamiento: dos RPCs que ya existen en un producto derivado se generalizan en el template, y una Edge Function cambia cómo arma su consulta.

## Tablas existentes que se usan (sin cambios)

### `public.fuentes_chat_ia`
Qué vista puede consultar el chat, por funcionalidad conectable.

| Columna | Tipo | Rol en esta feature |
|---------|------|---------------------|
| `feature_id` | text (FK `features.id`) | a qué funcionalidad pertenece la fuente; clave del recorte por permiso |
| `vista` | text | nombre de la relación: `tabla` o `esquema.tabla` (validado por patrón) |
| `descripcion` | text (nullable) | texto que el modelo recibe en el catálogo |

Clave primaria `(feature_id, vista)` → cumple FR-017 (no hay dos fuentes con la misma vista para la misma funcionalidad). RLS: lectura abierta a `authenticated`, mutación solo superadmin.

### `public.capacidades_chat_ia`
Declaración por funcionalidad de si el chat puede leer y/o ejecutar.

| Columna | Tipo | Rol en esta feature |
|---------|------|---------------------|
| `feature_id` | text (PK, FK `features.id`) | la funcionalidad |
| `lectura` | boolean | habilita la lectura (fail-closed si es `false`) |
| `ejecucion` | boolean | **sin cambios** en esta feature |

## Proyecciones y estructuras derivadas (no persistidas)

### Fuente legible (salida de `chat_fuentes_disponibles()`)
| Campo | Tipo | Origen |
|-------|------|--------|
| `vista` | text | `fuentes_chat_ia.vista` |
| `descripcion` | text | `fuentes_chat_ia.descripcion` |
| `feature_id` | text | `fuentes_chat_ia.feature_id` |
| `columnas` | text[] | **derivado**: `information_schema.columns` de la vista, ordenado por `ordinal_position` |

Regla: una fila se devuelve solo si `public.puede_chat_leer_funcionalidad(feature_id)` es verdadero (chat habilitado + funcionalidad habilitada para la organización + `capacidades_chat_ia.lectura`). Si la vista no existe en la base, la fuente se devuelve con `columnas` vacío (no se oculta: la lectura fallará contenida y distinguible).

### Plan de consulta (validado antes de golpear la base)
| Campo | Tipo | Regla |
|-------|------|-------|
| `esquema` | text | `public` si la vista no trae prefijo; en otro caso el prefijo declarado |
| `tabla` | text | la vista sin el prefijo de esquema |
| `igualdad` | pares columna→valor | solo columnas presentes en `columnas` |
| `rango` | columna → `{desde?, hasta?}` | solo columnas presentes; al menos un extremo; extremos tal como vienen (comparación la hace la base) |
| `orden` | `{columna, direccion}` | columna presente; `direccion` en `asc`/`desc` (default `asc`) |
| `limite` | entero | default `50`, tope `1000`; valores inválidos no negocian: se usa el default |
| `agregados` | alias → `{columna, operacion}` | columna presente; `operacion` en `suma`/`cantidad`/`promedio`/`minimo`/`maximo`; alias saneado (`[a-z_][a-z0-9_]*`) |
| `criteriosDescartados` | lista de textos | lo que no pasó la validación, para que el modelo lo declare en su respuesta |

Invariante: si `agregados` no está vacío, la consulta devuelve **una fila de totales** (no aplica `orden` ni `limite`).

### Resultado de una lectura
| Variante | Forma | Cuándo |
|----------|-------|--------|
| filas | `{ filas: [...], criteriosDescartados?: [...] }` | lectura de detalle |
| agregado | `{ agregados: [...], criteriosDescartados?: [...] }` | con `agregar` |
| sin fuente | `{ error: 'FUENTE_NO_DISPONIBLE' }` | vista no registrada, sin permiso, o lectura deshabilitada |
| sin filas | `{ filas: [] }` / agregado nulo | la consulta corrió y no hay datos |
| error de consulta | `{ error: 'ERROR_AL_LEER' }` | la base rechazó la consulta aun validada (p. ej. valor no convertible) |

## Configuración (no es tabla)

- **Rol `authenticator`**: `pgrst.db_aggregates_enabled = 'true'` (más `notify pgrst, 'reload config'`), necesario para que las agregaciones del contrato funcionen. Reversión: `alter role authenticator reset pgrst.db_aggregates_enabled; notify pgrst, 'reload config';`.
- **System prompt**: configurable por producto (`CHAT_COMPANION_SYSTEM_PROMPT`); el catálogo y las reglas de negación se agregan siempre, sin identidad de producto hardcodeada (FR-016).
