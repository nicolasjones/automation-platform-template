-- Aislamiento RLS y escritura mediada de programacion_ejecucion (spec
-- disparo-programado-ciclo-ejecuciones, FR-001/FR-010). Mismo patrón que
-- ciclo_ejecuciones_workers.test.sql: fixtures de 2 organizaciones, un
-- administrador por cada una, simulación de sesión vía
-- request.jwt.claims + set local role authenticated.
begin;

select plan(9);

insert into organizaciones (id, nombre) values
  ('a1111111-1111-1111-1111-111111111111', 'Organización A (programación)'),
  ('a2222222-2222-2222-2222-222222222222', 'Organización B (programación)');

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-a-programacion@example.com'),
  ('a2000000-0000-0000-0000-000000000001', 'admin-b-programacion@example.com');

insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('a1000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'administrador'),
  ('a2000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'administrador');

insert into sistemas_externos (id, descripcion) values
  ('sistema-programacion-test', 'Sistema de fixture para programacion_ejecucion.test.sql, sin valor de negocio');

insert into conexiones (id, organizacion_id, sistema_externo, credencial_vault_id) values
  ('a1111111-1111-1111-1111-111111111112', 'a1111111-1111-1111-1111-111111111111', 'sistema-programacion-test', gen_random_uuid()),
  ('a2222222-2222-2222-2222-222222222223', 'a2222222-2222-2222-2222-222222222222', 'sistema-programacion-test', gen_random_uuid());

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave, tiempo_max_seg) values
  ('a1111111-1111-1111-1111-111111111113', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111112', 'reporte-a', 600),
  ('a2222222-2222-2222-2222-222222222224', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222223', 'reporte-b', 600),
  ('a1111111-1111-1111-1111-111111111116', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111112', 'reporte-sin-programacion', 600);

insert into programacion_ejecucion (id, organizacion_id, capacidad_id, frecuencia, hora, desde) values
  ('a1111111-1111-1111-1111-111111111114', 'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111113', 'diaria', '06:00', current_date),
  ('a2222222-2222-2222-2222-222222222225', 'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222224', 'diaria', '07:00', current_date);

select has_table('public', 'programacion_ejecucion', 'existe la tabla');
select col_is_unique('public', 'programacion_ejecucion', array['capacidad_id'], 'a lo sumo una programación activa por capacidad');

-- ============================================================================
-- Aislamiento RLS entre organizaciones
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from programacion_ejecucion where organizacion_id = 'a1111111-1111-1111-1111-111111111111'),
  1::bigint,
  'admin de A ve su programación'
);
select is(
  (select count(*) from programacion_ejecucion where organizacion_id = 'a2222222-2222-2222-2222-222222222222'),
  0::bigint,
  'admin de A no ve la programación de B'
);

-- Sin policies de insert/update/delete: ni un administrador autenticado
-- puede escribir directo sobre la tabla -- el único camino son las RPCs
-- (fuera de Foundational, tasks.md T010/T011).
select throws_ok(
  $$insert into programacion_ejecucion (organizacion_id, capacidad_id, frecuencia, hora, desde)
    values ('a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111113', 'diaria', '08:00', current_date)$$,
  '42501',
  null,
  'un administrador autenticado no puede insertar directo, sin pasar por una RPC'
);
select throws_ok(
  $$update programacion_ejecucion set hora = '09:00' where id = 'a1111111-1111-1111-1111-111111111114'$$,
  '42501',
  null,
  'un administrador autenticado no puede actualizar directo'
);
select throws_ok(
  $$delete from programacion_ejecucion where id = 'a1111111-1111-1111-1111-111111111114'$$,
  '42501',
  null,
  'un administrador autenticado no puede borrar directo'
);

reset role;

select is(
  (select hasta from programacion_ejecucion where id = 'a1111111-1111-1111-1111-111111111114'),
  null,
  'hasta=null significa "hasta hoy", sin fecha fin'
);
select throws_ok(
  $$insert into programacion_ejecucion (organizacion_id, capacidad_id, frecuencia, hora, desde)
    values ('a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111116', 'semanal', '08:00', current_date)$$,
  '23514',
  null,
  'frecuencia semanal sin dia_semana viola la constraint'
);

select * from finish();
rollback;
