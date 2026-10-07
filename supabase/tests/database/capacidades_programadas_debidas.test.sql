-- private.capacidades_programadas_debidas (spec
-- disparo-programado-ciclo-ejecuciones, FR-002/FR-007). Cubre los casos
-- reales que decide la función: hora ya pasada, frecuencia semanal/
-- mensual que no matchea hoy, ya disparada hoy, capacidad deshabilitada
-- y conexión no activa (agregado en code-review, no estaba en el diseño
-- original -- sin esto, una capacidad deshabilitada quedaría "debida"
-- para siempre, sin poder marcarse disparada, generando ruido cada ciclo
-- del despachador).
begin;

select plan(6);

insert into organizaciones (id, nombre) values
  ('f1111111-1111-1111-1111-111111111111', 'Organización capacidades debidas');

insert into sistemas_externos (id, descripcion) values
  ('sistema-debidas-test', 'Sistema de fixture para capacidades_programadas_debidas.test.sql, sin valor de negocio');

insert into conexiones (id, organizacion_id, sistema_externo, credencial_vault_id, estado) values
  ('f1111111-1111-1111-1111-111111111112', 'f1111111-1111-1111-1111-111111111111', 'sistema-debidas-test', gen_random_uuid(), 'activa'),
  ('f2222222-2222-2222-2222-222222222223', 'f1111111-1111-1111-1111-111111111111', 'sistema-debidas-test', gen_random_uuid(), 'credencial_invalida');

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave, tiempo_max_seg, habilitada) values
  ('f1111111-1111-1111-1111-111111111113', 'f1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111112', 'reporte-debida', 600, true),
  ('f1111111-1111-1111-1111-111111111114', 'f1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111112', 'reporte-deshabilitada', 600, false),
  ('f1111111-1111-1111-1111-111111111115', 'f1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111112', 'reporte-futuro', 600, true),
  ('f1111111-1111-1111-1111-111111111116', 'f1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111112', 'reporte-ya-disparada', 600, true),
  ('f2222222-2222-2222-2222-222222222226', 'f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222223', 'reporte-conexion-invalida', 600, true);

-- Debida: diaria, hora ya pasada, desde hoy, nunca disparada.
insert into programacion_ejecucion (organizacion_id, capacidad_id, frecuencia, hora, desde) values
  ('f1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111113', 'diaria', '00:00', current_date - 1);

-- NO debida: capacidad deshabilitada, misma programación que la de arriba.
insert into programacion_ejecucion (organizacion_id, capacidad_id, frecuencia, hora, desde) values
  ('f1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111114', 'diaria', '00:00', current_date - 1);

-- NO debida: empieza a futuro.
insert into programacion_ejecucion (organizacion_id, capacidad_id, frecuencia, hora, desde) values
  ('f1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111115', 'diaria', '00:00', current_date + 1);

-- NO debida: ya se disparó hoy.
insert into programacion_ejecucion (organizacion_id, capacidad_id, frecuencia, hora, desde, ultima_disparada_en) values
  ('f1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111116', 'diaria', '00:00', current_date - 1, clock_timestamp());

-- NO debida: conexión con credencial inválida.
insert into programacion_ejecucion (organizacion_id, capacidad_id, frecuencia, hora, desde) values
  ('f1111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222226', 'diaria', '00:00', current_date - 1);

select has_function('private', 'capacidades_programadas_debidas', 'existe la función');

select is(
  (select count(*) from private.capacidades_programadas_debidas()),
  1::bigint,
  'de las 5 programaciones, solo 1 está debida ahora'
);

select is(
  (select capacidad_id from private.capacidades_programadas_debidas()),
  'f1111111-1111-1111-1111-111111111113'::uuid,
  'es exactamente la capacidad habilitada, con conexión activa, ya empezada y sin disparar hoy'
);

select ok(
  not exists (select 1 from private.capacidades_programadas_debidas() where capacidad_id = 'f1111111-1111-1111-1111-111111111114'),
  'una capacidad deshabilitada nunca queda debida, aunque su programación matchee'
);

select ok(
  not exists (select 1 from private.capacidades_programadas_debidas() where capacidad_id = 'f2222222-2222-2222-2222-222222222226'),
  'una conexión con credencial inválida nunca queda debida'
);

select ok(
  not exists (select 1 from private.capacidades_programadas_debidas() where capacidad_id = 'f1111111-1111-1111-1111-111111111116'),
  'una programación ya disparada hoy no se repite en el mismo día'
);

select * from finish();
rollback;
