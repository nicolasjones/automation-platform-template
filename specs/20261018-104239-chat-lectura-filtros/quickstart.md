# Quickstart: validar la lectura del chat companion con descubrimiento y filtros

## Requisitos

- `pnpm dev:supabase` corriendo (stack local, contenedor `automation-platform-template-supabase-de`).
- `pnpm install` hecho.
- Para el paso 4: la Edge Function desplegada/servida en local y al menos una conversación de chat con una política de IA aprobada (el proveedor de IA no importa para validar la mecánica de lectura: el paso 4 se puede hacer contra PostgREST directo).

## 1. Tests automáticos

```powershell
pnpm test:db                      # pgTAP: descubrimiento, permisos, fail-closed, registro, setting de agregaciones
pnpm test:edge                    # node --test: validación y armado de la consulta, catálogo y prompt
```

Criterio: `chat_lectura_fuentes.test.sql` pasa completo (incluye el aislamiento entre dos organizaciones) y los tests puros cubren los bordes del contrato (columna inexistente descartada, límite default/tope, dirección normalizada, agregado sobre columna válida).

## 2. Descubrimiento con columnas (SQL)

```sql
-- fuente de prueba mínima
create schema if not exists dominio;
create view dominio.fuente_prueba with (security_invoker = true) as
  select '2026-07-01'::date as fecha, 'acme'::text as empresa, 100::numeric as debe;
grant select on dominio.fuente_prueba to authenticated;

-- registrar como fuente de una funcionalidad existente (como superadmin)
select public.registrar_fuente_chat_ia('<feature-id>', 'dominio.fuente_prueba', 'Fuente de prueba');

-- el descubrimiento debe devolverla CON sus columnas
select vista, descripcion, feature_id, columnas
from public.chat_fuentes_disponibles()
where vista = 'dominio.fuente_prueba';
```

Criterio: `columnas` trae `{fecha,empresa,debe}` (orden por posición). Sin `lectura = true` o con la funcionalidad no habilitada para la organización, la fila no aparece.

## 3. Agregaciones habilitadas (PostgREST)

```powershell
# la clave anónima local sale de `supabase status` (clave `anon`)
$anon = "<anon-key>"
curl "$env:SUPABASE_URL/rest/v1/fuente_prueba?select=total_debe:debe.sum()" -H "apikey: $anon" -H "Authorization: Bearer $anon"
```

Criterio: devuelve `[{"total_debe": 100}]`. Si la respuesta es un error con código `PGRST123`, el setting `pgrst.db_aggregates_enabled` no llegó (revisar la migración y que se haya emitido `notify pgrst`).

```sql
-- estado del setting, sin depender del motor
select rolname, rolconfig from pg_roles where rolname = 'authenticator';
```

## 4. Lectura real del chat con rango, orden y totales

Con una fuente legible y un chat configurado, pedir en la conversación:

1. "Traeme los movimientos de julio de 2026, los últimos 20, ordenados por fecha descendente" → el resultado que recibe el modelo debe llevar rango de fecha, orden y límite 20; el chat responde filas de ese rango.
2. "¿Cuánto suma la columna debe en julio?" → debe resolverse con una agregación (una fila de totales), no trayendo todas las filas.
3. "Filtrá por una columna que no existe" (o pedir un dato que no sale de ninguna fuente) → el chat no pierde la respuesta: descarta el criterio inválido o enumera qué sí puede consultar.
4. Una organización sin la fuente habilitada → el chat responde que no tiene acceso a esos datos (no un error).

## 5. Reversión verificable

```sql
alter role authenticator reset pgrst.db_aggregates_enabled;
notify pgrst, 'reload config';
```

Y las funciones se retiran en orden inverso (ver el pie de la migración). Las filas de `fuentes_chat_ia`/`capacidades_chat_ia` registradas por productos son aditivas: borrarlas solo si se revierte el alta por convención completa.
