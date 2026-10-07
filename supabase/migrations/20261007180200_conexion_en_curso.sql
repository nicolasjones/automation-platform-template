-- Concurrencia por conexión (spec disparo-programado-ciclo-ejecuciones,
-- FR-005/FR-006): generaliza private.estado_ejecucion_vigente (vigencia
-- con timeout de una ejecución puntual) a "¿hay alguna ejecución vigente
-- de cualquier capacidad de esta conexión?" -- una organización puede
-- tener más de una conexión al mismo sistema externo (comentario de
-- public.conexiones, spec 013); cada conexión es una sesión/credencial
-- independiente, así que la restricción de "nunca 2 a la vez" es por
-- conexión, no por capacidad ni por sistema_externo.
--
-- Migración aditiva: crea una sola función; no toca tablas ni datos.
-- Reversión:
--   revoke execute on function private.conexion_en_curso(uuid) from kestra_orquestacion;
--   drop function private.conexion_en_curso(uuid);

create or replace function private.conexion_en_curso(p_conexion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ejecuciones_worker e
    join public.capacidades_ejecucion c on c.id = e.capacidad_id
    where e.conexion_id = p_conexion_id
      and e.estado = 'en_curso'
      and e.iniciada_en >= clock_timestamp() - make_interval(secs => c.tiempo_max_seg)
  );
$$;

comment on function private.conexion_en_curso(uuid) is
  'Spec disparo-programado-ciclo-ejecuciones (FR-005/FR-006). Generaliza estado_ejecucion_vigente de una ejecución puntual a toda la conexión: true si cualquiera de sus capacidades tiene una ejecución en_curso vigente (dentro de tiempo_max_seg). El despachador-programado la consulta antes de llamar a iniciar_ejecucion_worker para no disparar dos capacidades de la misma conexión a la vez. Sin grants a authenticated/anon -- solo kestra_orquestacion y, si un producto derivado lo necesita para su propia UI, una función pública delgada que agregue la verificación de organización.';

revoke execute on function private.conexion_en_curso(uuid) from public, anon, authenticated;
grant execute on function private.conexion_en_curso(uuid) to kestra_orquestacion;
