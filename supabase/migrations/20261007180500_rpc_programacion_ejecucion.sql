-- RPCs de programación de capacidades de ejecución (spec
-- disparo-programado-ciclo-ejecuciones, contracts/rpc.md, FR-001/FR-004/
-- FR-010). Único camino de escritura sobre programacion_ejecucion -- la
-- tabla no tiene policies de insert/update/delete (ver
-- 20261007180000_programacion_ejecucion.sql).
--
-- Migración aditiva. Reversión:
--   revoke execute on function public.listar_programaciones_de_organizacion() from authenticated;
--   drop function public.listar_programaciones_de_organizacion();
--   revoke execute on function public.quitar_programacion_capacidad(uuid) from authenticated;
--   drop function public.quitar_programacion_capacidad(uuid);
--   revoke execute on function public.programar_capacidad_ejecucion(uuid, text, smallint, smallint, time, date, date) from authenticated;
--   drop function public.programar_capacidad_ejecucion(uuid, text, smallint, smallint, time, date, date);

create or replace function public.programar_capacidad_ejecucion(
  p_capacidad_id uuid,
  p_frecuencia text,
  p_dia_semana smallint default null,
  p_dia_mes smallint default null,
  p_hora time,
  p_desde date,
  p_hasta date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacidad public.capacidades_ejecucion;
  v_id uuid;
begin
  select * into v_capacidad from public.capacidades_ejecucion where id = p_capacidad_id;
  if not found then
    raise exception 'CAPACIDAD_DESCONOCIDA: %', p_capacidad_id using errcode = 'P0001';
  end if;

  if not (select private.es_administrador_de(v_capacidad.organizacion_id)) then
    raise exception 'NO_AUTORIZADO: se requiere ser administrador de la organización' using errcode = 'P0001';
  end if;

  insert into public.programacion_ejecucion (
    organizacion_id, capacidad_id, frecuencia, dia_semana, dia_mes, hora, desde, hasta, created_by, updated_by
  ) values (
    v_capacidad.organizacion_id, p_capacidad_id, p_frecuencia, p_dia_semana, p_dia_mes, p_hora, p_desde, p_hasta,
    auth.uid(), auth.uid()
  )
  on conflict (capacidad_id) do update set
    frecuencia = excluded.frecuencia,
    dia_semana = excluded.dia_semana,
    dia_mes = excluded.dia_mes,
    hora = excluded.hora,
    desde = excluded.desde,
    hasta = excluded.hasta,
    -- Editar una programación existente la reactiva: vuelve a poder
    -- dispararse hoy mismo si corresponde (FR-004, no queda "vencida" por
    -- un disparo de una configuración anterior).
    ultima_disparada_en = null,
    updated_by = auth.uid(),
    updated_at = clock_timestamp()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.programar_capacidad_ejecucion(uuid, text, smallint, smallint, time, date, date) is
  'Contrato: specs/20261007-171745-disparo-programado-ciclo-ejecuciones/contracts/rpc.md. Upsert por capacidad_id (a lo sumo una programación activa, FR-001); exige administrador de la organización dueña de la capacidad.';

revoke execute on function public.programar_capacidad_ejecucion(uuid, text, smallint, smallint, time, date, date) from public;
grant execute on function public.programar_capacidad_ejecucion(uuid, text, smallint, smallint, time, date, date) to authenticated;

create or replace function public.quitar_programacion_capacidad(p_capacidad_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
begin
  select organizacion_id into v_organizacion_id
  from public.capacidades_ejecucion where id = p_capacidad_id;

  if v_organizacion_id is null then
    raise exception 'CAPACIDAD_DESCONOCIDA: %', p_capacidad_id using errcode = 'P0001';
  end if;

  if not (select private.es_administrador_de(v_organizacion_id)) then
    raise exception 'NO_AUTORIZADO: se requiere ser administrador de la organización' using errcode = 'P0001';
  end if;

  delete from public.programacion_ejecucion where capacidad_id = p_capacidad_id;
end;
$$;

comment on function public.quitar_programacion_capacidad(uuid) is
  'Contrato: specs/20261007-171745-disparo-programado-ciclo-ejecuciones/contracts/rpc.md. Borra la programación de una capacidad si existe (no falla si no había ninguna); exige administrador de la organización dueña.';

revoke execute on function public.quitar_programacion_capacidad(uuid) from public;
grant execute on function public.quitar_programacion_capacidad(uuid) to authenticated;

create or replace function public.listar_programaciones_de_organizacion()
returns table (
  capacidad_id uuid,
  clave text,
  frecuencia text,
  dia_semana smallint,
  dia_mes smallint,
  hora time,
  desde date,
  hasta date,
  vencida boolean,
  ultima_disparada_en timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.capacidad_id, c.clave, p.frecuencia, p.dia_semana, p.dia_mes, p.hora, p.desde, p.hasta,
    (p.hasta is not null and p.hasta < current_date) as vencida,
    p.ultima_disparada_en
  from public.programacion_ejecucion p
  join public.capacidades_ejecucion c on c.id = p.capacidad_id
  where p.organizacion_id = private.organizacion_id();
$$;

comment on function public.listar_programaciones_de_organizacion() is
  'Contrato: specs/20261007-171745-disparo-programado-ciclo-ejecuciones/contracts/rpc.md. Programaciones de la organización activa, con "vencida" calculada de solo lectura (FR-004) -- nunca se borra sola, un administrador decide si la quita o la reprograma.';

revoke execute on function public.listar_programaciones_de_organizacion() from public;
grant execute on function public.listar_programaciones_de_organizacion() to authenticated;
