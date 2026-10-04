-- Chat companion mechanism — ejecución de acciones. Aditiva sobre
-- 20261005000000_chat_companion_mechanism.sql. Reversión: deshabilitar
-- ejecutar_accion_chat_ia primero (revoke), después retirar en orden
-- inverso.

-- Qué proponía un mensaje del chat en estado 'propuesta' — sin esto,
-- private.ejecutar_accion_chat_ia no tiene de dónde sacar qué ejecutar.
-- Nullable: solo los mensajes que proponen una acción las usan.
alter table mensajes_chat_ia
  add column accion_feature_id text references features (id) on delete set null,
  add column accion_rpc text,
  add column accion_parametros jsonb not null default '{}'::jsonb;

comment on column mensajes_chat_ia.accion_feature_id is
  'Funcionalidad de la acción propuesta (solo en mensajes estado=propuesta/confirmada/fallida que proponen ejecución).';

-- ============================================================================
-- Tablas
-- ============================================================================

create table acciones_chat_ia (
  feature_id text not null references features (id) on delete cascade,
  rpc text not null,
  descripcion text,
  primary key (feature_id, rpc)
);

comment on table acciones_chat_ia is
  'Qué RPC ya existente debe invocar el chat por funcionalidad ejecutable (research.md R4) — la misma que ya usa la UI normal para esa acción.';

alter table acciones_chat_ia enable row level security;

-- Mismo bug y mismo fix que fuentes_chat_ia (spec chat-ia-supabase,
-- research.md): proponerEjecucion corre como el usuario normal, no como
-- superadmin — lectura abierta, mutación restringida.
create policy acciones_chat_ia_lectura_authenticated on acciones_chat_ia
  for select
  using (true);

create policy acciones_chat_ia_mutacion_superadmin on acciones_chat_ia
  for insert
  with check ((select private.is_superadmin()));

create policy acciones_chat_ia_actualizacion_superadmin on acciones_chat_ia
  for update
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

create policy acciones_chat_ia_borrado_superadmin on acciones_chat_ia
  for delete
  using ((select private.is_superadmin()));

grant select, insert, update, delete on table acciones_chat_ia to authenticated;

create table ejecuciones_chat_ia (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references mensajes_chat_ia (id) on delete cascade,
  feature_id text not null references features (id) on delete restrict,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  estado text not null check (estado in ('en_curso', 'completada', 'fallida')),
  motivo_error text,
  iniciada_en timestamptz not null default now(),
  finalizada_en timestamptz
);

comment on table ejecuciones_chat_ia is
  'Auditoría de cada ejecución (FR-007, FR-016). Índice único parcial evita dos ejecuciones concurrentes sobre el mismo mensaje (R7, FR-014).';

create unique index ejecuciones_chat_ia_en_curso_idx on ejecuciones_chat_ia (mensaje_id) where estado = 'en_curso';

alter table ejecuciones_chat_ia enable row level security;

create policy ejecuciones_chat_ia_propia on ejecuciones_chat_ia
  for select
  using (
    exists (
      select 1 from mensajes_chat_ia m
      join conversaciones_chat_ia c on c.id = m.conversacion_id
      where m.id = ejecuciones_chat_ia.mensaje_id
        and c.usuario_id = (select auth.uid())
    )
  );

comment on policy ejecuciones_chat_ia_propia on ejecuciones_chat_ia is
  'Solo lectura directa para el dueño de la conversación — toda escritura pasa por private.ejecutar_accion_chat_ia (security definer), nunca un insert/update directo desde el cliente.';

grant select on table ejecuciones_chat_ia to authenticated;

-- ============================================================================
-- Funciones private
-- ============================================================================

create or replace function private.puede_chat_ejecutar_funcionalidad(p_feature_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Mismo fix que puede_chat_leer_funcionalidad: 'chat-ia' en sí misma
  -- debe estar habilitada para la organización, no solo la funcionalidad
  -- conectada.
  select (select private.tiene_feature('chat-ia'))
    and (select private.tiene_feature(p_feature_id))
    and exists (
      select 1 from public.capacidades_chat_ia cc
      where cc.feature_id = p_feature_id and cc.ejecucion
    );
$$;

comment on function private.puede_chat_ejecutar_funcionalidad(text) is
  'Mismo patrón que puede_chat_leer_funcionalidad, para ejecución — FR-005, FR-013. No incluye private.puede_escribir(): eso se revalida aparte en ejecutar_accion_chat_ia, dentro de la misma transacción que ejecuta.';

create or replace function public.puede_chat_ejecutar_funcionalidad(p_feature_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.puede_chat_ejecutar_funcionalidad(p_feature_id);
$$;

revoke execute on function public.puede_chat_ejecutar_funcionalidad(text) from public;
grant execute on function public.puede_chat_ejecutar_funcionalidad(text) to authenticated;

-- Ejecuta la acción propuesta por un mensaje, con revalidación atómica
-- (FR-013, TOCTOU) y protección contra doble ejecución concurrente
-- (FR-014, vía el índice único parcial de ejecuciones_chat_ia). Corre
-- como el usuario que confirma (auth.uid() real, nunca service-role) —
-- la RPC de negocio que invoca se ejecuta con los mismos privilegios/RLS
-- que si el usuario la llamara directo.
create or replace function private.ejecutar_accion_chat_ia(p_mensaje_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mensaje record;
  v_puede_ejecutar boolean;
  v_puede_escribir boolean;
  v_ejecucion_id uuid;
  v_llamada text;
  v_args text;
  v_resultado jsonb;
begin
  select m.id, m.conversacion_id, m.estado, m.accion_feature_id, m.accion_rpc, m.accion_parametros
    into v_mensaje
  from public.mensajes_chat_ia m
  join public.conversaciones_chat_ia c on c.id = m.conversacion_id
  where m.id = p_mensaje_id
    and c.usuario_id = (select auth.uid())
  for update of m;

  if v_mensaje.id is null then
    raise exception 'MENSAJE_NO_ENCONTRADO' using errcode = '42501';
  end if;

  if v_mensaje.estado <> 'propuesta' then
    raise exception 'MENSAJE_NO_ES_PROPUESTA' using errcode = '22023';
  end if;

  -- Revalidación TOCTOU (FR-013): la capacidad pudo cambiar entre que se
  -- ofreció la acción y que el usuario confirmó.
  v_puede_ejecutar := private.puede_chat_ejecutar_funcionalidad(v_mensaje.accion_feature_id);
  v_puede_escribir := private.puede_escribir();

  if not v_puede_ejecutar or not v_puede_escribir then
    update public.mensajes_chat_ia set estado = 'fallida' where id = p_mensaje_id;
    return jsonb_build_object('estado', 'fallida', 'motivo', 'capacidad revocada');
  end if;

  -- Índice único parcial: si ya hay una ejecución en_curso para este
  -- mensaje, esta inserción falla con 23505 — se trata como "ya en
  -- curso", no como error (R7, FR-014).
  begin
    insert into public.ejecuciones_chat_ia (mensaje_id, feature_id, usuario_id, estado)
    values (p_mensaje_id, v_mensaje.accion_feature_id, (select auth.uid()), 'en_curso')
    returning id into v_ejecucion_id;
  exception when unique_violation then
    return jsonb_build_object('estado', 'en_curso', 'motivo', 'ya hay una ejecución en curso para este mensaje');
  end;

  -- Invocación dinámica de la RPC registrada, con notación de argumentos
  -- con nombre (%I := %L) — rpc viene de acciones_chat_ia, curada por un
  -- superadmin, nunca de entrada directa del usuario.
  select string_agg(format('%I := %L', key, value), ', ')
    into v_args
  from jsonb_each_text(v_mensaje.accion_parametros);

  v_llamada := format('select to_jsonb(r) from public.%I(%s) r', v_mensaje.accion_rpc, coalesce(v_args, ''));

  begin
    execute v_llamada into v_resultado;

    update public.ejecuciones_chat_ia
      set estado = 'completada', finalizada_en = now()
      where id = v_ejecucion_id;
    update public.mensajes_chat_ia set estado = 'confirmada' where id = p_mensaje_id;

    return jsonb_build_object('estado', 'completada', 'resultado', v_resultado);
  exception when others then
    update public.ejecuciones_chat_ia
      set estado = 'fallida', motivo_error = sqlerrm, finalizada_en = now()
      where id = v_ejecucion_id;
    update public.mensajes_chat_ia set estado = 'fallida' where id = p_mensaje_id;

    return jsonb_build_object('estado', 'fallida', 'motivo', sqlerrm);
  end;
end;
$$;

comment on function private.ejecutar_accion_chat_ia(uuid) is
  'Revalida capacidad + rol dentro de la transacción, evita doble ejecución, nunca deja una ejecución fallida sin auditar (FR-005, FR-013, FR-014, FR-016).';

create or replace function public.ejecutar_accion_chat_ia(p_mensaje_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.ejecutar_accion_chat_ia(p_mensaje_id);
$$;

revoke execute on function public.ejecutar_accion_chat_ia(uuid) from public;
grant execute on function public.ejecutar_accion_chat_ia(uuid) to authenticated;
