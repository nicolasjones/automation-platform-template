-- Bug real (2026-10-08, producto estudio-contable-automation): dos
-- capacidades distintas de la misma conexión (p. ej. Colppy Libro Mayor e
-- IVA Compras de la misma cuenta) se disparan en paralelo sin bloquearse
-- entre sí -- iniciar_ejecucion_worker solo chequeaba YA_EN_CURSO por
-- (organizacion_id, capacidad_id), nunca por conexión. Reproducido en vivo:
-- al disparar las dos a la vez contra la cuenta real, una completó bien y la
-- otra fue rechazada por Colppy con credencial inválida en el login (la
-- sesión única del sistema externo no tolera un segundo login simultáneo).
--
-- private.conexion_en_curso ya existe (20261007180200_conexion_en_curso.sql)
-- pero solo la consulta despachador-programado.yml como pre-chequeo externo
-- antes de llamar a iniciar_ejecucion_worker -- no protege el disparo manual
-- ni un llamado directo con origen 'kestra'. Este cambio la mueve adentro de
-- iniciar_ejecucion_worker (único punto de entrada real, FR original de
-- disparo-programado-ciclo-ejecuciones: "sin importar si el disparo es
-- manual, programado, o en lote"), para que los 3 orígenes queden protegidos
-- por igual sin tocar cada flow de producto.
create or replace function public.iniciar_ejecucion_worker(
  p_conexion_id uuid,
  p_clave_capacidad text,
  p_origen text,
  p_actor uuid default null,
  p_detalle jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conexion public.conexiones;
  v_capacidad public.capacidades_ejecucion;
  v_nueva_id uuid;
  v_jwt_role text;
begin
  if p_origen not in ('manual', 'programada', 'kestra') then
    raise exception 'ORIGEN_INVALIDO: % no es manual, programada ni kestra', p_origen using errcode = 'P0001';
  end if;
  if p_origen = 'manual' and p_actor is null then
    raise exception 'ACTOR_REQUERIDO: un disparo manual debe registrar quién lo inició' using errcode = 'P0001';
  end if;

  select * into v_conexion from public.conexiones c where c.id = p_conexion_id;
  if not found then
    raise exception 'CONEXION_DESCONOCIDA: %', p_conexion_id using errcode = 'P0001';
  end if;
  select * into v_capacidad from public.capacidades_ejecucion cap
  where cap.conexion_id = p_conexion_id and cap.clave = p_clave_capacidad;
  if not found or not v_capacidad.habilitada then
    raise exception 'CAPACIDAD_NO_HABILITADA: % no está registrada y habilitada para la conexión %', p_clave_capacidad, p_conexion_id using errcode = 'P0001';
  end if;

  -- FR-013: error no bloquea. credencial_invalida solo admite el disparo
  -- manual de una sesión authenticated (autorizar_llamante_ciclo exige que
  -- sea administradora); un worker o Kestra no pueden forzarlo.
  if v_conexion.estado = 'credencial_invalida' then
    begin
      v_jwt_role := (nullif(current_setting('request.jwt.claims', true), '')::json->>'role');
    exception when others then
      v_jwt_role := null;
    end;
    if p_origen <> 'manual' or v_jwt_role is distinct from 'authenticated' then
      raise exception 'CONEXION_CREDENCIAL_INVALIDA: la conexión % tiene la credencial rechazada; actualizala o iniciá la ejecución manualmente', p_conexion_id using errcode = 'P0001';
    end if;
  end if;

  perform private.autorizar_llamante_ciclo(v_conexion.organizacion_id);
  update public.ejecuciones_worker e
  set estado = 'timeout', finalizada_en = clock_timestamp(),
      motivo_sanitizado = 'TIMEOUT:' || v_capacidad.tiempo_max_seg || 's'
  where e.organizacion_id = v_conexion.organizacion_id
    and e.capacidad_id = v_capacidad.id
    and e.estado = 'en_curso'
    and e.iniciada_en < clock_timestamp() - make_interval(secs => v_capacidad.tiempo_max_seg);
  if exists (
    select 1 from public.ejecuciones_worker e
    where e.organizacion_id = v_conexion.organizacion_id
      and e.capacidad_id = v_capacidad.id and e.estado = 'en_curso'
  ) then
    raise exception 'YA_EN_CURSO: ya hay una ejecución activa para esta organización y capacidad' using errcode = 'P0001';
  end if;
  -- Limpia también el timeout de cualquier OTRA capacidad de la misma
  -- conexión antes de evaluar conexion_en_curso: sin esto, una ejecución
  -- colgada de otra capacidad bloquearía esta conexión para siempre.
  update public.ejecuciones_worker e
  set estado = 'timeout', finalizada_en = clock_timestamp(),
      motivo_sanitizado = 'TIMEOUT:' || c2.tiempo_max_seg || 's'
  from public.capacidades_ejecucion c2
  where e.capacidad_id = c2.id
    and e.conexion_id = p_conexion_id
    and e.estado = 'en_curso'
    and e.iniciada_en < clock_timestamp() - make_interval(secs => c2.tiempo_max_seg);
  if private.conexion_en_curso(p_conexion_id) then
    raise exception 'CONEXION_EN_CURSO: ya hay una ejecución activa para otra capacidad de esta conexión' using errcode = 'P0001';
  end if;

  insert into public.ejecuciones_worker (organizacion_id, conexion_id, capacidad_id, origen, actor, detalle)
  values (v_conexion.organizacion_id, p_conexion_id, v_capacidad.id, p_origen,
    case when p_origen = 'manual' then p_actor else null end,
    coalesce(p_detalle, '{}'::jsonb))
  returning id into v_nueva_id;

  if p_origen in ('manual', 'programada') then
    insert into public.despachos_ejecucion (ejecucion_id, organizacion_id)
    values (v_nueva_id, v_conexion.organizacion_id);
  end if;

  return v_nueva_id;
end;
$$;

comment on function public.iniciar_ejecucion_worker(uuid, text, text, uuid, jsonb) is
  'Contrato: specs/019-outbox-ejecuciones/contracts/despacho-outbox.md y specs/20261007-171745-disparo-programado-ciclo-ejecuciones/contracts/rpc.md. El inicio manual y el programado persisten ejecución y orden de despacho en la misma transacción; no realizan HTTP ni llaman a Kestra. Origen kestra no genera una orden para evitar recursión de despacho (el flow que lo llama ya va a ejecutar el trabajo en la misma corrida). FR-013 (bug conexion-invalida-trabada): una conexión en error no bloquea; en credencial_invalida solo se acepta el disparo manual de un administrador autenticado (CONEXION_CREDENCIAL_INVALIDA en otro caso). CONEXION_EN_CURSO (bug real 2026-10-08): generaliza el bloqueo de "ya en curso" de una sola capacidad a toda la conexión -- dos capacidades distintas del mismo sistema externo (misma sesión real) no pueden correr en paralelo, sin importar el origen.';

-- El pre-chequeo de despachador-programado.yml (conexion_en_curso antes de
-- llamar a iniciar_ejecucion_worker) sigue existiendo: evita generar una
-- fila en despachos_ejecucion que de todos modos se iba a rechazar, y es
-- más barato que esperar el error. No es redundante con este cambio, es
-- defensa en profundidad (el chequeo de acá adentro es el que de verdad
-- garantiza la exclusión, el de afuera es una optimización).
