-- Corrige una inconsistencia real entre packages/ia (TypeScript) y la base:
-- la spec aprobacion-humana-ia agregó 'esperando_aprobacion' a EstadoInteraccion,
-- pero nunca llegó al check constraint de ia_interacciones.estado ni a la
-- tabla de transiciones de registrar_evento_interaccion_ia. Sin este fix,
-- ninguna interacción podría llegar nunca a ese estado en la base. Aditivo:
-- ninguna transición existente cambia.

do $$
declare v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where nsp.nspname = 'public' and rel.relname = 'ia_interacciones' and con.contype = 'c'
    and att.attname = 'estado';
  if v_constraint_name is not null then
    execute format('alter table public.ia_interacciones drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.ia_interacciones add constraint ia_interacciones_estado_check
  check (estado in ('iniciada','preparando','invocando','respuesta_validada','esperando_aprobacion','completada','rechazada','fallida_tecnica','revision_humana','cancelada'));

create or replace function private.registrar_evento_interaccion_ia(
  p_interaccion_id uuid,
  p_estado text,
  p_detalle_sanitizado jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actual text; v_secuencia integer;
begin
  if not pg_catalog.pg_has_role(session_user, 'workers_orquestacion', 'member') and not private.is_superadmin() then raise exception 'Runtime no autorizado para IA' using errcode = '42501'; end if;
  if jsonb_typeof(p_detalle_sanitizado) <> 'object' then raise exception 'Detalle IA inválido' using errcode = '22023'; end if;
  select estado into v_actual from public.ia_interacciones where id = p_interaccion_id for update;
  if v_actual is null then raise exception 'Interacción IA inexistente' using errcode = '22023'; end if;
  -- Resolver una revisión humana o una aprobación pendiente es, por diseño,
  -- una decisión de superadmin exclusivamente vía resolver_revision_ia — el
  -- rol workers_orquestacion puede llamar esta función para el resto del
  -- ciclo de vida, pero no para saltearse esa aprobación.
  if v_actual in ('revision_humana', 'esperando_aprobacion') and p_estado in ('completada', 'rechazada', 'cancelada') and not private.is_superadmin() then
    raise exception 'Solo el superadmin puede resolver una revisión o aprobación pendiente' using errcode = '42501';
  end if;
  if not ((v_actual = 'iniciada' and p_estado in ('preparando','rechazada','cancelada')) or (v_actual = 'preparando' and p_estado in ('invocando','rechazada','cancelada')) or (v_actual = 'invocando' and p_estado in ('respuesta_validada','fallida_tecnica','revision_humana','rechazada')) or (v_actual = 'respuesta_validada' and p_estado in ('completada','rechazada','revision_humana','esperando_aprobacion')) or (v_actual = 'revision_humana' and p_estado in ('completada','rechazada','cancelada')) or (v_actual = 'esperando_aprobacion' and p_estado in ('completada','rechazada','cancelada'))) then raise exception 'Transición IA inválida' using errcode = '22023'; end if;
  select coalesce(max(secuencia), 0) + 1 into v_secuencia from public.ia_eventos_interaccion where interaccion_id = p_interaccion_id;
  insert into public.ia_eventos_interaccion (interaccion_id, secuencia, tipo, detalle_sanitizado) values (p_interaccion_id, v_secuencia, p_estado, p_detalle_sanitizado);
  update public.ia_interacciones set estado = p_estado, finalizada_en = case when p_estado in ('completada','rechazada','fallida_tecnica','cancelada') then clock_timestamp() else finalizada_en end, error_sanitizado = case when p_estado in ('rechazada','fallida_tecnica') then coalesce(p_detalle_sanitizado->>'motivo', error_sanitizado) else error_sanitizado end where id = p_interaccion_id;
end;
$$;
