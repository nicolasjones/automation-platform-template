-- Chat companion — descubrimiento de fuentes con columnas, alta por convención
-- y habilitación de agregaciones para la lectura
-- (spec 20261018-104239-chat-lectura-filtros).
--
-- Cierra dos huecos del mecanismo genérico:
--   1. "encendido y ciego": `fuentes_chat_ia` se declara por producto, pero el
--      modelo nunca recibe la lista de vistas consultables ni sabe qué
--      columnas puede filtrar; y el alta por convención (fuente + capacidad
--      de lectura, atómico) no existía en la plataforma.
--   2. Los totales ("cuánto suma julio") solo se podían responder trayendo
--      todas las filas hasta el tope de PostgREST (1000) — y las funciones de
--      agregado de PostgREST están APAGADAS por defecto, así que ni eso.
--
-- Esta migración es ADITIVA (no crea, altera ni destruye tablas):
--   1. private/public.chat_fuentes_disponibles()  -> + columna `columnas`.
--   2. private/public.registrar_fuente_chat_ia()  -> alta por convención.
--   3. Habilitación de agregaciones de PostgREST para el rol authenticator.
-- Reversión al pie del archivo.
--
-- Contrato: specs/20261018-104239-chat-lectura-filtros/contracts/tool-leer.md

-- ============================================================================
-- 1. Descubrimiento: fuentes que el llamante puede leer, con sus columnas
-- ============================================================================
-- El recorte real de permiso vive en puede_chat_leer_funcionalidad (chat-ia
-- habilitada + la funcionalidad habilitada + capacidad de plataforma), nunca
-- en el prompt (Principio I). Las columnas se derivan de la vista en runtime
-- (no se persisten): siempre están al día, sin un paso manual que se olvide
-- cuando la vista suma una columna o se recrea.
create or replace function private.chat_fuentes_disponibles()
returns table (vista text, descripcion text, feature_id text, columnas text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    f.vista,
    f.descripcion,
    f.feature_id,
    coalesce(
      (
        select array_agg(c.column_name::text order by c.ordinal_position)
        from information_schema.columns c
        where c.table_schema = case
                when position('.' in f.vista) > 0 then split_part(f.vista, '.', 1)
                else 'public'
              end
          and c.table_name = case
                when position('.' in f.vista) > 0 then split_part(f.vista, '.', 2)
                else f.vista
              end
      ),
      -- Vista registrada que todavía no existe: se devuelve igual (sin
      -- columnas). No se oculta la fuente — el destino ya la consideraba
      -- legible y la lectura tiene que fallar contenida y distinguible, no
      -- desaparecer del catálogo por un error de tipeo del registro.
      array[]::text[]
    ) as columnas
  from public.fuentes_chat_ia f
  where public.puede_chat_leer_funcionalidad(f.feature_id)
  order by f.feature_id, f.vista;
$$;

comment on function private.chat_fuentes_disponibles() is
  'Contrato: specs/20261018-104239-chat-lectura-filtros/contracts/tool-leer.md. Devuelve, para la sesión del llamante, las fuentes de fuentes_chat_ia que pasan puede_chat_leer_funcionalidad (fail-closed), cada una con las columnas de su vista leídas de information_schema en runtime. Alimenta el descubrimiento del chat (FR-001..FR-004, FR-014).';

-- PostgREST no expone el schema private (por diseño) — wrapper público, mismo
-- patrón que public.puede_chat_leer_funcionalidad.
--
-- `drop` previo necesario: la función existía (si el producto ya la tenía con
-- 3 columnas) y `create or replace` no puede cambiar el tipo de retorno.
drop function if exists public.chat_fuentes_disponibles();

create or replace function public.chat_fuentes_disponibles()
returns table (vista text, descripcion text, feature_id text, columnas text[])
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.chat_fuentes_disponibles();
$$;

comment on function public.chat_fuentes_disponibles() is
  'Wrapper público de private.chat_fuentes_disponibles — ver public.tiene_feature_publica para el mismo patrón.';

revoke execute on function public.chat_fuentes_disponibles() from public;
grant execute on function public.chat_fuentes_disponibles() to authenticated;

-- ============================================================================
-- 2. Alta por convención: fuente + capacidad de lectura, atómico e idempotente
-- ============================================================================

-- Sin chequeo de actor: es el núcleo llamado por la migración/proceso de alta
-- (rol postgres) y por el wrapper con chequeo de superadmin. Mantener la
-- escritura acá evita registrar una fuente sin su capacidad (o al revés).
create or replace function private.registrar_fuente_chat_ia(p_feature_id text, p_vista text, p_descripcion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_feature_id is null or btrim(p_feature_id) = '' then
    raise exception 'La funcionalidad (feature_id) es obligatoria' using errcode = '22023';
  end if;
  if p_vista is null or btrim(p_vista) = '' then
    raise exception 'La vista es obligatoria' using errcode = '22023';
  end if;
  -- "tabla" o "esquema.tabla" — el chat la resuelve con PostgREST (el schema
  -- va por header, no en la ruta). Identificadores simples, sin comillas.
  if btrim(p_vista) !~ '^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$' then
    raise exception 'La vista debe ser "tabla" o "esquema.tabla"' using errcode = '22023';
  end if;
  if not exists (select 1 from public.features where id = p_feature_id) then
    raise exception 'La funcionalidad % no existe', p_feature_id using errcode = 'P0002';
  end if;

  insert into public.fuentes_chat_ia (feature_id, vista, descripcion)
  values (p_feature_id, btrim(p_vista), nullif(btrim(p_descripcion), ''))
  on conflict (feature_id, vista) do update
    set descripcion = excluded.descripcion;

  insert into public.capacidades_chat_ia (feature_id, lectura, actualizado_por)
  values (p_feature_id, true, (select auth.uid()))
  on conflict (feature_id) do update
    set lectura = true, actualizado_por = excluded.actualizado_por, actualizado_en = now();
end;
$$;

comment on function private.registrar_fuente_chat_ia(text, text, text) is
  'Núcleo del alta por convención de fuentes del Chat IA: upsert en fuentes_chat_ia + capacidades_chat_ia.lectura=true. Idempotente (FR-005).';

create or replace function public.registrar_fuente_chat_ia(p_feature_id text, p_vista text, p_descripcion text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_superadmin()) then
    raise exception 'Solo un superadmin puede registrar fuentes del Chat IA' using errcode = '42501';
  end if;
  perform private.registrar_fuente_chat_ia(p_feature_id, p_vista, p_descripcion);
end;
$$;

comment on function public.registrar_fuente_chat_ia(text, text, text) is
  'Contrato: specs/20261018-104239-chat-lectura-filtros/contracts/tool-leer.md. Alta de fuente del Chat IA por convención (superadmin). Registra la fuente y habilita su lectura de forma atómica e idempotente.';

revoke execute on function public.registrar_fuente_chat_ia(text, text, text) from public;
grant execute on function public.registrar_fuente_chat_ia(text, text, text) to authenticated;

-- ============================================================================
-- 3. Agregaciones de PostgREST para la lectura (totales sin traer filas)
-- ============================================================================
-- PostgREST deshabilita las funciones de agregado por defecto (pueden recorrer
-- la tabla entera sin salvaguardas) y responde PGRST123 si se usan. El caso de
-- uso real (totales de un período) siempre acota con los filtros de igualdad y
-- rango que valida la Edge Function contra las columnas de la fuente; el tope
-- de filas de detalle sigue vigente. Reversión al pie del archivo.
--
-- Guarda por rol ausente: en un stack Supabase el rol `authenticator` siempre
-- existe, pero un `alter role` sobre un rol inexistente aborta la migración
-- entera — mejor no depender de eso para aplicar el resto del archivo.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_aggregates_enabled = ''true''';
    -- PostgREST lee la config del rol al arrancar; sin este aviso un stack
    -- ya levantado sigue con las agregaciones apagadas hasta reiniciar.
    perform pg_notify('pgrst', 'reload config');
  else
    raise notice 'Rol authenticator ausente: no se habilitaron las agregaciones de PostgREST (fuera de un stack Supabase, es esperable)';
  end if;
end $$;

-- Reversión:
--   alter role authenticator reset pgrst.db_aggregates_enabled;
--   notify pgrst, 'reload config';
--   drop function if exists public.registrar_fuente_chat_ia(text, text, text);
--   drop function if exists private.registrar_fuente_chat_ia(text, text, text);
--   drop function if exists public.chat_fuentes_disponibles();
--   drop function if exists private.chat_fuentes_disponibles();
--   -- (las filas registradas en fuentes_chat_ia/capacidades_chat_ia son
--   --  aditivas; borrarlas solo si se revierte el alta por convención completa)
