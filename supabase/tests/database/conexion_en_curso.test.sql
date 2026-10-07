-- Concurrencia por conexión (spec disparo-programado-ciclo-ejecuciones,
-- FR-005/FR-006, research.md #2). Mismo criterio que
-- ejecucion_en_curso_worker.test.sql: la lógica se prueba directo sobre
-- private.conexion_en_curso (sin grants a authenticated/anon, pero el rol
-- de test la ejecuta igual al no estar revocada de su propio dueño).
begin;

select plan(7);

insert into organizaciones (id, nombre) values
  ('c1111111-1111-1111-1111-111111111111', 'Organización conexión en curso');

insert into sistemas_externos (id, descripcion) values
  ('sistema-conexion-en-curso-test', 'Sistema de fixture para conexion_en_curso.test.sql, sin valor de negocio');

-- Dos conexiones al MISMO sistema externo (spec 013: "una organización
-- puede tener más de una conexión al mismo sistema") -- deben ser
-- independientes entre sí para efectos de concurrencia.
insert into conexiones (id, organizacion_id, sistema_externo, credencial_vault_id) values
  ('c1111111-1111-1111-1111-111111111112', 'c1111111-1111-1111-1111-111111111111', 'sistema-conexion-en-curso-test', gen_random_uuid()),
  ('c2222222-2222-2222-2222-222222222223', 'c1111111-1111-1111-1111-111111111111', 'sistema-conexion-en-curso-test', gen_random_uuid());

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave, tiempo_max_seg) values
  ('c1111111-1111-1111-1111-111111111114', 'c1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111112', 'reporte-c1', 600),
  ('c1111111-1111-1111-1111-111111111115', 'c1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111112', 'reporte-c2', 600),
  ('c2222222-2222-2222-2222-222222222226', 'c1111111-1111-1111-1111-111111111111', 'c2222222-2222-2222-2222-222222222223', 'reporte-c3', 600);

select has_function('private', 'conexion_en_curso', array['uuid'], 'existe la función');

select ok(
  not (select private.conexion_en_curso('c1111111-1111-1111-1111-111111111112')),
  'sin ninguna ejecución en_curso: false'
);

insert into ejecuciones_worker (id, organizacion_id, conexion_id, capacidad_id, origen, estado, iniciada_en) values
  ('c1000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111112', 'c1111111-1111-1111-1111-111111111114', 'kestra', 'en_curso', now());

select ok(
  (select private.conexion_en_curso('c1111111-1111-1111-1111-111111111112')),
  'una capacidad en_curso de la conexión alcanza, no hace falta que sea la MISMA capacidad consultada'
);

select ok(
  not (select private.conexion_en_curso('c2222222-2222-2222-2222-222222222223')),
  'una conexión distinta, aunque sea del mismo sistema_externo, no se ve afectada'
);

update ejecuciones_worker set iniciada_en = now() - interval '11 minutes' where id = 'c1000000-0000-0000-0000-000000000001';

select ok(
  not (select private.conexion_en_curso('c1111111-1111-1111-1111-111111111112')),
  'una ejecución en_curso que superó tiempo_max_seg (600s) ya no está vigente: no bloquea para siempre'
);

update ejecuciones_worker set estado = 'exitosa', finalizada_en = now() where id = 'c1000000-0000-0000-0000-000000000001';

select ok(
  not (select private.conexion_en_curso('c1111111-1111-1111-1111-111111111112')),
  'una ejecución ya finalizada (exitosa) no bloquea, sin esperar a que venza el timeout'
);

insert into ejecuciones_worker (id, organizacion_id, conexion_id, capacidad_id, origen, estado, iniciada_en) values
  ('c1000000-0000-0000-0000-000000000002', 'c1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111112', 'c1111111-1111-1111-1111-111111111115', 'kestra', 'en_curso', now());

select ok(
  (select private.conexion_en_curso('c1111111-1111-1111-1111-111111111112')),
  'una ejecución en_curso de OTRA capacidad de la misma conexión (reporte-c2) también bloquea'
);

select * from finish();
rollback;
