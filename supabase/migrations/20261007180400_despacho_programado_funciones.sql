-- Funciones que consume el flow despachador-programado.yml (spec
-- disparo-programado-ciclo-ejecuciones, FR-002/FR-007). Kestra no recibe
-- SELECT/UPDATE directo sobre programacion_ejecucion -- mismo criterio que
-- private.organizaciones_activas_para_conector para capacidades_ejecucion
-- en plantilla-generico.yml.
--
-- Migración aditiva: crea dos funciones; no toca tablas ni datos.
-- Reversión:
--   revoke execute on function private.marcar_programacion_disparada(uuid) from kestra_orquestacion;
--   drop function private.marcar_programacion_disparada(uuid);
--   revoke execute on function private.capacidades_programadas_debidas() from kestra_orquestacion;
--   drop function private.capacidades_programadas_debidas();

create or replace function private.capacidades_programadas_debidas()
returns table (capacidad_id uuid, conexion_id uuid, clave text)
language sql
stable
security definer
set search_path = ''
as $$
  -- "Debida ahora": frecuencia aplica hoy, ya pasó la hora configurada, no
  -- vencida (hasta), no empezó a futuro (desde), y no se disparó ya hoy
  -- (ultima_disparada_en, FR-002 -- evita doble disparo si el despachador
  -- corre varias veces por día). Filtra capacidad habilitada y conexión
  -- activa -- no porque iniciar_ejecucion_worker no lo vuelva a chequear
  -- (lo hace), sino para no reintentar la misma capacidad deshabilitada o
  -- con credencial inválida en cada ciclo del Schedule sin nunca poder
  -- marcarla disparada (quedaría "debida" para siempre, generando ruido).
  select p.capacidad_id, c.conexion_id, c.clave
  from public.programacion_ejecucion p
  join public.capacidades_ejecucion c on c.id = p.capacidad_id
  join public.conexiones cx on cx.id = c.conexion_id
  where c.habilitada
    and cx.estado = 'activa'
    and p.desde <= current_date
    and (p.hasta is null or p.hasta >= current_date)
    and (p.ultima_disparada_en is null or p.ultima_disparada_en::date < current_date)
    and clock_timestamp()::time >= p.hora
    and (
      p.frecuencia = 'diaria'
      or (p.frecuencia = 'semanal' and p.dia_semana = extract(dow from current_date)::smallint)
      or (p.frecuencia = 'mensual' and p.dia_mes = extract(day from current_date)::smallint)
    );
$$;

comment on function private.capacidades_programadas_debidas() is
  'Spec disparo-programado-ciclo-ejecuciones (FR-002, FR-007). Capacidades con una programación vencida/debida ahora, sin importar el sistema (sin ninguna condición específica -- FR-007). El despachador la consulta, verifica private.conexion_en_curso por cada fila, y llama a iniciar_ejecucion_worker(conexion_id, clave, ''programada'') solo si no está bloqueada.';

revoke execute on function private.capacidades_programadas_debidas() from public, anon, authenticated;
grant execute on function private.capacidades_programadas_debidas() to kestra_orquestacion;

create or replace function private.marcar_programacion_disparada(p_capacidad_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.programacion_ejecucion
  set ultima_disparada_en = clock_timestamp(), updated_at = clock_timestamp()
  where capacidad_id = p_capacidad_id;
$$;

comment on function private.marcar_programacion_disparada(uuid) is
  'Spec disparo-programado-ciclo-ejecuciones (FR-002). El despachador la llama inmediatamente después de un iniciar_ejecucion_worker exitoso con origen=programada, para que capacidades_programadas_debidas() no la vuelva a traer el mismo día.';

revoke execute on function private.marcar_programacion_disparada(uuid) from public, anon, authenticated;
grant execute on function private.marcar_programacion_disparada(uuid) to kestra_orquestacion;
