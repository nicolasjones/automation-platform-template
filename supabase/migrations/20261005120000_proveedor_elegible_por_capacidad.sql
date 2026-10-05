-- Proveedor elegible por capacidad (spec sin número secuencial, ver
-- specs/20261005-120000-proveedor-elegible-por-capacidad/). Pieza genérica
-- de plataforma: para cualquier capacidad que pueda resolverse con más de
-- un proveedor, permite elegir un default por organización y una excepción
-- por cliente, con auditoría y una función de resolución con precedencia
-- cliente -> organización -> catálogo. Sin lógica de negocio de ningún
-- producto derivado: el catálogo (capacidad, proveedor) lo carga cada
-- producto en su propia migración (ver research.md Decisión R4 del spec de
-- origen, nicolasjones/estudio-contable-automation).
--
-- Reversión (migración aditiva, no toca nada existente):
--   drop trigger if exists proveedor_capacidad_cliente_fijar_organizacion on public.proveedor_capacidad_cliente;
--   drop function if exists private.fijar_organizacion_proveedor_capacidad_cliente();
--   drop trigger if exists capacidades_proveedores_retirar_elecciones on public.capacidades_proveedores;
--   drop function if exists private.retirar_elecciones_proveedor_capacidad();
--   drop function if exists public.proveedores_efectivos_de_cliente(uuid);
--   drop function if exists public.proveedores_capacidad_de_organizacion();
--   drop function if exists private.resolver_proveedor_capacidad(uuid, uuid, text);
--   drop function if exists private.resolver_proveedor_capacidad_interno(uuid, uuid, text);
--   drop function if exists public.quitar_proveedor_capacidad_cliente(uuid, text);
--   drop function if exists public.elegir_proveedor_capacidad_cliente(uuid, text, text, boolean);
--   drop function if exists public.elegir_proveedor_capacidad_organizacion(text, text, boolean);
--   drop table if exists public.eventos_proveedor_capacidad;
--   drop table if exists public.proveedor_capacidad_cliente;
--   drop table if exists public.proveedor_capacidad_organizacion;
--   drop table if exists public.capacidades_proveedores;

-- ============================================================================
-- Tablas
-- ============================================================================

create table public.capacidades_proveedores (
  capacidad text not null,
  proveedor text not null references public.sistemas_externos (id),
  nombre_visible text not null,
  clave_ejecucion text not null,
  es_default boolean not null default false,
  requiere_conexion_organizacion text references public.sistemas_externos (id),
  envia_credencial_a_tercero boolean not null default false,
  activo boolean not null default true,
  primary key (capacidad, proveedor)
);

comment on table public.capacidades_proveedores is
  'Catálogo (capacidad x proveedor): para cada capacidad lógica, qué proveedores pueden resolverla, cuál es el default del catálogo, si requiere una conexión de la organización a otro sistema externo y si envía la credencial del cliente a ese proveedor. Vacío a propósito en el template: cada producto derivado carga sus propias filas por migración (sin UI para administrar el catálogo). clave_ejecucion es un puntero de texto suelto a la clave que cada producto use en su propio mecanismo de ejecución (no hay FK: ese mecanismo es de cada producto, no de este template).';

-- Exactamente un default por capacidad.
create unique index capacidades_proveedores_es_default_uidx
  on public.capacidades_proveedores (capacidad)
  where es_default;

create table public.proveedor_capacidad_organizacion (
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  capacidad text not null,
  proveedor text not null,
  acepto_envio_credencial_en timestamptz,
  actualizado_por uuid references auth.users (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (organizacion_id, capacidad),
  foreign key (capacidad, proveedor) references public.capacidades_proveedores (capacidad, proveedor)
);

comment on table public.proveedor_capacidad_organizacion is
  'Elección del proveedor default de una organización para una capacidad, por encima del default del catálogo. Escritura únicamente vía public.elegir_proveedor_capacidad_organizacion.';

create index proveedor_capacidad_organizacion_organizacion_id_idx
  on public.proveedor_capacidad_organizacion (organizacion_id);

create table public.proveedor_capacidad_cliente (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  capacidad text not null,
  proveedor text not null,
  acepto_envio_credencial_en timestamptz,
  actualizado_por uuid references auth.users (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  primary key (cliente_id, capacidad),
  foreign key (capacidad, proveedor) references public.capacidades_proveedores (capacidad, proveedor)
);

comment on table public.proveedor_capacidad_cliente is
  'Excepción de un cliente puntual por encima del default de su organización. organizacion_id queda denormalizado y fijado por trigger desde clientes.organizacion_id (nunca se confía en lo que mande el cliente de la función) para que la policy de RLS no necesite un join. Escritura únicamente vía public.elegir_proveedor_capacidad_cliente / public.quitar_proveedor_capacidad_cliente.';

create index proveedor_capacidad_cliente_organizacion_id_idx
  on public.proveedor_capacidad_cliente (organizacion_id);

create table public.eventos_proveedor_capacidad (
  id bigint generated always as identity primary key,
  organizacion_id uuid not null references public.organizaciones (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete set null,
  capacidad text not null,
  proveedor_anterior text,
  proveedor_nuevo text,
  acepto_envio_credencial boolean not null default false,
  actor uuid references auth.users (id) on delete set null,
  ocurrido_en timestamptz not null default now()
);

comment on table public.eventos_proveedor_capacidad is
  'Auditoría de toda alta/cambio/baja de elección u excepción (actor, momento, valor anterior y nuevo), incluida la baja automática que dispara el retiro de un proveedor del catálogo (actor null = sistema, no un administrador). cliente_id en on delete set null a propósito: el evento sobrevive aunque el cliente se borre después (la excepción en sí sí se borra en cascada).';

create index eventos_proveedor_capacidad_organizacion_id_idx
  on public.eventos_proveedor_capacidad (organizacion_id, id desc);

-- ============================================================================
-- RLS
-- ============================================================================

alter table public.capacidades_proveedores enable row level security;

create policy capacidades_proveedores_select on public.capacidades_proveedores
  for select to authenticated
  using (true);

alter table public.proveedor_capacidad_organizacion enable row level security;

create policy proveedor_capacidad_organizacion_select on public.proveedor_capacidad_organizacion
  for select to authenticated
  using (organizacion_id = (select private.organizacion_id()));

-- Cinturón de seguridad (mismo patrón que clientes_identificadores_externos
-- en 20260930140000_mapeo_identificadores_clientes.sql): sin GRANT de
-- escritura a authenticated más abajo, toda escritura real pasa por las
-- funciones SECURITY DEFINER; estas policies solo cubren el caso de que
-- algún día se otorgue el grant de tabla por error.
create policy proveedor_capacidad_organizacion_insert on public.proveedor_capacidad_organizacion
  for insert to authenticated
  with check ((select private.es_administrador_de(organizacion_id)));

create policy proveedor_capacidad_organizacion_update on public.proveedor_capacidad_organizacion
  for update to authenticated
  using ((select private.es_administrador_de(organizacion_id)))
  with check ((select private.es_administrador_de(organizacion_id)));

create policy proveedor_capacidad_organizacion_delete on public.proveedor_capacidad_organizacion
  for delete to authenticated
  using ((select private.es_administrador_de(organizacion_id)));

alter table public.proveedor_capacidad_cliente enable row level security;

create policy proveedor_capacidad_cliente_select on public.proveedor_capacidad_cliente
  for select to authenticated
  using (organizacion_id = (select private.organizacion_id()));

create policy proveedor_capacidad_cliente_insert on public.proveedor_capacidad_cliente
  for insert to authenticated
  with check ((select private.es_administrador_de(organizacion_id)));

create policy proveedor_capacidad_cliente_update on public.proveedor_capacidad_cliente
  for update to authenticated
  using ((select private.es_administrador_de(organizacion_id)))
  with check ((select private.es_administrador_de(organizacion_id)));

create policy proveedor_capacidad_cliente_delete on public.proveedor_capacidad_cliente
  for delete to authenticated
  using ((select private.es_administrador_de(organizacion_id)));

alter table public.eventos_proveedor_capacidad enable row level security;

create policy eventos_proveedor_capacidad_select on public.eventos_proveedor_capacidad
  for select to authenticated
  using (organizacion_id = (select private.organizacion_id()));

create policy eventos_proveedor_capacidad_insert on public.eventos_proveedor_capacidad
  for insert to authenticated
  with check ((select private.es_administrador_de(organizacion_id)));

-- ============================================================================
-- Grants (auto_expose_new_tables = false: hacen falta explícitos)
-- ============================================================================

grant select on public.capacidades_proveedores to authenticated;
grant select on public.proveedor_capacidad_organizacion to authenticated;
grant select on public.proveedor_capacidad_cliente to authenticated;
grant select on public.eventos_proveedor_capacidad to authenticated;

-- ============================================================================
-- Funciones (SECURITY DEFINER, search_path = '')
-- ============================================================================

-- Núcleo de la resolución, sin chequeo de identidad del llamante: confía en
-- que quien la invoca (la función pública de abajo, o cualquier otra
-- función SECURITY DEFINER de esta misma migración) ya validó de dónde
-- sale p_organizacion_id. Sin GRANT propio (solo se llama internamente,
-- como dueño); nunca se expone directo a un rol externo.
create or replace function private.resolver_proveedor_capacidad_interno(
  p_organizacion_id uuid,
  p_cliente_id uuid,
  p_capacidad text
)
returns table (
  proveedor text,
  clave_ejecucion text,
  origen text,
  disponible boolean,
  motivo_no_disponible text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_proveedor text;
  v_origen text;
  v_catalogo public.capacidades_proveedores;
  v_conexiones_total int;
  v_conexiones_activas int;
begin
  -- 1) Excepción de cliente, solo si el proveedor elegido sigue activo en
  -- el catálogo (un proveedor retirado no cuenta como elección: cae al
  -- siguiente nivel, ver Edge Cases de spec.md).
  if p_cliente_id is not null then
    select pcc.proveedor into v_proveedor
    from public.proveedor_capacidad_cliente pcc
    join public.capacidades_proveedores cp
      on cp.capacidad = pcc.capacidad and cp.proveedor = pcc.proveedor and cp.activo
    where pcc.cliente_id = p_cliente_id and pcc.capacidad = p_capacidad;

    if found then
      v_origen := 'cliente';
    end if;
  end if;

  -- 2) Default de la organización, misma condición de vigencia.
  if v_proveedor is null then
    select pco.proveedor into v_proveedor
    from public.proveedor_capacidad_organizacion pco
    join public.capacidades_proveedores cp
      on cp.capacidad = pco.capacidad and cp.proveedor = pco.proveedor and cp.activo
    where pco.organizacion_id = p_organizacion_id and pco.capacidad = p_capacidad;

    if found then
      v_origen := 'organizacion';
    end if;
  end if;

  -- 3) Default del catálogo.
  if v_proveedor is null then
    select cp.proveedor into v_proveedor
    from public.capacidades_proveedores cp
    where cp.capacidad = p_capacidad and cp.es_default and cp.activo;

    if found then
      v_origen := 'catalogo';
    end if;
  end if;

  if v_proveedor is null then
    -- Sin ninguna fila de catálogo para la capacidad: el consumidor usa su
    -- único proveedor (contracts/rpc.md) -> 0 filas.
    if not exists (select 1 from public.capacidades_proveedores cp where cp.capacidad = p_capacidad) then
      return;
    end if;

    -- Hay catálogo para la capacidad, pero ningún proveedor sigue activo
    -- (caso degenerado: se retiró toda la capacidad).
    return query select null::text, null::text, 'catalogo'::text, false, 'PROVEEDOR_RETIRADO'::text;
    return;
  end if;

  select * into v_catalogo
  from public.capacidades_proveedores cp
  where cp.capacidad = p_capacidad and cp.proveedor = v_proveedor;

  if v_catalogo.requiere_conexion_organizacion is null then
    return query select v_proveedor, v_catalogo.clave_ejecucion, v_origen, true, null::text;
    return;
  end if;

  select
    count(*),
    count(*) filter (where cx.estado = 'activa')
  into v_conexiones_total, v_conexiones_activas
  from public.conexiones cx
  where cx.organizacion_id = p_organizacion_id
    and cx.sistema_externo = v_catalogo.requiere_conexion_organizacion;

  if v_conexiones_total = 0 then
    -- Nunca sustituye el proveedor (FR-005/R3): se informa el motivo y el
    -- consumidor decide, no se cae solo al otro proveedor.
    return query select v_proveedor, v_catalogo.clave_ejecucion, v_origen, false, 'SIN_CONEXION'::text;
    return;
  end if;

  if v_conexiones_activas = 0 then
    return query select v_proveedor, v_catalogo.clave_ejecucion, v_origen, false, 'CONEXION_INVALIDA'::text;
    return;
  end if;

  return query select v_proveedor, v_catalogo.clave_ejecucion, v_origen, true, null::text;
end;
$$;

comment on function private.resolver_proveedor_capacidad_interno(uuid, uuid, text) is
  'Núcleo de contracts/rpc.md de la spec de origen (precedencia cliente -> organización -> catálogo; nunca sustituye el proveedor elegido por otro ante una falla). Resolución < 10ms: todo el camino usa PK/índices, sin tabla sin filtrar. Sin chequeo de identidad del llamante — ese chequeo vive en el wrapper public-facing private.resolver_proveedor_capacidad() y en cada función pública que ya validó su propio p_organizacion_id/p_cliente_id antes de llegar acá.';

revoke execute on function private.resolver_proveedor_capacidad_interno(uuid, uuid, text) from public, authenticated, anon;

-- Wrapper alcanzable por kestra_orquestacion (despachador confiable, puede
-- resolver cualquier organización) y por los roles worker_<organizacion_id>
-- (grupo workers_orquestacion), que solo pueden resolver la SUYA propia,
-- derivada de session_user vía private.organizacion_del_rol_actual() —
-- mismo patrón que private.autorizar_llamante_ciclo
-- (20260923000000_ciclo_ejecuciones_workers.sql). Sin este chequeo, el
-- worker de una organización podría pasar el p_organizacion_id de otra y
-- leer su resolución de proveedores — violación de FR-009, encontrada por
-- authz-security antes de mergear (session_user no cambia con SECURITY
-- DEFINER, así que este chequeo no puede vivir en el núcleo de arriba: ahí
-- rompería las dos funciones públicas de más abajo, que llaman al núcleo
-- después de validar su propio parámetro por otro camino, con
-- session_user = 'authenticator' en producción vía PostgREST).
create or replace function private.resolver_proveedor_capacidad(
  p_organizacion_id uuid,
  p_cliente_id uuid,
  p_capacidad text
)
returns table (
  proveedor text,
  clave_ejecucion text,
  origen text,
  disponible boolean,
  motivo_no_disponible text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if session_user = 'kestra_orquestacion' then
    null;
  elsif session_user like 'worker\_%' then
    if (select private.organizacion_del_rol_actual()) is distinct from p_organizacion_id then
      raise exception 'NO_AUTORIZADO: el worker solo puede resolver proveedores de su propia organización' using errcode = 'P0001';
    end if;
  else
    raise exception 'NO_AUTORIZADO: llamante no reconocido para resolver proveedores' using errcode = 'P0001';
  end if;

  return query select * from private.resolver_proveedor_capacidad_interno(p_organizacion_id, p_cliente_id, p_capacidad);
end;
$$;

comment on function private.resolver_proveedor_capacidad(uuid, uuid, text) is
  'Punto de entrada para kestra_orquestacion/workers_orquestacion (contracts/rpc.md). Valida que un worker_* solo resuelva su propia organización antes de delegar en private.resolver_proveedor_capacidad_interno.';

revoke execute on function private.resolver_proveedor_capacidad(uuid, uuid, text) from public, authenticated, anon;
grant usage on schema private to kestra_orquestacion, workers_orquestacion;
grant execute on function private.resolver_proveedor_capacidad(uuid, uuid, text) to kestra_orquestacion, workers_orquestacion;

create or replace function public.elegir_proveedor_capacidad_organizacion(
  p_capacidad text,
  p_proveedor text,
  p_acepto_envio_credencial boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
  v_catalogo public.capacidades_proveedores;
  v_anterior text;
begin
  v_organizacion_id := private.organizacion_id();

  if v_organizacion_id is null or not (select private.es_administrador_de(v_organizacion_id)) then
    raise exception 'NO_AUTORIZADO: se requiere ser administrador de la organización' using errcode = 'P0001';
  end if;

  select * into v_catalogo
  from public.capacidades_proveedores cp
  where cp.capacidad = p_capacidad and cp.proveedor = p_proveedor and cp.activo;

  if not found then
    raise exception 'PROVEEDOR_INEXISTENTE: % no es un proveedor activo de %', p_proveedor, p_capacidad using errcode = 'P0001';
  end if;

  if v_catalogo.requiere_conexion_organizacion is not null and not exists (
    select 1 from public.conexiones cx
    where cx.organizacion_id = v_organizacion_id
      and cx.sistema_externo = v_catalogo.requiere_conexion_organizacion
  ) then
    raise exception 'PROVEEDOR_SIN_CONEXION: % requiere una conexión activa a % en esta organización', p_proveedor, v_catalogo.requiere_conexion_organizacion using errcode = 'P0001';
  end if;

  if v_catalogo.envia_credencial_a_tercero and not p_acepto_envio_credencial then
    raise exception 'ACEPTACION_REQUERIDA: debe aceptar el envío de la credencial del cliente a un tercero' using errcode = 'P0001';
  end if;

  select pco.proveedor into v_anterior
  from public.proveedor_capacidad_organizacion pco
  where pco.organizacion_id = v_organizacion_id and pco.capacidad = p_capacidad;

  insert into public.proveedor_capacidad_organizacion (
    organizacion_id, capacidad, proveedor, acepto_envio_credencial_en, actualizado_por, actualizado_en
  ) values (
    v_organizacion_id, p_capacidad, p_proveedor,
    case when v_catalogo.envia_credencial_a_tercero then clock_timestamp() else null end,
    auth.uid(), clock_timestamp()
  )
  on conflict (organizacion_id, capacidad) do update set
    proveedor = excluded.proveedor,
    acepto_envio_credencial_en = excluded.acepto_envio_credencial_en,
    actualizado_por = excluded.actualizado_por,
    actualizado_en = excluded.actualizado_en;

  insert into public.eventos_proveedor_capacidad (
    organizacion_id, cliente_id, capacidad, proveedor_anterior, proveedor_nuevo, acepto_envio_credencial, actor
  ) values (
    v_organizacion_id, null, p_capacidad, v_anterior, p_proveedor,
    v_catalogo.envia_credencial_a_tercero and p_acepto_envio_credencial, auth.uid()
  );
end;
$$;

comment on function public.elegir_proveedor_capacidad_organizacion(text, text, boolean) is
  'Contrato: contracts/rpc.md de la spec de origen. Único camino para fijar el default de una organización: valida catálogo activo, conexión requerida (PROVEEDOR_SIN_CONEXION) y aceptación de envío de credencial (ACEPTACION_REQUERIDA) antes de upsert + evento auditado.';

revoke execute on function public.elegir_proveedor_capacidad_organizacion(text, text, boolean) from public;
grant execute on function public.elegir_proveedor_capacidad_organizacion(text, text, boolean) to authenticated;

create or replace function public.elegir_proveedor_capacidad_cliente(
  p_cliente_id uuid,
  p_capacidad text,
  p_proveedor text,
  p_acepto_envio_credencial boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
  v_catalogo public.capacidades_proveedores;
  v_anterior text;
begin
  select c.organizacion_id into v_organizacion_id from public.clientes c where c.id = p_cliente_id;

  if v_organizacion_id is null then
    raise exception 'CLIENTE_DESCONOCIDO: % no existe', p_cliente_id using errcode = 'P0002';
  end if;

  if not (select private.es_administrador_de(v_organizacion_id)) then
    raise exception 'NO_AUTORIZADO: se requiere ser administrador de la organización' using errcode = 'P0001';
  end if;

  select * into v_catalogo
  from public.capacidades_proveedores cp
  where cp.capacidad = p_capacidad and cp.proveedor = p_proveedor and cp.activo;

  if not found then
    raise exception 'PROVEEDOR_INEXISTENTE: % no es un proveedor activo de %', p_proveedor, p_capacidad using errcode = 'P0001';
  end if;

  if v_catalogo.requiere_conexion_organizacion is not null and not exists (
    select 1 from public.conexiones cx
    where cx.organizacion_id = v_organizacion_id
      and cx.sistema_externo = v_catalogo.requiere_conexion_organizacion
  ) then
    raise exception 'PROVEEDOR_SIN_CONEXION: % requiere una conexión activa a % en esta organización', p_proveedor, v_catalogo.requiere_conexion_organizacion using errcode = 'P0001';
  end if;

  if v_catalogo.envia_credencial_a_tercero and not p_acepto_envio_credencial then
    raise exception 'ACEPTACION_REQUERIDA: debe aceptar el envío de la credencial del cliente a un tercero' using errcode = 'P0001';
  end if;

  select pcc.proveedor into v_anterior
  from public.proveedor_capacidad_cliente pcc
  where pcc.cliente_id = p_cliente_id and pcc.capacidad = p_capacidad;

  insert into public.proveedor_capacidad_cliente (
    cliente_id, organizacion_id, capacidad, proveedor, acepto_envio_credencial_en, actualizado_por, actualizado_en
  ) values (
    p_cliente_id, v_organizacion_id, p_capacidad, p_proveedor,
    case when v_catalogo.envia_credencial_a_tercero then clock_timestamp() else null end,
    auth.uid(), clock_timestamp()
  )
  on conflict (cliente_id, capacidad) do update set
    proveedor = excluded.proveedor,
    acepto_envio_credencial_en = excluded.acepto_envio_credencial_en,
    actualizado_por = excluded.actualizado_por,
    actualizado_en = excluded.actualizado_en;

  insert into public.eventos_proveedor_capacidad (
    organizacion_id, cliente_id, capacidad, proveedor_anterior, proveedor_nuevo, acepto_envio_credencial, actor
  ) values (
    v_organizacion_id, p_cliente_id, p_capacidad, v_anterior, p_proveedor,
    v_catalogo.envia_credencial_a_tercero and p_acepto_envio_credencial, auth.uid()
  );
end;
$$;

comment on function public.elegir_proveedor_capacidad_cliente(uuid, text, text, boolean) is
  'Contrato: contracts/rpc.md de la spec de origen. Mismas validaciones que elegir_proveedor_capacidad_organizacion, pero para la excepción de un cliente puntual; el trigger de proveedor_capacidad_cliente fija organizacion_id desde clientes, no desde el parámetro.';

revoke execute on function public.elegir_proveedor_capacidad_cliente(uuid, text, text, boolean) from public;
grant execute on function public.elegir_proveedor_capacidad_cliente(uuid, text, text, boolean) to authenticated;

create or replace function public.quitar_proveedor_capacidad_cliente(
  p_cliente_id uuid,
  p_capacidad text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
  v_anterior text;
begin
  select c.organizacion_id into v_organizacion_id from public.clientes c where c.id = p_cliente_id;

  if v_organizacion_id is null then
    return; -- cliente inexistente: no-op
  end if;

  if not (select private.es_administrador_de(v_organizacion_id)) then
    raise exception 'NO_AUTORIZADO: se requiere ser administrador de la organización' using errcode = 'P0001';
  end if;

  select pcc.proveedor into v_anterior
  from public.proveedor_capacidad_cliente pcc
  where pcc.cliente_id = p_cliente_id and pcc.capacidad = p_capacidad;

  if v_anterior is null then
    return; -- no había excepción: no-op
  end if;

  delete from public.proveedor_capacidad_cliente
  where cliente_id = p_cliente_id and capacidad = p_capacidad;

  insert into public.eventos_proveedor_capacidad (
    organizacion_id, cliente_id, capacidad, proveedor_anterior, proveedor_nuevo, acepto_envio_credencial, actor
  ) values (
    v_organizacion_id, p_cliente_id, p_capacidad, v_anterior, null, false, auth.uid()
  );
end;
$$;

comment on function public.quitar_proveedor_capacidad_cliente(uuid, text) is
  'Contrato: contracts/rpc.md de la spec de origen. Quita la excepción del cliente (vuelve a heredar el default de la organización/catálogo); no-op si no existía.';

revoke execute on function public.quitar_proveedor_capacidad_cliente(uuid, text) from public;
grant execute on function public.quitar_proveedor_capacidad_cliente(uuid, text) to authenticated;

create or replace function public.proveedores_capacidad_de_organizacion()
returns table (
  capacidad text,
  proveedor text,
  nombre_visible text,
  origen text,
  disponible boolean,
  opciones jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
begin
  v_organizacion_id := private.organizacion_id();

  if v_organizacion_id is null then
    return;
  end if;

  return query
  with elegibles as (
    select cp.capacidad
    from public.capacidades_proveedores cp
    where cp.activo
    group by cp.capacidad
    having count(*) >= 2
  )
  select
    e.capacidad,
    r.proveedor,
    cat.nombre_visible,
    r.origen,
    r.disponible,
    (
      select jsonb_agg(jsonb_build_object(
        'proveedor', cp2.proveedor,
        'nombre_visible', cp2.nombre_visible,
        'es_default', cp2.es_default,
        'requiere_conexion_organizacion', cp2.requiere_conexion_organizacion,
        'envia_credencial_a_tercero', cp2.envia_credencial_a_tercero
      ) order by cp2.es_default desc, cp2.proveedor)
      from public.capacidades_proveedores cp2
      where cp2.capacidad = e.capacidad and cp2.activo
    ) as opciones
  from elegibles e
  cross join lateral private.resolver_proveedor_capacidad_interno(v_organizacion_id, null, e.capacidad) r
  left join public.capacidades_proveedores cat
    on cat.capacidad = e.capacidad and cat.proveedor = r.proveedor;
end;
$$;

comment on function public.proveedores_capacidad_de_organizacion() is
  'Contrato: contracts/rpc.md de la spec de origen. Solo capacidades con 2+ proveedores activos (si hay uno solo, no hay nada que elegir); opciones trae el catálogo activo completo de esa capacidad para el selector de la UI.';

revoke execute on function public.proveedores_capacidad_de_organizacion() from public;
grant execute on function public.proveedores_capacidad_de_organizacion() to authenticated;

create or replace function public.proveedores_efectivos_de_cliente(p_cliente_id uuid)
returns table (
  capacidad text,
  proveedor text,
  nombre_visible text,
  origen text,
  disponible boolean,
  motivo_no_disponible text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
begin
  select c.organizacion_id into v_organizacion_id from public.clientes c where c.id = p_cliente_id;

  if v_organizacion_id is null then
    raise exception 'CLIENTE_DESCONOCIDO: % no existe', p_cliente_id using errcode = 'P0002';
  end if;

  if v_organizacion_id <> (select private.organizacion_id()) then
    raise exception 'NO_AUTORIZADO: el cliente no pertenece a su organización' using errcode = 'P0001';
  end if;

  return query
  with elegibles as (
    select cp.capacidad
    from public.capacidades_proveedores cp
    where cp.activo
    group by cp.capacidad
    having count(*) >= 2
  )
  select
    e.capacidad,
    r.proveedor,
    cat.nombre_visible,
    r.origen,
    r.disponible,
    r.motivo_no_disponible
  from elegibles e
  cross join lateral private.resolver_proveedor_capacidad_interno(v_organizacion_id, p_cliente_id, e.capacidad) r
  left join public.capacidades_proveedores cat
    on cat.capacidad = e.capacidad and cat.proveedor = r.proveedor;
end;
$$;

comment on function public.proveedores_efectivos_de_cliente(uuid) is
  'Contrato: contracts/rpc.md de la spec de origen. Mismo filtro de 2+ proveedores activos; origen indica si salió de la excepción del cliente, del default de la organización o del catálogo.';

revoke execute on function public.proveedores_efectivos_de_cliente(uuid) from public;
grant execute on function public.proveedores_efectivos_de_cliente(uuid) to authenticated;

-- ============================================================================
-- Triggers
-- ============================================================================

create or replace function private.fijar_organizacion_proveedor_capacidad_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
begin
  select c.organizacion_id into v_organizacion_id from public.clientes c where c.id = new.cliente_id;

  if v_organizacion_id is null then
    raise exception 'CLIENTE_DESCONOCIDO: % no existe', new.cliente_id using errcode = 'P0002';
  end if;

  new.organizacion_id := v_organizacion_id;
  return new;
end;
$$;

comment on function private.fijar_organizacion_proveedor_capacidad_cliente() is
  'Trigger de consistencia (data-model.md de la spec de origen): organizacion_id de proveedor_capacidad_cliente siempre sale de clientes, nunca de lo que mande la función de alta, para que la policy de RLS (comparación directa de columna) no pueda desincronizarse.';

create trigger proveedor_capacidad_cliente_fijar_organizacion
before insert or update on public.proveedor_capacidad_cliente
for each row
execute function private.fijar_organizacion_proveedor_capacidad_cliente();

create or replace function private.retirar_elecciones_proveedor_capacidad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.activo and not new.activo then
    insert into public.eventos_proveedor_capacidad (
      organizacion_id, cliente_id, capacidad, proveedor_anterior, proveedor_nuevo, acepto_envio_credencial, actor
    )
    select pco.organizacion_id, null, pco.capacidad, pco.proveedor, null, false, null
    from public.proveedor_capacidad_organizacion pco
    where pco.capacidad = new.capacidad and pco.proveedor = new.proveedor;

    delete from public.proveedor_capacidad_organizacion
    where capacidad = new.capacidad and proveedor = new.proveedor;

    insert into public.eventos_proveedor_capacidad (
      organizacion_id, cliente_id, capacidad, proveedor_anterior, proveedor_nuevo, acepto_envio_credencial, actor
    )
    select pcc.organizacion_id, pcc.cliente_id, pcc.capacidad, pcc.proveedor, null, false, null
    from public.proveedor_capacidad_cliente pcc
    where pcc.capacidad = new.capacidad and pcc.proveedor = new.proveedor;

    delete from public.proveedor_capacidad_cliente
    where capacidad = new.capacidad and proveedor = new.proveedor;
  end if;

  return new;
end;
$$;

comment on function private.retirar_elecciones_proveedor_capacidad() is
  'Edge case de spec.md: retirar un proveedor del catálogo (activo true -> false) invalida las elecciones/excepciones que lo usaban; la resolución cae sola al siguiente nivel (función de resolución ya filtra por catálogo activo) y acá se audita el porqué con actor null (decisión del producto, no de un administrador).';

create trigger capacidades_proveedores_retirar_elecciones
after update on public.capacidades_proveedores
for each row
execute function private.retirar_elecciones_proveedor_capacidad();
