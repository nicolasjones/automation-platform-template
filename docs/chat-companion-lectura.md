# Lectura de datos del chat companion

Cómo el chat companion del template consulta datos de negocio de un producto derivado, y qué necesita un producto para publicar una fuente. Nace de la spec `20261018-104239-chat-lectura-filtros` (capacidad `chat-companion-mechanism` 1.1.0).

## Piezas

- `supabase/functions/chat-ia-responder/index.ts` — Edge Function del chat. Resuelve la política aprobada (`governed-ai-core`), ejecuta el ciclo de tool-calling (Anthropic u OpenAI) y ejecuta las herramientas `leer` y `ejecutar`.
- `supabase/functions/chat-ia-responder/catalogo.ts` — lógica pura del catálogo: qué fuentes puede leer el usuario, la descripción de `leer` y la instrucción de sistema (con las reglas de negación).
- `supabase/functions/chat-ia-responder/consulta.ts` — lógica pura del plan de consulta: valida los criterios del modelo contra las columnas conocidas de la vista.
- `supabase/migrations/20261018120000_chat_lectura_filtros.sql` — `chat_fuentes_disponibles()`, `registrar_fuente_chat_ia()` y la habilitación de agregaciones de PostgREST.
- `supabase/tests/database/chat_lectura_filtros.test.sql` — pgTAP del descubrimiento, los permisos y el fail-closed.
- `catalogo.test.ts` y `consulta.test.ts` — `node --test` de la lógica pura (`pnpm test:edge`).

## Quién decide qué se puede leer

Nunca el prompt ni el modelo. La lectura se recorta en tres capas, en la capa de datos (`private.puede_chat_leer_funcionalidad`, fail-closed):

1. `chat-ia` habilitada para la organización (`organizaciones_features`).
2. la funcionalidad dueña de la fuente habilitada para la organización.
3. `capacidades_chat_ia.lectura = true` para esa funcionalidad (declaración de plataforma).

Y una cuarta capa implícita: la vista tiene que estar registrada en `fuentes_chat_ia` para una funcionalidad. Si la vista no existe, no es una fuente para el chat.

El aislamiento por organización no vive acá: cada producto publica sus vistas con `security_invoker = true`, y el chat las consulta con la sesión del propio usuario (nunca service-role). La RLS de la vista es el recorte real de filas.

## Alta de una fuente (el producto)

```sql
select public.registrar_fuente_chat_ia(
  'mi-funcionalidad',
  'dominio.mi_vista',                          -- "tabla" o "esquema.tabla"
  'Qué contiene, en lenguaje claro para el modelo'
);
```

Es un RPC de superadmin, atómico (registra la fuente y habilita la lectura) e idempotente. Las columnas **no** se registran: se leen de `information_schema` en cada invocación, así que una vista que suma una columna no requiere un paso extra.

Ver `docs/registrar-funcionalidad-desde-migracion.md` para el patrón completo (alta de la funcionalidad, la vista y su registro).

## Herramienta `leer`

```json
{
  "vista": "dominio.mi_vista",
  "filtros": { "empresa": "acme" },
  "rango": { "fecha": { "desde": "2026-07-01", "hasta": "2026-07-31" } },
  "orden": { "columna": "fecha", "direccion": "desc" },
  "limite": 20,
  "agregar": { "total_debe": { "columna": "debe", "operacion": "suma" } }
}
```

- `filtros` — igualdad columna/valor. Solo columnas listadas en el catálogo.
- `rango` — por columna, `desde` (>=) y/o `hasta` (<=).
- `orden` / `limite` — dirección `asc` (default) o `desc`; límite default 50, tope 1000.
- `agregar` — alias → `{columna, operacion}` con `suma`, `cantidad`, `promedio`, `minimo` o `maximo`. Devuelve **una fila de totales** (no aplica orden ni límite).

Desenlaces que el modelo distingue y declara (contrato completo en `specs/20261018-104239-chat-lectura-filtros/contracts/tool-leer.md`):

| Situación | Resultado |
|-----------|-----------|
| Vista no registrada, sin permiso o sin capacidad | `{ error: 'FUENTE_NO_DISPONIBLE' }` |
| La consulta corrió y no hay datos | `{ filas: [] }` o agregado nulo |
| La base rechazó la consulta | `{ error: 'ERROR_AL_LEER' }` |
| Criterio inválido (columna inventada, límite raro) | se descarta y se informa en `criteriosDescartados` |

Un criterio con columna inexistente se descarta antes de consultar (las columnas se conocen por el descubrimiento) y, como red de seguridad, si un criterio válido con un valor no convertible hace fallar la consulta, se reintenta sin criterios en vez de perder la respuesta.

## Agregaciones de PostgREST

PostgREST **deshabilita las funciones de agregado por defecto** (pueden recorrer la tabla entera sin salvaguardas) y responde `PGRST123` si se usan. La migración las habilita por rol:

```sql
alter role authenticator set pgrst.db_aggregates_enabled = 'true';
notify pgrst, 'reload config';   -- sin esto un stack ya levantado no las ve
```

Reversión:

```sql
alter role authenticator reset pgrst.db_aggregates_enabled;
notify pgrst, 'reload config';
```

Salvaguardas: solo se agrega sobre columnas de la fuente registrada, y el caso de uso real (totales de un período) siempre acota con los filtros de igualdad y rango. El tope de filas del detalle sigue vigente.

## Modo de fallo conocido

El chat no ordena por una columna agregada ni agrupa (`group by`): eso lo resuelve el producto publicando una vista ya agregada. Si una consulta agregada sobre una fuente muy grande tarda, el `statement_timeout` del rol es el único freno — la migración no lo toca a propósito (lo comparte la lectura normal de la plataforma).

## Verificación

```powershell
pnpm test:db       # pgTAP: descubrimiento, permisos, fail-closed, agregaciones
pnpm test:edge     # node --test: catálogo y plan de consulta
```

Ver `specs/20261018-104239-chat-lectura-filtros/quickstart.md` para la verificación de punta a punta (vista de prueba, registro, agregación real contra PostgREST).
