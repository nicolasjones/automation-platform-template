-- Bug real 2026-10-08 (producto estudio-contable-automation): dos
-- capacidades de la misma conexión (Colppy Libro Mayor e IVA Compras de la
-- misma cuenta) corrieron en paralelo sin bloquearse, reproducido en vivo
-- contra la cuenta real -- una completó, la otra fue rechazada por el
-- sistema externo (sesión única). iniciar_ejecucion_worker ahora generaliza
-- el bloqueo de YA_EN_CURSO (por capacidad) a CONEXION_EN_CURSO (por
-- conexión, cualquier capacidad), para los 3 orígenes (manual/programada/
-- kestra) sin necesidad de un chequeo externo por flow.
begin;

select plan(5);

insert into organizaciones (id, nombre) values
  ('d1111111-1111-1111-1111-111111111111', 'Organización conexion en curso worker');

insert into auth.users (id, email) values
  ('d5000000-0000-0000-0000-000000000005', 'admin-conexion-en-curso@example.com');

insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('d5000000-0000-0000-0000-000000000005', 'd1111111-1111-1111-1111-111111111111', 'administrador');

insert into sistemas_externos (id, descripcion) values
  ('sistema-iew-conexion-curso-test', 'Sistema de fixture para iniciar_ejecucion_worker_conexion_en_curso.test.sql, sin valor de negocio');

insert into conexiones (id, organizacion_id, sistema_externo, credencial_vault_id) values
  ('d1111111-1111-1111-1111-111111111112', 'd1111111-1111-1111-1111-111111111111', 'sistema-iew-conexion-curso-test', gen_random_uuid());

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave, tiempo_max_seg) values
  ('d1111111-1111-1111-1111-111111111114', 'd1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111112', 'libro-mayor', 600),
  ('d1111111-1111-1111-1111-111111111115', 'd1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111112', 'iva-compras', 600);

-- autorizar_llamante_ciclo exige un llamante reconocido (superusuario,
-- kestra_orquestacion, worker_<org> o un administrador authenticated de la
-- organización) -- mismo patrón que ciclo_ejecuciones_workers.test.sql.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.iniciar_ejecucion_worker('d1111111-1111-1111-1111-111111111112', 'libro-mayor', 'kestra') $$,
  'primera capacidad de la conexión arranca sin problema'
);

select throws_like(
  $$ select public.iniciar_ejecucion_worker('d1111111-1111-1111-1111-111111111112', 'iva-compras', 'kestra') $$,
  'CONEXION_EN_CURSO%',
  'una SEGUNDA capacidad de la MISMA conexión, con la primera todavía en_curso, queda bloqueada'
);

-- authenticated no tiene UPDATE directo sobre ejecuciones_worker (solo vía
-- las funciones security definer) -- se vuelve al rol de conexión para este
-- housekeeping de fixture, igual que ciclo_ejecuciones_workers.test.sql.
reset role;
update public.ejecuciones_worker set estado = 'exitosa', finalizada_en = now()
where conexion_id = 'd1111111-1111-1111-1111-111111111112' and capacidad_id = 'd1111111-1111-1111-1111-111111111114';
set local role authenticated;

select lives_ok(
  $$ select public.iniciar_ejecucion_worker('d1111111-1111-1111-1111-111111111112', 'iva-compras', 'kestra') $$,
  'al cerrar la primera, la segunda capacidad de la misma conexión puede arrancar'
);

select throws_like(
  $$ select public.iniciar_ejecucion_worker('d1111111-1111-1111-1111-111111111112', 'iva-compras', 'kestra') $$,
  'YA_EN_CURSO%',
  'la MISMA capacidad en curso sigue reportando YA_EN_CURSO (mensaje específico), no el genérico CONEXION_EN_CURSO'
);

reset role;
update public.ejecuciones_worker set iniciada_en = now() - interval '11 minutes'
where conexion_id = 'd1111111-1111-1111-1111-111111111112' and capacidad_id = 'd1111111-1111-1111-1111-111111111115';
set local role authenticated;

select lives_ok(
  $$ select public.iniciar_ejecucion_worker('d1111111-1111-1111-1111-111111111112', 'libro-mayor', 'kestra') $$,
  'una ejecución en_curso de OTRA capacidad que venció su tiempo_max_seg se limpia sola y no bloquea la conexión'
);

select * from finish();
rollback;
