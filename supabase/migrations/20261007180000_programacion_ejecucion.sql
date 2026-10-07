-- Programación recurrente de una capacidad de ejecución (spec
-- disparo-programado-ciclo-ejecuciones, FR-001). Migración aditiva.
-- Reversión:
--   revoke all on table programacion_ejecucion from anon, authenticated;
--   drop policy programacion_ejecucion_select on programacion_ejecucion;
--   drop table programacion_ejecucion;
--
-- Misma ubicación que capacidades_ejecucion/ejecuciones_worker: esquema
-- public, plataforma, no dominio. A lo sumo una programación activa por
-- capacidad (unique (capacidad_id)) -- no una lista, no hay caso de uso
-- para 2 programaciones simultáneas de la misma capacidad.

create table programacion_ejecucion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones (id) on delete cascade,
  capacidad_id uuid not null references capacidades_ejecucion (id) on delete cascade unique,
  frecuencia text not null check (frecuencia in ('diaria', 'semanal', 'mensual')),
  dia_semana smallint check (dia_semana between 0 and 6),
  dia_mes smallint check (dia_mes between 1 and 31),
  hora time not null,
  desde date not null,
  hasta date,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hasta is null or hasta >= desde),
  check (frecuencia <> 'semanal' or dia_semana is not null),
  check (frecuencia <> 'mensual' or dia_mes is not null)
);

comment on table programacion_ejecucion is
  'Programación recurrente de una capacidad de ejecución (disparo automático vía despachador-programado.yml, origen=programada). A lo sumo una por capacidad (unique capacidad_id). hasta=null significa "hasta hoy", sin fecha fin; una fila con hasta < hoy queda vencida y visible, nunca se borra sola.';

create index programacion_ejecucion_organizacion_id_idx on programacion_ejecucion (organizacion_id);

alter table programacion_ejecucion enable row level security;

-- Mismo criterio que capacidades_ejecucion_select/ejecuciones_worker_select:
-- administradores de la organización dueña y superadmins. Sin policies de
-- insert/update/delete: el único camino son las RPCs (fuera del alcance de
-- Foundational, ver tasks.md T010-T011).
create policy programacion_ejecucion_select on programacion_ejecucion
  for select to authenticated
  using ((select private.es_administrador_de(organizacion_id)));

revoke all on table programacion_ejecucion from anon, authenticated;
grant select (id, organizacion_id, capacidad_id, frecuencia, dia_semana, dia_mes, hora, desde, hasta, created_at, updated_at)
  on table programacion_ejecucion to authenticated;
