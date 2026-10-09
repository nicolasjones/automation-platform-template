-- Ciclo de ejecuciones de workers (spec 016). Ver
-- specs/016-ciclo-ejecuciones-workers/data-model.md y contracts/.
--
-- Mismo criterio que orquestacion_multi_organizacion.test.sql: las llamadas
-- que solo kestra_orquestacion o un rol worker_* pueden hacer se ejecutan
-- como postgres directamente (dueño de las funciones, el revoke no le
-- aplica) para probar su lógica de negocio, y por separado se confirma con
-- has_function_privilege que el GRANT real está bien puesto. El punta a
-- punta con cada rol de verdad es responsabilidad de quickstart.md.
begin;

select plan(62);

-- ============================================================================
-- Fixture
-- ============================================================================

insert into organizaciones (id, nombre) values
  ('e1111111-1111-1111-1111-111111111111', 'Organización X'),
  ('e2222222-2222-2222-2222-222222222222', 'Organización Y');

insert into auth.users (id, email) values
  ('e5000000-0000-0000-0000-000000000005', 'superadmin-ciclo@example.com'),
  ('e1000000-0000-0000-0000-000000000001', 'admin-x-ciclo@example.com'),
  ('e2000000-0000-0000-0000-000000000001', 'admin-y-ciclo@example.com'),
  ('e3000000-0000-0000-0000-000000000001', 'miembro-x-ciclo@example.com');

insert into superadmins (user_id) values ('e5000000-0000-0000-0000-000000000005');

insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('e1000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', 'administrador'),
  ('e2000000-0000-0000-0000-000000000001', 'e2222222-2222-2222-2222-222222222222', 'administrador'),
  ('e3000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', 'miembro');

-- Fixture de catálogo (spec catálogo-sistemas-externos): conexiones.sistema_externo
-- ahora tiene FK a sistemas_externos.
insert into sistemas_externos (id, descripcion) values
  ('sistema-x', 'Sistema X (fixture de test, sin valor de negocio)'),
  ('sistema-y', 'Sistema Y (fixture de test, sin valor de negocio)'),
  ('sistema-x-inactivo', 'Sistema X inactivo (fixture de test, sin valor de negocio)');

insert into conexiones (id, organizacion_id, sistema_externo, credencial_vault_id) values
  ('e1111111-1111-1111-1111-111111111112', 'e1111111-1111-1111-1111-111111111111', 'sistema-x', gen_random_uuid()),
  ('e2222222-2222-2222-2222-222222222223', 'e2222222-2222-2222-2222-222222222222', 'sistema-y', gen_random_uuid());

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave) values
  ('e1111111-1111-1111-1111-111111111113', 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111112', 'reporte-x'),
  ('e2222222-2222-2222-2222-222222222224', 'e2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222223', 'reporte-y');

insert into ejecuciones_worker (organizacion_id, conexion_id, capacidad_id, origen, estado) values
  ('e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111112', 'e1111111-1111-1111-1111-111111111113', 'kestra', 'en_curso'),
  ('e2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222223', 'e2222222-2222-2222-2222-222222222224', 'kestra', 'en_curso');

insert into adopciones_template (origen, version) values ('ciclo-ejecuciones', '016');

-- ============================================================================
-- Aislamiento RLS entre organizaciones (SC-003, FR-007)
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from capacidades_ejecucion where organizacion_id = 'e1111111-1111-1111-1111-111111111111'),
  1::bigint,
  'admin de X ve su capacidad'
);

select is(
  (select count(*) from capacidades_ejecucion where organizacion_id = 'e2222222-2222-2222-2222-222222222222'),
  0::bigint,
  'admin de X no ve la capacidad de Y'
);

select is(
  (select count(*) from ejecuciones_worker where organizacion_id = 'e1111111-1111-1111-1111-111111111111'),
  1::bigint,
  'admin de X ve su ejecución'
);

select is(
  (select count(*) from ejecuciones_worker where organizacion_id = 'e2222222-2222-2222-2222-222222222222'),
  0::bigint,
  'admin de X no ve la ejecución de Y'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e2000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from capacidades_ejecucion),
  1::bigint,
  'admin de Y ve solo su capacidad'
);

select is(
  (select count(*) from ejecuciones_worker),
  1::bigint,
  'admin de Y ve solo su ejecución'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from capacidades_ejecucion),
  0::bigint,
  'miembro sin permiso de auditoría no ve capacidades'
);

select is(
  (select count(*) from ejecuciones_worker),
  0::bigint,
  'miembro sin permiso de auditoría no ve ejecuciones'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from capacidades_ejecucion),
  2::bigint,
  'superadmin ve todas las capacidades'
);

select is(
  (select count(*) from ejecuciones_worker),
  2::bigint,
  'superadmin ve todas las ejecuciones'
);

select is(
  (select count(*) from adopciones_template),
  1::bigint,
  'superadmin ve la versión adoptada'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*) from adopciones_template),
  0::bigint,
  'admin de organización no ve adopciones (solo superadmin)'
);

reset role;

-- ============================================================================
-- US1: iniciar sin duplicar (FR-002, FR-003, FR-004)
-- ============================================================================

-- Las dos filas en_curso del fixture inicial (líneas 50-52) solo servían de
-- lectura para el aislamiento RLS de arriba (nunca chequean estado): a partir
-- de aquí CONEXION_EN_CURSO (bug real 2026-10-08) las tomaría como "ya hay
-- una ejecución activa" de su propia conexión y bloquearía cada intento
-- siguiente sobre esa misma conexión. Se cierran para no mezclar esa
-- verificación con la de este bloque.
update ejecuciones_worker set estado = 'exitosa', finalizada_en = clock_timestamp()
where capacidad_id in ('e1111111-1111-1111-1111-111111111113', 'e2222222-2222-2222-2222-222222222224');

insert into conexiones (id, organizacion_id, sistema_externo, estado, credencial_vault_id) values
  ('e1111111-1111-1111-1111-111111111114', 'e1111111-1111-1111-1111-111111111111', 'sistema-x-inactivo', 'credencial_invalida', gen_random_uuid()),
  -- Conexiones propias para reporte-x4/reporte-x6: sus assertions verifican
  -- actor/detalle, no concurrencia -- comparten conexion_id con reporte-x2
  -- (deliberadamente dejada en_curso para el test de timeout más abajo) las
  -- bloquearía con CONEXION_EN_CURSO sin relación con lo que de verdad prueban.
  ('e1111111-1111-1111-1111-111111111121', 'e1111111-1111-1111-1111-111111111111', 'sistema-x', 'activa', gen_random_uuid()),
  ('e1111111-1111-1111-1111-111111111122', 'e1111111-1111-1111-1111-111111111111', 'sistema-x', 'activa', gen_random_uuid());

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave, habilitada) values
  ('e1111111-1111-1111-1111-111111111115', 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111112', 'reporte-x2', true),
  ('e1111111-1111-1111-1111-111111111116', 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111112', 'reporte-x3', false),
  ('e1111111-1111-1111-1111-111111111117', 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111114', 'reporte-inactivo', true),
  ('e1111111-1111-1111-1111-111111111118', 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111121', 'reporte-x4', true),
  ('e1111111-1111-1111-1111-111111111120', 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111122', 'reporte-x6', true),
  ('e2222222-2222-2222-2222-222222222225', 'e2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222223', 'reporte-y2', true);

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111112', 'reporte-x2', 'kestra')$$,
  'inicia una ejecución kestra autorizada'
);

select throws_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111112', 'reporte-x2', 'kestra')$$,
  'P0001',
  'YA_EN_CURSO: ya hay una ejecución activa para esta organización y capacidad',
  'el segundo intento concurrente se rechaza sin duplicar'
);

select is(
  (select count(*) from ejecuciones_worker where capacidad_id = 'e1111111-1111-1111-1111-111111111115' and estado = 'en_curso'),
  1::bigint,
  'sigue habiendo una sola ejecución activa para esa capacidad'
);

select lives_ok(
  $$select iniciar_ejecucion_worker('e2222222-2222-2222-2222-222222222223', 'reporte-y2', 'programada')$$,
  'una capacidad distinta de la misma plataforma no queda bloqueada'
);

select throws_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111112', 'reporte-x3', 'kestra')$$,
  'P0001',
  'CAPACIDAD_NO_HABILITADA: reporte-x3 no está registrada y habilitada para la conexión e1111111-1111-1111-1111-111111111112',
  'una capacidad deshabilitada se rechaza'
);

-- Bug conexion-invalida-trabada: error ya no bloquea (FR-013); una conexión
-- con la credencial rechazada sigue sin correr fuera del disparo manual.
select throws_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111114', 'reporte-inactivo', 'kestra')$$,
  'P0001',
  'CONEXION_CREDENCIAL_INVALIDA: la conexión e1111111-1111-1111-1111-111111111114 tiene la credencial rechazada; actualizala o iniciá la ejecución manualmente',
  'una conexión con la credencial rechazada no corre por Kestra'
);

select throws_ok(
  $$select iniciar_ejecucion_worker('00000000-0000-0000-0000-000000000000', 'reporte-x', 'kestra')$$,
  'P0001',
  'CONEXION_DESCONOCIDA: 00000000-0000-0000-0000-000000000000',
  'una conexión inexistente se rechaza'
);

select throws_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111112', 'reporte-x2', 'sms')$$,
  'P0001',
  'ORIGEN_INVALIDO: sms no es manual, programada ni kestra',
  'un origen arbitrario se rechaza'
);

select throws_ok(
  $$select iniciar_ejecucion_worker('e2222222-2222-2222-2222-222222222223', 'reporte-y2', 'manual')$$,
  'P0001',
  'ACTOR_REQUERIDO: un disparo manual debe registrar quién lo inició',
  'un disparo manual sin actor se rechaza'
);

select lives_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111121', 'reporte-x4', 'manual', 'e1000000-0000-0000-0000-000000000001')$$,
  'un disparo manual con actor se registra'
);

select is(
  (select actor from ejecuciones_worker where capacidad_id = 'e1111111-1111-1111-1111-111111111118'),
  'e1000000-0000-0000-0000-000000000001'::uuid,
  'el actor del disparo manual queda auditado'
);

-- p_detalle (parámetro nuevo): queda en la fila desde el propio INSERT, no
-- recién al cerrar -- lo necesita un trigger AFTER INSERT sobre
-- ejecuciones_worker que lea datos de la corrida (motivador real: un rango
-- de fechas elegido en un disparo manual).
select lives_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111122', 'reporte-x6', 'kestra', null, '{"rango": "2026-01"}'::jsonb)$$,
  'p_detalle es un parámetro opcional aceptado por iniciar_ejecucion_worker'
);

select is(
  (select detalle from ejecuciones_worker where capacidad_id = 'e1111111-1111-1111-1111-111111111120'),
  '{"rango": "2026-01"}'::jsonb,
  'el detalle pasado a iniciar_ejecucion_worker queda en la fila desde el INSERT'
);

select is(
  (select detalle from ejecuciones_worker where capacidad_id = 'e1111111-1111-1111-1111-111111111115'),
  '{}'::jsonb,
  'sin p_detalle, la fila arranca con detalle vacío (default, compatible con las llamadas existentes)'
);

reset role;

-- Timeout: la ejecución vigente supera su tiempo máximo (R2/FR-003).
update capacidades_ejecucion set tiempo_max_seg = 1 where id = 'e1111111-1111-1111-1111-111111111115';
update ejecuciones_worker set iniciada_en = clock_timestamp() - interval '10 seconds'
  where capacidad_id = 'e1111111-1111-1111-1111-111111111115' and estado = 'en_curso';

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111112', 'reporte-x2', 'kestra')$$,
  'tras el timeout un nuevo intento puede comenzar'
);

select is(
  (select estado from ejecuciones_worker where capacidad_id = 'e1111111-1111-1111-1111-111111111115' order by iniciada_en limit 1),
  'timeout',
  'la ejecución vencida queda cerrada como timeout'
);

select is(
  (select motivo_sanitizado from ejecuciones_worker where capacidad_id = 'e1111111-1111-1111-1111-111111111115' order by iniciada_en limit 1),
  'TIMEOUT:1s',
  'el timeout queda identificado con su tiempo máximo'
);

select is(
  (select count(*) from ejecuciones_worker where capacidad_id = 'e1111111-1111-1111-1111-111111111115' and estado = 'en_curso'),
  1::bigint,
  'tras el timeout hay una sola activa nueva'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e2000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111121', 'reporte-x4', 'kestra')$$,
  'P0001',
  'NO_AUTORIZADO: se requiere ser administrador de la organización e1111111-1111-1111-1111-111111111111',
  'un admin de otra organización no puede iniciar (antes que YA_EN_CURSO)'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111121', 'reporte-x4', 'kestra')$$,
  'P0001',
  'NO_AUTORIZADO: se requiere ser administrador de la organización e1111111-1111-1111-1111-111111111111',
  'un miembro sin permiso no puede iniciar'
);

reset role;

select is(
  has_function_privilege('kestra_orquestacion', 'public.iniciar_ejecucion_worker(uuid, text, text, uuid, jsonb)', 'EXECUTE'),
  true,
  'kestra_orquestacion puede ejecutar iniciar_ejecucion'
);

select is(
  has_function_privilege('authenticated', 'public.iniciar_ejecucion_worker(uuid, text, text, uuid, jsonb)', 'EXECUTE'),
  true,
  'authenticated puede ejecutar iniciar_ejecucion (el permiso fino vive adentro)'
);

select is(
  has_function_privilege('anon', 'public.iniciar_ejecucion_worker(uuid, text, text, uuid, jsonb)', 'EXECUTE'),
  false,
  'anon no puede ejecutar iniciar_ejecucion'
);

reset role;

-- ============================================================================
-- US2: cerrar con evidencia aislada (FR-005, FR-006, FR-009)
-- ============================================================================

-- reporte-x2 (reiniciada tras el timeout más arriba) ya cumplió su propósito
-- y nada de acá en adelante la vuelve a referenciar: se cierra para que
-- reporte-x5, nueva capacidad de la MISMA conexión, no choque con
-- CONEXION_EN_CURSO (bug real 2026-10-08, ajeno a lo que prueba esta sección).
update ejecuciones_worker set estado = 'exitosa', finalizada_en = clock_timestamp()
where capacidad_id = 'e1111111-1111-1111-1111-111111111115' and estado = 'en_curso';

create temporary table us2_ids (key text primary key, val uuid);
grant all on us2_ids to authenticated;

insert into capacidades_ejecucion (id, organizacion_id, conexion_id, clave) values
  ('e1111111-1111-1111-1111-111111111119', 'e1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111112', 'reporte-x5'),
  ('e2222222-2222-2222-2222-222222222226', 'e2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222223', 'reporte-y3');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

insert into us2_ids(key, val)
  select 'x5', iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111112', 'reporte-x5', 'kestra');

select lives_ok(
  format($$select cerrar_ejecucion_worker(%L, 'exitosa', 'OK', '{"filas": 120}'::jsonb, 'e111/reporte-x5/ej1/original.csv', 'e111/reporte-x5/ej1/evidencia.json')$$, (select val from us2_ids where key = 'x5')),
  'cierra exitosa con motivo sanitizado y rutas de evidencia'
);

select is(
  (select estado from ejecuciones_worker where id = (select val from us2_ids where key = 'x5')),
  'exitosa',
  'el cierre exitoso queda registrado'
);

select is(
  (select evidencia_path from ejecuciones_worker where id = (select val from us2_ids where key = 'x5')),
  'e111/reporte-x5/ej1/evidencia.json',
  'la evidencia del éxito queda referenciada'
);

select is(
  (select archivo_original_path from ejecuciones_worker where id = (select val from us2_ids where key = 'x5')),
  'e111/reporte-x5/ej1/original.csv',
  'el archivo original del éxito queda referenciado'
);

select throws_ok(
  format($$select cerrar_ejecucion_worker(%L, 'fallida', 'OTRO')$$, (select val from us2_ids where key = 'x5')),
  'P0001',
  format('YA_CERRADA: la ejecución %s ya está en estado exitosa', (select val from us2_ids where key = 'x5')),
  'un segundo cierre se rechaza sin alterar (YA_CERRADA)'
);

select is(
  (select estado from ejecuciones_worker where id = (select val from us2_ids where key = 'x5')),
  'exitosa',
  'el doble cierre no modifica la fila'
);

insert into us2_ids(key, val)
  select 'x5b', iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111112', 'reporte-x5', 'kestra');

select lives_ok(
  format($$select cerrar_ejecucion_worker(%L, 'fallida', 'FALLA_TECNICA_SANITIZADA')$$, (select val from us2_ids where key = 'x5b')),
  'una ejecución posterior puede cerrarse fallida sin rutas'
);

select is(
  (select evidencia_path from ejecuciones_worker where capacidad_id = 'e1111111-1111-1111-1111-111111111119' and estado = 'exitosa'),
  'e111/reporte-x5/ej1/evidencia.json',
  'la falla posterior no sustituye la evidencia del último éxito'
);

insert into us2_ids(key, val)
  select 'x5c', iniciar_ejecucion_worker('e1111111-1111-1111-1111-111111111112', 'reporte-x5', 'kestra');

select throws_ok(
  format($$select cerrar_ejecucion_worker(%L, 'fallida', 'FALLA', '{}'::jsonb, 'e111/falla.csv', 'e111/falla.json')$$, (select val from us2_ids where key = 'x5c')),
  'P0001',
  'EVIDENCIA_SOLO_EXITO: una ejecución fallida no adjunta archivo ni evidencia',
  'una fallida con rutas se rechaza'
);

select throws_ok(
  format($$select cerrar_ejecucion_worker(%L, 'timeout', 'X')$$, (select val from us2_ids where key = 'x5c')),
  'P0001',
  'ESTADO_INVALIDO: timeout no es un estado final (exitosa, fallida)',
  'timeout no es un destino manual válido'
);

select throws_ok(
  $$select cerrar_ejecucion_worker('00000000-0000-0000-0000-000000000000', 'fallida', 'X')$$,
  'P0001',
  'EJECUCION_DESCONOCIDA: 00000000-0000-0000-0000-000000000000',
  'una ejecución inexistente se rechaza'
);

select throws_ok(
  format($$select cerrar_ejecucion_worker(%L, 'fallida', 'api_key=ABC123xyz-secreta')$$, (select val from us2_ids where key = 'x5c')),
  'P0001',
  'SECRETO_DETECTADO: motivo o detalle con forma de credencial, sesión o token',
  'un motivo con forma de secreto no se persiste'
);

select throws_ok(
  format($$select cerrar_ejecucion_worker(%L, 'fallida', 'FALLA', '{"token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"}'::jsonb)$$, (select val from us2_ids where key = 'x5c')),
  'P0001',
  'SECRETO_DETECTADO: motivo o detalle con forma de credencial, sesión o token',
  'un detalle con JWT no se persiste'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e2000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  format($$select cerrar_ejecucion_worker(%L, 'fallida', 'X')$$, (select val from us2_ids where key = 'x5c')),
  'P0001',
  'NO_AUTORIZADO: se requiere ser administrador de la organización e1111111-1111-1111-1111-111111111111',
  'un admin de otra organización no puede cerrar'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  format($$select cerrar_ejecucion_worker(%L, 'fallida', 'FALLA_TECNICA_SANITIZADA')$$, (select val from us2_ids where key = 'x5c')),
  'tras los rechazos la ejecución sigue en curso y puede cerrarse'
);

reset role;

select is(
  has_function_privilege('kestra_orquestacion', 'public.cerrar_ejecucion_worker(uuid, text, text, jsonb, text, text)', 'EXECUTE'),
  true,
  'kestra_orquestacion puede ejecutar cerrar_ejecucion'
);

select is(
  has_function_privilege('authenticated', 'public.cerrar_ejecucion_worker(uuid, text, text, jsonb, text, text)', 'EXECUTE'),
  true,
  'authenticated puede ejecutar cerrar_ejecucion (el permiso fino vive adentro)'
);

select is(
  has_function_privilege('anon', 'public.cerrar_ejecucion_worker(uuid, text, text, jsonb, text, text)', 'EXECUTE'),
  false,
  'anon no puede ejecutar cerrar_ejecucion'
);

reset role;

-- ============================================================================
-- US3: adopción idempotente (FR-011, SC-005)
-- ============================================================================

delete from adopciones_template where origen = 'ciclo-ejecuciones';

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$select registrar_adopcion_ciclo('016')$$,
  'un superadmin registra la versión de origen'
);

select is(
  (select version from adopciones_template where origen = 'ciclo-ejecuciones'),
  '016',
  'la versión adoptada queda verificable'
);

select lives_ok(
  $$select registrar_adopcion_ciclo('017')$$,
  're-adoptar una versión nueva no falla'
);

select is(
  (select version from adopciones_template where origen = 'ciclo-ejecuciones'),
  '017',
  'la re-adopción actualiza la versión sin duplicar'
);

select is(
  (select count(*) from adopciones_template where origen = 'ciclo-ejecuciones'),
  1::bigint,
  'nunca hay historiales de adopción duplicados'
);

select throws_ok(
  $$select registrar_adopcion_ciclo('   ')$$,
  'P0001',
  'VERSION_REQUERIDA: hay que indicar la versión del template de origen',
  'una versión vacía se rechaza'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select registrar_adopcion_ciclo('016')$$,
  'P0001',
  'NO_AUTORIZADO: solo un superadmin registra la adopción del ciclo',
  'un admin de organización no puede registrar adopción'
);

reset role;

select is(
  has_function_privilege('authenticated', 'public.registrar_adopcion_ciclo(text)', 'EXECUTE'),
  true,
  'authenticated puede ejecutar registrar_adopcion_ciclo (el permiso fino vive adentro)'
);

select is(
  has_function_privilege('anon', 'public.registrar_adopcion_ciclo(text)', 'EXECUTE'),
  false,
  'anon no puede ejecutar registrar_adopcion_ciclo'
);

select * from finish();
rollback;
