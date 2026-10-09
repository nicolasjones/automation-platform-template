begin;
select plan(17);

select has_table('public', 'despachos_ejecucion', 'existe la tabla durable de outbox');
select has_column('public', 'despachos_ejecucion', 'ejecucion_id', 'la orden referencia la ejecución');
select has_column('public', 'despachos_ejecucion', 'organizacion_id', 'la orden conserva la organización para RLS');
select has_column('public', 'despachos_ejecucion', 'vence_en', 'la orden admite reclamo recuperable');
select ok(
  not has_table_privilege('authenticated', 'public.despachos_ejecucion', 'insert'),
  'authenticated no inserta órdenes directo'
);
select ok(
  not has_table_privilege('anon', 'public.despachos_ejecucion', 'select'),
  'anon no consulta la outbox'
);

insert into organizaciones (id, nombre) values
  ('d1111111-1111-1111-1111-111111111111', 'Outbox X'),
  ('d2222222-2222-2222-2222-222222222222', 'Outbox Y');
insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'outbox-admin-x@example.com'),
  ('d2000000-0000-0000-0000-000000000001', 'outbox-admin-y@example.com');
insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('d1000000-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111', 'administrador'),
  ('d2000000-0000-0000-0000-000000000001', 'd2222222-2222-2222-2222-222222222222', 'administrador');
-- Fixture de catálogo (spec catálogo-sistemas-externos): conexiones.sistema_externo
-- ahora tiene FK a sistemas_externos.
insert into sistemas_externos (id, descripcion) values
  ('outbox-x', 'Outbox X (fixture de test, sin valor de negocio)'),
  ('outbox-y', 'Outbox Y (fixture de test, sin valor de negocio)');
insert into conexiones (id, organizacion_id, sistema_externo, credencial_vault_id) values
  ('d1111111-1111-1111-1111-111111111112', 'd1111111-1111-1111-1111-111111111111', 'outbox-x', gen_random_uuid()),
  ('d2222222-2222-2222-2222-222222222223', 'd2222222-2222-2222-2222-222222222222', 'outbox-y', gen_random_uuid());
insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave) values
  ('d1111111-1111-1111-1111-111111111113', 'd1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111112', 'outbox-x'),
  ('d1111111-1111-1111-1111-111111111115', 'd1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111112', 'outbox-atomica'),
  ('d2222222-2222-2222-2222-222222222224', 'd2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222223', 'outbox-y');
insert into ejecuciones_worker (id, organizacion_id, conexion_id, capacidad_id, origen) values
  ('d1111111-1111-1111-1111-111111111114', 'd1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111112', 'd1111111-1111-1111-1111-111111111113', 'manual'),
  ('d2222222-2222-2222-2222-222222222225', 'd2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222223', 'd2222222-2222-2222-2222-222222222224', 'manual');
insert into despachos_ejecucion (ejecucion_id, organizacion_id) values
  ('d1111111-1111-1111-1111-111111111114', 'd1111111-1111-1111-1111-111111111111'),
  ('d2222222-2222-2222-2222-222222222225', 'd2222222-2222-2222-2222-222222222222');

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*) from despachos_ejecucion), 1::bigint, 'admin de X ve solo su orden');
select is((select count(*) from despachos_ejecucion where organizacion_id = 'd2222222-2222-2222-2222-222222222222'), 0::bigint, 'admin de X no ve la orden de Y');
reset role;

select throws_ok(
  $$insert into despachos_ejecucion (ejecucion_id, organizacion_id) values ('d1111111-1111-1111-1111-111111111114', 'd1111111-1111-1111-1111-111111111111')$$,
  '23505', null, 'una ejecución no puede tener dos órdenes'
);
select is(
  (select count(*) from despachos_ejecucion where estado = 'pendiente'),
  2::bigint, 'las órdenes creadas comienzan pendientes'
);

select ok(
  has_function_privilege(
    'kestra_orquestacion',
    'private.reclamar_despachos_ejecucion(integer, integer)',
    'execute'
  ),
  'solo el rol técnico de Kestra recibe el contrato de reclamo'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.reclamar_despachos_ejecucion(integer, integer)',
    'execute'
  ),
  'un usuario autenticado no puede reclamar órdenes'
);
select ok(
  has_function_privilege(
    'kestra_orquestacion',
    'private.resolver_despacho_ejecucion(uuid,integer,text,text,integer,integer)'::regprocedure,
    'execute'
  ),
  'Kestra puede resolver un reclamo cercado por intento'
);

-- La fila de fixture sembrada arriba (outbox-x, misma conexion ...112) solo
-- servía para los asserts de RLS/constraint de más arriba y quedó en_curso
-- por default: se cierra para no activar CONEXION_EN_CURSO (bug real
-- 2026-10-08, ajeno a lo que prueba outbox-atomica acá abajo).
update ejecuciones_worker set estado = 'exitosa', finalizada_en = clock_timestamp()
where id = 'd1111111-1111-1111-1111-111111111114';

select set_config('request.jwt.claims', json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
select ok(
  public.iniciar_ejecucion_worker(
    'd1111111-1111-1111-1111-111111111112', 'outbox-atomica', 'manual',
    'd1000000-0000-0000-0000-000000000001', '{"periodo":"2026-09"}'::jsonb
  ) is not null,
  'el inicio manual crea una ejecución'
);
select is(
  (select count(*) from public.despachos_ejecucion d
    join public.ejecuciones_worker e on e.id = d.ejecucion_id
    where e.capacidad_id = 'd1111111-1111-1111-1111-111111111115'),
  1::bigint,
  'el mismo inicio manual persiste exactamente una orden durable'
);
reset role;

select throws_ok(
  $$select * from private.reclamar_despachos_ejecucion(1, 60)$$,
  'P0001', 'NO_AUTORIZADO: solo kestra_orquestacion reclama despachos',
  'un rol no técnico no puede reclamar órdenes'
);
select is(
  (select count(*) from public.despachos_ejecucion where estado = 'pendiente'),
  3::bigint, 'un reclamo rechazado no altera las órdenes pendientes'
);

select * from finish();
rollback;
