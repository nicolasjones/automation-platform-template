-- Mecanismo genérico de chat companion con acceso a funcionalidades
-- registradas (spec chat-companion-mechanism). Reversión: deshabilitar la
-- funcionalidad (borrar de organizaciones_features), después retirar
-- RLS/RPCs/tablas en orden inverso a como se crean acá.

-- ============================================================================
-- Tablas: capacidades de plataforma
-- ============================================================================

create table capacidades_chat_ia (
  feature_id text primary key references features (id) on delete cascade,
  lectura boolean not null default false,
  ejecucion boolean not null default false,
  actualizado_por uuid references auth.users (id) on delete set null,
  actualizado_en timestamptz not null default now()
);

comment on table capacidades_chat_ia is
  'Declaración a nivel plataforma (no por organización) de si el chat companion puede leer y/o ejecutar acciones sobre una funcionalidad conectable.';

alter table capacidades_chat_ia enable row level security;

create policy capacidades_chat_ia_solo_superadmin on capacidades_chat_ia
  for all
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

-- auto_expose_new_tables = false en este proyecto: RLS por sí sola no
-- alcanza, hace falta el GRANT explícito (mismo patrón que
-- 20260910130000_panel_de_funcionalidades.sql).
grant select, insert, update, delete on table capacidades_chat_ia to authenticated;

create table fuentes_chat_ia (
  feature_id text not null references features (id) on delete cascade,
  vista text not null,
  descripcion text,
  primary key (feature_id, vista)
);

comment on table fuentes_chat_ia is
  'Qué vista de solo lectura puede consultar el chat por funcionalidad conectable — cada funcionalidad la registra en su propia migración.';

alter table fuentes_chat_ia enable row level security;

-- Lectura abierta a cualquier authenticated (bug real, encontrado
-- probando en vivo en un producto derivado): el propio chat resuelve
-- "¿a qué funcionalidad pertenece esta vista?" corriendo como el usuario
-- normal (asUser, nunca service-role) — con solo-superadmin acá, ese
-- select devolvía cero filas por RLS y el chat nunca podía leer nada,
-- aunque todo lo demás (feature habilitada, capacidad de plataforma)
-- estuviera bien configurado. El contenido no es sensible (solo qué
-- vista mapea a qué feature); mutarlo sigue siendo solo-superadmin.
create policy fuentes_chat_ia_lectura_authenticated on fuentes_chat_ia
  for select
  using (true);

create policy fuentes_chat_ia_mutacion_superadmin on fuentes_chat_ia
  for insert
  with check ((select private.is_superadmin()));

create policy fuentes_chat_ia_actualizacion_superadmin on fuentes_chat_ia
  for update
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

create policy fuentes_chat_ia_borrado_superadmin on fuentes_chat_ia
  for delete
  using ((select private.is_superadmin()));

grant select, insert, update, delete on table fuentes_chat_ia to authenticated;

-- ============================================================================
-- Tablas: conversación
-- ============================================================================

create table conversaciones_chat_ia (
  id uuid primary key default gen_random_uuid(),
  -- default resuelve la organización activa del lado del servidor — la
  -- Edge Function nunca manda organizacion_id en el insert (bug real,
  -- encontrado probando en vivo: sin esto, el insert viola la RLS porque
  -- la columna queda null y nunca matchea private.organizacion_id()).
  organizacion_id uuid not null default private.organizacion_id() references organizaciones (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  creada_en timestamptz not null default now()
);

comment on table conversaciones_chat_ia is
  'Una sesión de chat de un usuario dentro de su organización activa.';

alter table conversaciones_chat_ia enable row level security;

create policy conversaciones_chat_ia_propia on conversaciones_chat_ia
  for all
  using (usuario_id = (select auth.uid()) and organizacion_id = (select private.organizacion_id()))
  with check (usuario_id = (select auth.uid()) and organizacion_id = (select private.organizacion_id()));

grant select, insert, update, delete on table conversaciones_chat_ia to authenticated;

create table mensajes_chat_ia (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones_chat_ia (id) on delete cascade,
  origen text not null check (origen in ('usuario', 'chat')),
  contenido text not null,
  estado text check (estado in ('mensaje', 'propuesta', 'confirmada', 'fallida')),
  creado_en timestamptz not null default now()
);

comment on table mensajes_chat_ia is
  'Un turno dentro de una conversación. estado solo aplica a mensajes del chat que proponen una acción ejecutable.';

alter table mensajes_chat_ia enable row level security;

create policy mensajes_chat_ia_propia on mensajes_chat_ia
  for all
  using (
    exists (
      select 1 from conversaciones_chat_ia c
      where c.id = mensajes_chat_ia.conversacion_id
        and c.usuario_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from conversaciones_chat_ia c
      where c.id = mensajes_chat_ia.conversacion_id
        and c.usuario_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on table mensajes_chat_ia to authenticated;

-- ============================================================================
-- Funciones private (security definer, search_path = '')
-- ============================================================================

create or replace function private.puede_chat_leer_funcionalidad(p_feature_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- 'chat-ia' en sí misma debe estar habilitada para la organización —
  -- sin esto, el gate de habilitación de la funcionalidad "chat" solo
  -- existía en la UI, no en la capa de datos.
  select (select private.tiene_feature('chat-ia'))
    and (select private.tiene_feature(p_feature_id))
    and exists (
      select 1 from public.capacidades_chat_ia cc
      where cc.feature_id = p_feature_id and cc.lectura
    );
$$;

comment on function private.puede_chat_leer_funcionalidad(text) is
  'Fail-closed en 3 capas: chat habilitado para la organización, la funcionalidad conectada habilitada, y la plataforma marcándola legible.';

-- PostgREST no expone el schema private (por diseño, no está en
-- db-schemas) — wrapper público mismo patrón que
-- public.tiene_feature_publica (spec panel de funcionalidades), para que
-- la Edge Function (vía asUser.rpc, sesión del propio usuario) pueda
-- invocarla.
create or replace function public.puede_chat_leer_funcionalidad(p_feature_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.puede_chat_leer_funcionalidad(p_feature_id);
$$;

comment on function public.puede_chat_leer_funcionalidad(text) is
  'Wrapper público de private.puede_chat_leer_funcionalidad.';

revoke execute on function public.puede_chat_leer_funcionalidad(text) from public;
grant execute on function public.puede_chat_leer_funcionalidad(text) to authenticated;

-- ============================================================================
-- Acceso a la credencial del proveedor de IA desde una Edge Function
-- ============================================================================
-- resolver_politica_ia/obtener_clave_perfil_ia (governed-ai-core) solo
-- estaban otorgadas a workers_orquestacion — el rol de los workers que
-- corren fuera de este Supabase (p. ej. en el VPS de cada cliente/
-- integración externa, junto a su propio fallback de navegación si lo
-- tienen). El chat companion es una funcionalidad centralizada, no un
-- worker de cliente: corre como Edge Function/proceso de backend con la
-- service-role key (nunca expuesta al navegador, mismo nivel de
-- confianza que cualquier otra Edge Function de este proyecto). Ninguna
-- llamada a estas dos funciones toca datos de organización — solo la
-- credencial propia del proveedor de IA, que no tiene aislamiento por
-- organización.
-- GRANT EXECUTE no alcanza solo: ambas funciones chequean
-- internamente pg_has_role(session_user, 'workers_orquestacion', 'member')
-- antes de hacer nada — sin ser miembro del rol, el GRANT de ejecución es
-- necesario pero no suficiente (bug real, encontrado probando en vivo
-- contra un stack de dev real con una credencial de proveedor real, no
-- detectado por pgTAP porque has_function_privilege solo prueba el ACL
-- de la función, no la condición interna del cuerpo). service_role ya
-- tiene confianza equivalente o mayor (bypassa RLS) — sumarlo como
-- miembro del rol es coherente con ese nivel de confianza existente, no
-- uno nuevo.
grant usage on schema private to service_role;
grant workers_orquestacion to service_role;
grant execute on function private.resolver_politica_ia(text) to service_role;
grant execute on function private.obtener_clave_perfil_ia(uuid) to service_role;

-- PostgREST solo expone funciones del schema public (nunca private, por
-- diseño): un service_role.rpc('resolver_politica_ia', ...) desde la Edge
-- Function via supabase-js pasa por PostgREST igual que cualquier RPC —
-- sin este wrapper, PostgREST devuelve 404 (PGRST202) aunque el GRANT
-- directo sobre la función private ya esté correcto (bug real, encontrado
-- probando en vivo: el error "política no encontrada" no era la
-- gobernanza fallando, era la función ni siquiera alcanzable por RPC).
create or replace function public.resolver_politica_ia(p_codigo text)
returns table (
  politica_id uuid,
  contrato_id uuid,
  perfil_principal_id uuid,
  perfil_fallback_id uuid,
  limite_intentos smallint,
  limite_segundos integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.resolver_politica_ia(p_codigo);
$$;

create or replace function public.obtener_clave_perfil_ia(p_perfil_id uuid)
returns table (proveedor_codigo text, adaptador text, modelo_id text, clave text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.obtener_clave_perfil_ia(p_perfil_id);
$$;

revoke execute on function public.resolver_politica_ia(text) from public, authenticated, anon;
revoke execute on function public.obtener_clave_perfil_ia(uuid) from public, authenticated, anon;
grant execute on function public.resolver_politica_ia(text) to service_role;
grant execute on function public.obtener_clave_perfil_ia(uuid) to service_role;

-- ============================================================================
-- Registro de la funcionalidad en el panel (patrón descentralizado)
-- ============================================================================
-- registrar_feature exige private.is_superadmin() (auth.uid() real); en una
-- migración no hay sesión, así que impersonamos al primer superadmin vía
-- set_config('request.jwt.claims', ..., true).

do $$
declare
  v_actor uuid;
begin
  select user_id into v_actor from public.superadmins order by user_id limit 1;

  if v_actor is null then
    raise notice 'No existe ningún superadmin todavía — Chat en Funcionalidades queda para que lo registre seed.sql (dev/CI) o un alta manual posterior (producción)';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_actor)::text, true);

  if not exists (select 1 from public.features where id = 'chat-ia') then
    perform public.registrar_feature(
      'chat-ia',
      'Chat',
      'Chat conversacional con acceso a datos de Supabase de la organización.'
    );
  end if;
end $$;
