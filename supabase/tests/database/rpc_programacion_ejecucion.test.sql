-- Permisos de las RPCs de programación (spec
-- disparo-programado-ciclo-ejecuciones, FR-010, contracts/rpc.md):
-- administrador programa/quita; cualquier miembro autenticado de la
-- organización puede listar (lectura vía RPC, distinto del acceso
-- directo a la tabla -- defensa en profundidad, mismo criterio que
-- proveedor_elegible_por_capacidad).
begin;

select plan(8);

insert into organizaciones (id, nombre) values
  ('d1111111-1111-1111-1111-111111111111', 'Organización RPC programación'),
  ('d2222222-2222-2222-2222-222222222222', 'Organización RPC programación B');

insert into auth.users (id, email) values
  ('d1000000-0000-0000-0000-000000000001', 'admin-d1-rpc-programacion@example.com'),
  ('d1000000-0000-0000-0000-000000000002', 'miembro-d1-rpc-programacion@example.com'),
  ('d2000000-0000-0000-0000-000000000001', 'admin-d2-rpc-programacion@example.com');

insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('d1000000-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111', 'administrador'),
  ('d1000000-0000-0000-0000-000000000002', 'd1111111-1111-1111-1111-111111111111', 'miembro'),
  ('d2000000-0000-0000-0000-000000000001', 'd2222222-2222-2222-2222-222222222222', 'administrador');

insert into sistemas_externos (id, descripcion) values
  ('sistema-rpc-programacion-test', 'Sistema de fixture para rpc_programacion_ejecucion.test.sql, sin valor de negocio');

insert into conexiones (id, organizacion_id, sistema_externo, credencial_vault_id) values
  ('d1111111-1111-1111-1111-111111111112', 'd1111111-1111-1111-1111-111111111111', 'sistema-rpc-programacion-test', gen_random_uuid());

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave, tiempo_max_seg) values
  ('d1111111-1111-1111-1111-111111111113', 'd1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111112', 'reporte-d', 600);

-- ============================================================================
-- Un miembro (no administrador) no puede programar ni quitar
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd1000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select programar_capacidad_ejecucion('d1111111-1111-1111-1111-111111111113', 'diaria', null, null, '06:00', current_date)$$,
  'P0001',
  'NO_AUTORIZADO: se requiere ser administrador de la organización',
  'un miembro no administrador no puede programar'
);

select throws_ok(
  $$select quitar_programacion_capacidad('d1111111-1111-1111-1111-111111111113')$$,
  'P0001',
  'NO_AUTORIZADO: se requiere ser administrador de la organización',
  'un miembro no administrador no puede quitar'
);

reset role;

-- ============================================================================
-- Un administrador de OTRA organización no puede tocar la capacidad de esta
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd2000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select programar_capacidad_ejecucion('d1111111-1111-1111-1111-111111111113', 'diaria', null, null, '06:00', current_date)$$,
  'P0001',
  'NO_AUTORIZADO: se requiere ser administrador de la organización',
  'el administrador de otra organización no puede programar una capacidad ajena'
);

reset role;

-- ============================================================================
-- El administrador dueño sí puede
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$select programar_capacidad_ejecucion('d1111111-1111-1111-1111-111111111113', 'diaria', null, null, '06:00', current_date)$$,
  'el administrador dueño programa su capacidad'
);

select is(
  (select count(*) from listar_programaciones_de_organizacion()),
  1::bigint,
  'listar_programaciones_de_organizacion devuelve la programación recién creada (lectura vía RPC abierta a cualquier miembro, no solo admin)'
);

select throws_ok(
  $$select programar_capacidad_ejecucion('00000000-0000-0000-0000-000000000000', 'diaria', null, null, '06:00', current_date)$$,
  'P0001',
  'CAPACIDAD_DESCONOCIDA: 00000000-0000-0000-0000-000000000000',
  'una capacidad inexistente se rechaza con un error claro'
);

select lives_ok(
  $$select quitar_programacion_capacidad('d1111111-1111-1111-1111-111111111113')$$,
  'el administrador dueño quita su programación'
);

select is(
  (select count(*) from listar_programaciones_de_organizacion()),
  0::bigint,
  'después de quitarla, no aparece más'
);

reset role;

select * from finish();
rollback;
