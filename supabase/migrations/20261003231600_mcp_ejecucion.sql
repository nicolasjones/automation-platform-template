-- US2 de Servidor MCP: ejecución de acciones. Reversión: retirar las
-- funciones, el índice y la tabla en orden inverso.

create table ejecuciones_mcp (
  id uuid primary key default gen_random_uuid(),
  credencial_id uuid not null references credenciales_mcp (id) on delete cascade,
  feature_id text not null references features (id) on delete cascade,
  estado text not null check (estado in ('en_curso', 'completada', 'fallida')),
  motivo_error text,
  iniciada_en timestamptz not null default now(),
  finalizada_en timestamptz
);

comment on table ejecuciones_mcp is
  'Auditoría de cada ejecución de acción vía MCP (FR-008, FR-016). Índice único parcial evita doble ejecución concurrente de la misma acción con la misma credencial (FR-014, edge case de la spec).';

create unique index ejecuciones_mcp_en_curso_idx on ejecuciones_mcp (credencial_id, feature_id) where estado = 'en_curso';

alter table ejecuciones_mcp enable row level security;

create policy ejecuciones_mcp_solo_superadmin on ejecuciones_mcp
  for all
  using ((select private.is_superadmin()))
  with check ((select private.is_superadmin()));

-- ============================================================================
-- Iniciar / finalizar ejecución — en dos pasos, no uno solo
-- ============================================================================
-- Cada funcionalidad registra en acciones_mcp su propia RPC ya existente,
-- con su propia firma tipada (no un jsonb genérico) — "la misma que ya usa
-- la UI normal" (research.md R4), así que esta función NO puede invocarla
-- por SQL dinámico sin asumir una firma uniforme que no existe. iniciar_*
-- revalida la capacidad y pone el candado de concurrencia en una sola
-- transacción (TOCTOU, FR-013); el servidor MCP (TypeScript) invoca la RPC
-- real vía supabase-js (que resuelve los parámetros nombrados contra la
-- firma real, igual que PostgREST) y llama a finalizar_* con el resultado.

create or replace function private.iniciar_ejecucion_mcp(p_credencial_id uuid, p_feature_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
  v_ejecucion_id uuid;
begin
  select organizacion_id into v_organizacion_id
  from public.credenciales_mcp
  where id = p_credencial_id and revocada_en is null;

  if v_organizacion_id is null then
    raise exception 'Credencial inválida o revocada' using errcode = '42501';
  end if;

  if not private.puede_mcp_ejecutar_funcionalidad(p_feature_id, v_organizacion_id) then
    raise exception 'Funcionalidad no ejecutable para esta organización' using errcode = '42501';
  end if;

  -- El índice único parcial rechaza acá mismo (23505) una segunda ejecución
  -- concurrente de la misma acción con la misma credencial (FR-014).
  insert into public.ejecuciones_mcp (credencial_id, feature_id, estado)
  values (p_credencial_id, p_feature_id, 'en_curso')
  returning id into v_ejecucion_id;

  return v_ejecucion_id;
end;
$$;

comment on function private.iniciar_ejecucion_mcp(uuid, text) is
  'Contrato: specs/servidor-mcp-generico/contracts/protocolo-mcp.md. Revalida la capacidad dentro de la transacción (FR-013) y pone el candado de concurrencia — el servidor MCP invoca la RPC real recién después de que esto devuelve un id.';

create or replace function private.finalizar_ejecucion_mcp(p_ejecucion_id uuid, p_estado text, p_motivo_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ejecuciones_mcp
  set estado = p_estado, motivo_error = p_motivo_error, finalizada_en = clock_timestamp()
  where id = p_ejecucion_id and estado = 'en_curso';
$$;

comment on function private.finalizar_ejecucion_mcp(uuid, text, text) is
  'Cierra una ejecución en_curso como completada o fallida (FR-016) — el where estado=''en_curso'' evita que una llamada repetida pise un estado ya cerrado.';

create or replace function public.iniciar_ejecucion_mcp(p_credencial_id uuid, p_feature_id text)
returns uuid language sql security definer set search_path = ''
as $$ select private.iniciar_ejecucion_mcp(p_credencial_id, p_feature_id); $$;

create or replace function public.finalizar_ejecucion_mcp(p_ejecucion_id uuid, p_estado text, p_motivo_error text default null)
returns void language sql security definer set search_path = ''
as $$ select private.finalizar_ejecucion_mcp(p_ejecucion_id, p_estado, p_motivo_error); $$;

revoke execute on function public.iniciar_ejecucion_mcp(uuid, text) from public, authenticated;
revoke execute on function public.finalizar_ejecucion_mcp(uuid, text, text) from public, authenticated;
grant execute on function public.iniciar_ejecucion_mcp(uuid, text) to service_role;
grant execute on function public.finalizar_ejecucion_mcp(uuid, text, text) to service_role;
