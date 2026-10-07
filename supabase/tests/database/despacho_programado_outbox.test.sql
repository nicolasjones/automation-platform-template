-- Orden de despacho para origen='programada' (spec
-- disparo-programado-ciclo-ejecuciones, FR-002/FR-003, research.md #1).
-- Antes de esta spec, iniciar_ejecucion_worker solo generaba una fila en
-- despachos_ejecucion para origen='manual' -- 'programada' creaba la
-- ejecución pero nada la disparaba de verdad. Este test fija el
-- comportamiento corregido y, por separado, confirma que 'kestra' sigue
-- sin generar una orden (no cambia, evita la recursión de despacho que
-- documenta el comentario original de la función).
begin;

select plan(5);

insert into organizaciones (id, nombre) values
  ('b1111111-1111-1111-1111-111111111111', 'Organización despacho programado');

insert into auth.users (id, email) values
  ('b1000000-0000-0000-0000-000000000001', 'admin-despacho-programado@example.com');

insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('b1000000-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111', 'administrador');

insert into sistemas_externos (id, descripcion) values
  ('sistema-despacho-programado-test', 'Sistema de fixture para despacho_programado_outbox.test.sql, sin valor de negocio');

insert into conexiones (id, organizacion_id, sistema_externo, credencial_vault_id) values
  ('b1111111-1111-1111-1111-111111111112', 'b1111111-1111-1111-1111-111111111111', 'sistema-despacho-programado-test', gen_random_uuid());

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave, tiempo_max_seg) values
  ('b1111111-1111-1111-1111-111111111113', 'b1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111112', 'reporte-programado', 600),
  ('b1111111-1111-1111-1111-111111111116', 'b1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111112', 'reporte-kestra', 600);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'b1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select results_eq(
  $$select iniciar_ejecucion_worker('b1111111-1111-1111-1111-111111111112', 'reporte-programado', 'programada') is not null$$,
  $$select true$$,
  'origen programada inicia la ejecución'
);

select is(
  (select count(*) from despachos_ejecucion d
    join ejecuciones_worker e on e.id = d.ejecucion_id
    where e.capacidad_id = 'b1111111-1111-1111-1111-111111111113'),
  1::bigint,
  'origen programada SÍ genera una orden de despacho (antes de esta spec, no generaba ninguna)'
);

select is(
  (select estado from despachos_ejecucion d
    join ejecuciones_worker e on e.id = d.ejecucion_id
    where e.capacidad_id = 'b1111111-1111-1111-1111-111111111113'),
  'pendiente',
  'la orden nueva queda pendiente, lista para que reclamar_despachos_ejecucion la recoja'
);

select results_eq(
  $$select iniciar_ejecucion_worker('b1111111-1111-1111-1111-111111111112', 'reporte-kestra', 'kestra') is not null$$,
  $$select true$$,
  'origen kestra sigue iniciando la ejecución'
);

select is(
  (select count(*) from despachos_ejecucion d
    join ejecuciones_worker e on e.id = d.ejecucion_id
    where e.capacidad_id = 'b1111111-1111-1111-1111-111111111116'),
  0::bigint,
  'origen kestra sigue SIN generar una orden (regresión, FR-009: no cambia)'
);

select * from finish();
rollback;
