-- Chat companion mechanism — gobernanza. RPCs para que un superadmin
-- ajuste capacidades_chat_ia desde la UI — upsert porque una
-- funcionalidad puede no tener fila todavía en capacidades_chat_ia
-- (fail-closed por defecto: sin fila, lectura/ejecución quedan en false).

create or replace function public.actualizar_capacidad_chat_lectura(p_feature_id text, p_lectura boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_superadmin()) then
    raise exception 'Solo un superadmin puede modificar capacidades del chat' using errcode = '42501';
  end if;

  insert into public.capacidades_chat_ia (feature_id, lectura, actualizado_por)
  values (p_feature_id, p_lectura, (select auth.uid()))
  on conflict (feature_id) do update
    set lectura = excluded.lectura, actualizado_por = excluded.actualizado_por, actualizado_en = now();
end;
$$;

comment on function public.actualizar_capacidad_chat_lectura(text, boolean) is
  'Solo superadmin (FR-009).';

revoke execute on function public.actualizar_capacidad_chat_lectura(text, boolean) from public;
grant execute on function public.actualizar_capacidad_chat_lectura(text, boolean) to authenticated;

create or replace function public.actualizar_capacidad_chat_ejecucion(p_feature_id text, p_ejecucion boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_superadmin()) then
    raise exception 'Solo un superadmin puede modificar capacidades del chat' using errcode = '42501';
  end if;

  insert into public.capacidades_chat_ia (feature_id, ejecucion, actualizado_por)
  values (p_feature_id, p_ejecucion, (select auth.uid()))
  on conflict (feature_id) do update
    set ejecucion = excluded.ejecucion, actualizado_por = excluded.actualizado_por, actualizado_en = now();
end;
$$;

comment on function public.actualizar_capacidad_chat_ejecucion(text, boolean) is
  'Mismo patrón que actualizar_capacidad_chat_lectura, para ejecución.';

revoke execute on function public.actualizar_capacidad_chat_ejecucion(text, boolean) from public;
grant execute on function public.actualizar_capacidad_chat_ejecucion(text, boolean) to authenticated;
