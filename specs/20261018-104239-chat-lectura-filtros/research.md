# Research: Lectura del chat companion con descubrimiento de fuentes y filtros

Fase 0 del plan. Cada decisión con su evidencia; ninguna queda abierta.

## R1 — Cómo llega el catálogo de fuentes al modelo

**Decisión**: dos vías redundantes, ambas derivadas de la misma consulta a la capa de datos: (a) la descripción del tool `leer` (que ya se construye por invocación en el producto de origen), y (b) la instrucción de sistema, que enumera las fuentes en lenguaje claro y prohíbe negar un acceso que sí existe.

**Por qué**: en el template actual la descripción del tool es estática ("Pares clave/valor para filtrar la consulta") y el modelo no tiene forma de conocer un nombre de vista. Probado en vivo en el producto de origen: sin el catálogo, el modelo inventa el nombre de la vista o niega el acceso en bloque.

**Alternativas rechazadas**:
- *Lista estática en el código*: el template no conoce las vistas de negocio de cada producto (rompería FR-015 y el principio de plataforma sin dominio).
- *Solo la descripción del tool*: el modelo igual negaba el acceso cuando la pregunta no salía de una fuente; la instrucción de sistema es lo que fija las reglas de negación (hallazgo de code-review del producto de origen, ver `catalogo.ts`).

## R2 — Cómo conoce el modelo las columnas de cada fuente

**Decisión**: `chat_fuentes_disponibles()` devuelve, por fuente, además de `vista`/`descripcion`/`feature_id`, la lista `columnas text[]` leída en runtime de `information_schema.columns` para esa vista.

**Por qué**:
- Es metadata de una fuente que el usuario ya puede leer: no expone datos.
- Siempre está al día: una vista que suma una columna no requiere reinscribirse ni un paso manual (FR-014 y FR-015 sin costo de administración).
- Evita una columna nueva en `fuentes_chat_ia` (nada que mantener sincronizado ni que quede obsoleto si la vista se recrea — riesgo real con `drop`/`create view`).
- El producto de origen ya demostró el problema opuesto: el prompt le pide al modelo "usá solo columnas que conozcas con certeza" justamente porque no tenía cómo saberlas.

**Alternativas rechazadas**:
- *Columna `columnas jsonb` en `fuentes_chat_ia` poblada al registrar*: queda obsoleta si la vista se recrea con columnas nuevas, y agrega carga de administración al producto (obligaría a re-registrar).
- *Que el modelo adivine y reintentar (comportamiento del producto de origen)*: funciona como red de seguridad, no como diseño; con rangos y agregaciones el costo de adivinar sube (una agregación sobre una columna inexistente es un error, no un resultado).

**Costo**: una lectura extra de `information_schema.columns` por invocación del chat (pocas filas, catálogo). Se resuelve dentro de la misma función `stable` de descubrimiento: un solo viaje.

## R3 — Agregaciones: PostgREST las tiene **apagadas por defecto**

**Hallazgo verificado**: el contenedor PostgREST del stack local no define `PGRST_DB_AGGREGATES_ENABLED` (revisado con `docker inspect` sobre `supabase_rest_*`: solo `PGRST_DB_MAX_ROWS=1000` y `PGRST_DB_SCHEMAS=public,graphql_public,dominio`). La documentación de PostgREST lo confirma: *"Aggregate functions are disabled by default in PostgREST, because they can create performance problems without appropriate safeguards"*, y devuelve `PGRST123` si se usan sin habilitar. La guía de Supabase lo confirma también: se habilitan por rol con `ALTER ROLE authenticator SET pgrst.db_aggregates_enabled = 'true'; NOTIFY pgrst, 'reload config';`.

**Decisión**: habilitarlas en la migración de esta spec, por rol `authenticator`, con `notify pgrst`. Reversión explícita: `alter role authenticator reset pgrst.db_aggregates_enabled; notify pgrst, 'reload config';`.

**Salvaguardas** (por la advertencia de performance, que es real: una agregación puede recorrer la tabla entera):
- Solo se aceptan agregaciones sobre la fuente registrada (fail-closed) y sobre columnas que figuran en su metadata (`information_schema`); una columna inexistente no llega a la base.
- Las agregaciones se combinan con los filtros de igualdad y rango: el caso de uso (totales de un período) acota siempre por fecha.
- El límite y el orden no aplican a una consulta agregada (no tiene sentido filas); el `limite` sigue acotando las lecturas de detalle.
- La alternativa de dejar los totales en manos de "traer todas las filas y sumar en el modelo" está descartada por el tope de filas y por costo de tokens.
- No se toca el `statement_timeout` global (rompería exportaciones largas de productos y no es el objetivo de esta spec); el riesgo queda documentado acá y en la migración.

## R4 — Forma del contrato del tool `leer` (retrocompatible)

**Decisión**: el objeto de entrada del tool conserva `filtros` (igualdad, como hoy) y suma cuatro claves opcionales independientes:

```json
{
  "vista": "esquema.tabla",
  "filtros": { "empresa": "Maderas SA" },
  "rango":   { "fecha": { "desde": "2026-07-01", "hasta": "2026-07-31" } },
  "orden":   { "columna": "fecha", "direccion": "desc" },
  "limite":  20,
  "agregar": { "total": { "columna": "debe", "operacion": "suma" } }
}
```

**Por qué**: mantiene válido todo lo que el modelo ya manda hoy (`filtros`), y cada preocupación nueva es una clave con nombre propio (más fácil de describirle al modelo en un esquema JSON que un array genérico de condiciones). La validación de columnas se hace contra la metadata de R2.

**Alternativas rechazadas**:
- *Array genérico `{columna, op, valor}`*: obliga al modelo a inventar operadores (más errores) y rompe el formato actual de `filtros`.
- *Group-by (`agrupar`) para "totales por rubro"*: lo resuelve el producto publicando una vista ya agregada (patrón usado con las vistas `*_mes` de IVA), y PostgREST no soporta `having` ni ordenar por columna agregada — agregarlo al mecanismo sería prometer algo que la capa de datos no puede cumplir. Fuera de alcance.

## R5 — Prevención en vez de reintento: dónde se valida

**Decisión**: la validación vive en un módulo puro (`consulta.ts`) que recibe (entrada del modelo + columnas de la fuente) y devuelve el plan de consulta: columnas de filtro/rango/orden/agregación validadas contra la metadata, dirección normalizada, límite acotado (default 50, tope 1000), alias de agregación saneados. Lo que no valida, no se manda a la base; lo que se descarta, se informa en el resultado (`criteriosDescartados`) para que el modelo lo diga.

**Por qué**: el reintento sin filtros del producto de origen nació de un bug real (un filtro con columna inexistente hacía fallar toda la consulta con `ERROR_AL_LEER`), pero es caro y silencioso: trae más filas de las pedidas y el modelo no sabe que su filtro se ignoró. Con columnas conocidas (R2) se puede evitar el error antes de golpear la base, y el reintento queda como red de seguridad para columnas válidas con valor inválido (por ejemplo una fecha mal formada).

## R6 — Desenlaces y reglas de negación en el prompt

**Decisión**: tres desenlaces distintos y explícitos en el resultado del tool — `FUENTE_NO_DISPONIBLE`, filas vacías (o agregado nulo) y `ERROR_AL_LEER` — más el caso "no tengo ninguna fuente" — y las reglas correspondientes en la instrucción de sistema (decir qué sí se puede consultar en vez de negar en bloque; no confundir "sin resultados" con "sin acceso" ni con error). Si el modelo no devuelve texto, la Edge Function responde un mensaje que enumera las fuentes legibles.

**Por qué**: son cuatro situaciones que hoy se ven iguales desde el usuario, y fue la corrección de un hallazgo real de code-review en el producto de origen (`c9bac8d4`, "no niega fuentes que sí tiene y enumera lo que puede").

## R7 — Tests: qué se puede probar y con qué

**Decisión**:
- **pgTAP** (`supabase/tests/database/chat_lectura_fuentes.test.sql`): `chat_fuentes_disponibles` devuelve la fuente con sus columnas, respeta `puede_chat_leer_funcionalidad` (legible/no legible/funcionalidad no habilitada), es fail-closed sin capacidad, `registrar_fuente_chat_ia` es idempotente y valida vista `esquema.tabla` y la existencia de la funcionalidad; el setting `pgrst.db_aggregates_enabled` del rol `authenticator` está en `pg_roles.rolconfig`; los wrappers públicos tienen `execute` para `authenticated` y no para `public`.
- **`node --test`** sobre la lógica pura (`consulta.test.ts`, `catalogo.test.ts`): validación de columnas, rango, orden, límite (default/tope/valores inválidos), alias de agregación, armado de la expresión de `select` con agregados, y el texto del catálogo/prompt.
- **Verificación real** (quickstart, no CI): request contra PostgREST local con una vista de prueba para confirmar que una agregación devuelve el total y que no devuelve `PGRST123`.

**Por qué**: las agregaciones y el filtrado los hace PostgREST, no Postgres puro: pgTAP prueba el mecanismo SQL y la habilitación, y `node --test` prueba la construcción de la consulta. La combinación cubre el contrato sin depender de un proveedor de IA.

**Hallazgo de paso (se corrige en este cambio)**: en el producto de origen el script `test:edge` existe pero no está encadenado ni en `pnpm test` ni en `validate.yml`, así que los tests de la lógica pura de las Edge Functions nunca corren en CI. Acá se agrega `test:edge` y se encadena en `validate.yml`.

## R8 — Nombres y versiones

**Decisión**: los RPCs mantienen los nombres `chat_fuentes_disponibles` y `registrar_fuente_chat_ia` (los del producto de origen) para que el merge sea una sustitución, no dos implementaciones: el producto recibe por `git merge upstream/main` el `create or replace` del template y su propia migración queda como historia. La capacidad afectada es `chat-companion-mechanism` (1.0.1 → 1.1.0 al cerrar la implementación, en `template-capabilities.json`).
