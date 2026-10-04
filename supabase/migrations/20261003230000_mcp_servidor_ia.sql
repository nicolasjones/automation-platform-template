-- Servidor MCP genérico (spec servidor-mcp-generico): expone, a un cliente
-- externo de IA, lectura y/o ejecución sobre las funcionalidades que el
-- producto tenga registradas en el panel de funcionalidades. Reversión:
-- deshabilitar la funcionalidad (borrar de organizaciones_features), después
-- retirar RLS/RPCs/tablas en orden inverso a como se crean acá.

-- ============================================================================
-- Tablas: capacidades de plataforma (propias, no comparten con chat — R3)
-- ============================================================================

create table capacidades_mcp (
  feature_id text primary key references features (id) on delete cascade,
  lectura boolean not null default false,
  ejecucion boolean not null default false,
  actualizado_por uuid references auth.users (id) on delete set null,
  actualizado_en timestamptz not null default now()
);

comment on table capacidades_mcp is
  'Declaración a nivel plataforma de si el servidor MCP puede leer y/o ejecutar acciones sobre una funcionalidad conectable. Independiente de capacidades_chat_ia (spec chat-ia-supabase) — distinto modelo de confianza (credencial, no sesión de usuario). Ver data-model.md.';

alter table capacidades_mcp enable row level security;

create policy capacidades_mcp_solo_superadmin on capacidades_mcp
  for all
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

grant select, insert, update, delete on table capacidades_mcp to authenticated;

create table fuentes_mcp (
  feature_id text not null references features (id) on delete cascade,
  vista text not null,
  descripcion text,
  primary key (feature_id, vista)
);

comment on table fuentes_mcp is
  'Qué vista de solo lectura puede exponer el servidor MCP por funcionalidad conectable.';

alter table fuentes_mcp enable row level security;

create policy fuentes_mcp_solo_superadmin on fuentes_mcp
  for all
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

grant select, insert, update, delete on table fuentes_mcp to authenticated;

create table acciones_mcp (
  feature_id text not null references features (id) on delete cascade,
  rpc text not null,
  descripcion text,
  primary key (feature_id, rpc)
);

comment on table acciones_mcp is
  'Qué RPC ya existente puede invocar el servidor MCP por funcionalidad ejecutable.';

alter table acciones_mcp enable row level security;

create policy acciones_mcp_solo_superadmin on acciones_mcp
  for all
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

grant select, insert, update, delete on table acciones_mcp to authenticated;

-- ============================================================================
-- Tablas: credenciales y conexiones
-- ============================================================================

create table credenciales_mcp (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones (id) on delete cascade,
  hash bytea not null unique,
  creada_por uuid not null references auth.users (id) on delete cascade,
  creada_en timestamptz not null default now(),
  revocada_en timestamptz
);

comment on table credenciales_mcp is
  'Credencial de conexión MCP: solo el hash (digest sha256) se persiste, el valor en texto plano se muestra una única vez al crearla (FR-005). revocada_en null = activa.';

alter table credenciales_mcp enable row level security;

create policy credenciales_mcp_solo_superadmin on credenciales_mcp
  for all
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

-- Sin GRANT a authenticated a propósito: la única forma de crear/revocar
-- una credencial es vía las RPCs public.generar_credencial_mcp /
-- public.revocar_credencial_mcp (US3, security definer) — nunca un
-- insert/select directo a esta tabla, ni para un superadmin.

create table conexiones_mcp (
  id uuid primary key default gen_random_uuid(),
  credencial_id uuid not null references credenciales_mcp (id) on delete cascade,
  conectado_en timestamptz not null default now()
);

comment on table conexiones_mcp is
  'Auditoría de cada conexión establecida al servidor MCP (FR-009).';

alter table conexiones_mcp enable row level security;

create policy conexiones_mcp_solo_superadmin on conexiones_mcp
  for all
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

-- ============================================================================
-- Funciones private (security definer, search_path = '')
-- ============================================================================

create or replace function private.puede_mcp_leer_funcionalidad(p_feature_id text, p_organizacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.organizaciones_features of
      where of.feature_id = 'mcp-servidor' and of.organizacion_id = p_organizacion_id
    )
    and exists (
      select 1 from public.organizaciones_features of
      where of.feature_id = p_feature_id and of.organizacion_id = p_organizacion_id
    )
    and exists (
      select 1 from public.capacidades_mcp cc
      where cc.feature_id = p_feature_id and cc.lectura
    );
$$;

comment on function private.puede_mcp_leer_funcionalidad(text, uuid) is
  'Contrato: specs/servidor-mcp-generico/data-model.md. Tres condiciones, no dos (hallazgo del coordinador, 2026-10-03): el servidor MCP en sí habilitado para la organización + la funcionalidad conectada habilitada para la organización + capacidad de lectura a nivel plataforma. Recibe organizacion_id explícito (sin sesión de panel que lo resuelva implícitamente, a diferencia de private.tiene_feature).';

create or replace function private.puede_mcp_ejecutar_funcionalidad(p_feature_id text, p_organizacion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.organizaciones_features of
      where of.feature_id = 'mcp-servidor' and of.organizacion_id = p_organizacion_id
    )
    and exists (
      select 1 from public.organizaciones_features of
      where of.feature_id = p_feature_id and of.organizacion_id = p_organizacion_id
    )
    and exists (
      select 1 from public.capacidades_mcp cc
      where cc.feature_id = p_feature_id and cc.ejecucion
    );
$$;

comment on function private.puede_mcp_ejecutar_funcionalidad(text, uuid) is
  'Mismo patrón que puede_mcp_leer_funcionalidad, para ejecución — FR-007, FR-013. El servidor MCP debe estar habilitado para la organización, no solo la funcionalidad conectada (si no, una organización que nunca activó MCP igual podía leer/ejecutar mientras solo la UI, no la base, lo filtraba).';

create or replace function private.validar_credencial_mcp(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organizacion_id from public.credenciales_mcp
  where hash = extensions.digest(p_token, 'sha256'::text)
    and revocada_en is null;
$$;

comment on function private.validar_credencial_mcp(text) is
  'Contrato: specs/servidor-mcp-generico/data-model.md. Devuelve organizacion_id si el token hashea a una credencial activa, null si no — única forma de resolver identidad desde el servidor MCP (FR-006, FR-012).';

create or replace function private.resolver_credencial_id_mcp(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.credenciales_mcp
  where hash = extensions.digest(p_token, 'sha256'::text)
    and revocada_en is null;
$$;

comment on function private.resolver_credencial_id_mcp(text) is
  'Mismo criterio que validar_credencial_mcp pero devuelve el id de la fila, no la organización — para auditoría en conexiones_mcp/ejecuciones_mcp (US1 T010, no duplica la lógica de hash en TypeScript).';

-- PostgREST no expone el schema private sin importar el rol — wrappers
-- públicos mismo patrón que public.puede_chat_leer_funcionalidad (spec
-- chat-ia-supabase) y public.tiene_feature_publica (spec 009), otorgados a
-- service_role (el proceso del servidor MCP, nunca el navegador). Estas
-- funciones deciden autenticación/autorización de un canal externo, no
-- datos de negocio con RLS propio.
create or replace function public.puede_mcp_leer_funcionalidad(p_feature_id text, p_organizacion_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.puede_mcp_leer_funcionalidad(p_feature_id, p_organizacion_id); $$;

create or replace function public.puede_mcp_ejecutar_funcionalidad(p_feature_id text, p_organizacion_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.puede_mcp_ejecutar_funcionalidad(p_feature_id, p_organizacion_id); $$;

create or replace function public.validar_credencial_mcp(p_token text)
returns uuid language sql stable security definer set search_path = ''
as $$ select private.validar_credencial_mcp(p_token); $$;

create or replace function public.resolver_credencial_id_mcp(p_token text)
returns uuid language sql stable security definer set search_path = ''
as $$ select private.resolver_credencial_id_mcp(p_token); $$;

revoke execute on function public.puede_mcp_leer_funcionalidad(text, uuid) from public, authenticated;
revoke execute on function public.puede_mcp_ejecutar_funcionalidad(text, uuid) from public, authenticated;
revoke execute on function public.validar_credencial_mcp(text) from public, authenticated;
revoke execute on function public.resolver_credencial_id_mcp(text) from public, authenticated;

grant execute on function public.puede_mcp_leer_funcionalidad(text, uuid) to service_role;
grant execute on function public.puede_mcp_ejecutar_funcionalidad(text, uuid) to service_role;
grant execute on function public.validar_credencial_mcp(text) to service_role;
grant execute on function public.resolver_credencial_id_mcp(text) to service_role;

-- Bug real encontrado probando con un cliente MCP real contra el stack de
-- desarrollo local (T029, no detectable por pgTAP ni por los tests de
-- Vitest con admin mockeado): el servidor corre como service_role y lee
-- fuentes_mcp/acciones_mcp con `.from(...)` directo (son catálogo, no
-- datos de negocio — no justifican una función security definer como
-- mcp_leer_fila), pero nunca se le otorgó GRANT a esas tablas, ni INSERT
-- en conexiones_mcp. El fallo era silencioso: herramientas.ts registraba
-- cero tools sin ningún error visible en el protocolo MCP (tools/list
-- devolvía "Method not found" porque el SDK no declara esa capacidad si
-- nunca se registró ninguna herramienta).
grant select on table fuentes_mcp to service_role;
grant select on table acciones_mcp to service_role;
grant insert on table conexiones_mcp to service_role;

-- ============================================================================
-- Registro de la funcionalidad en el panel (patrón descentralizado, spec 009)
-- ============================================================================

do $$
declare
  v_actor uuid;
begin
  select user_id into v_actor from public.superadmins order by user_id limit 1;

  if v_actor is null then
    raise notice 'No existe ningún superadmin todavía — Servidor MCP en Funcionalidades queda para que lo registre seed.sql (dev/CI) o un alta manual posterior (producción)';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_actor)::text, true);

  if not exists (select 1 from public.features where id = 'mcp-servidor') then
    perform public.registrar_feature(
      'mcp-servidor',
      'Servidor MCP',
      'Permite que un cliente externo de IA (Claude, ChatGPT, etc.) lea y/o ejecute acciones sobre las funcionalidades habilitadas de la organización, vía el protocolo MCP.'
    );
  end if;
end $$;
