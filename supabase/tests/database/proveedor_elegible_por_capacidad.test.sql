-- Proveedor elegible por capacidad. Ver
-- specs/20261005-120000-proveedor-elegible-por-capacidad/data-model.md y
-- contracts/rpc.md.
begin;

select plan(39);

-- ============================================================================
-- Fixture
-- ============================================================================

insert into organizaciones (id, nombre) values
  ('a1111111-1111-1111-1111-111111111111', 'Organización X'),
  ('a2222222-2222-2222-2222-222222222222', 'Organización Y');

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'admin-x-pec@example.com'),
  ('a1000000-0000-0000-0000-000000000002', 'miembro-x-pec@example.com'),
  ('a2000000-0000-0000-0000-000000000001', 'admin-y-pec@example.com');

insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('a1000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'administrador'),
  ('a1000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'miembro'),
  ('a2000000-0000-0000-0000-000000000001', 'a2222222-2222-2222-2222-222222222222', 'administrador');

insert into clientes (id, organizacion_id, nombre) values
  ('a3000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'Cliente X1'),
  ('a3000000-0000-0000-0000-000000000002', 'a2222222-2222-2222-2222-222222222222', 'Cliente Y1');

-- Catálogo de prueba: capacidad con dos proveedores, uno de ellos exige
-- conexión a un sistema externo y envía credencial a un tercero (misma
-- forma que "Mis Facilidades" -> arca/afip_sdk en el producto de origen).
insert into sistemas_externos (id, descripcion) values
  ('propio', 'Automatización propia (sistema objetivo de prueba, pgTAP)'),
  ('externo', 'Proveedor externo de prueba (pgTAP)'),
  ('unico', 'Único proveedor de prueba (pgTAP)'),
  ('sistema-externo-pec', 'Sistema externo que exige conexión de organización (pgTAP)');

insert into capacidades_proveedores (
  capacidad, proveedor, nombre_visible, clave_ejecucion, es_default,
  requiere_conexion_organizacion, envia_credencial_a_tercero, activo
) values
  ('capacidad-prueba', 'propio', 'Automatización propia', 'propio_capacidad_prueba', true, null, false, true),
  ('capacidad-prueba', 'externo', 'Proveedor externo', 'externo_capacidad_prueba', false, 'sistema-externo-pec', true, true),
  ('capacidad-unica', 'unico', 'Único proveedor', 'unico_capacidad_unica', true, null, false, true);

create temporary table t_ids (key text primary key, val bigint);
grant all on t_ids to authenticated;

-- ============================================================================
-- Fundamentos: sin grant de insert/update/delete a authenticated
-- ============================================================================

select is(has_table_privilege('authenticated', 'proveedor_capacidad_organizacion', 'INSERT'), false,
  'authenticated no tiene INSERT directo sobre proveedor_capacidad_organizacion');
select is(has_table_privilege('authenticated', 'proveedor_capacidad_cliente', 'INSERT'), false,
  'authenticated no tiene INSERT directo sobre proveedor_capacidad_cliente');
select is(has_table_privilege('authenticated', 'eventos_proveedor_capacidad', 'UPDATE'), false,
  'authenticated no tiene UPDATE directo sobre eventos_proveedor_capacidad');
select is(has_table_privilege('authenticated', 'capacidades_proveedores', 'INSERT'), false,
  'authenticated no tiene INSERT directo sobre capacidades_proveedores (catálogo de solo lectura)');

-- ============================================================================
-- Catálogo visible y default sin ninguna elección
-- ============================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from capacidades_proveedores where capacidad = 'capacidad-prueba'),
  2,
  'un miembro ve el catálogo completo de la capacidad (solo lectura)'
);

select results_eq(
  $$select proveedor, nombre_visible, origen, disponible from proveedores_capacidad_de_organizacion() where capacidad = 'capacidad-prueba'$$,
  $$values ('propio'::text, 'Automatización propia'::text, 'catalogo'::text, true)$$,
  'sin elección, la organización resuelve el default del catálogo (propio)'
);

select is(
  (select count(*)::int from proveedores_capacidad_de_organizacion() where capacidad = 'capacidad-unica'),
  0,
  'una capacidad con un único proveedor activo no aparece en la pantalla de organización (Edge Case)'
);

reset role;

-- ============================================================================
-- Historia 1: elegir_proveedor_capacidad_organizacion (FR-001, FR-002,
-- FR-005, FR-006, FR-007, FR-008)
-- ============================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$select elegir_proveedor_capacidad_organizacion('capacidad-prueba', 'externo', true)$$,
  'P0001',
  'NO_AUTORIZADO: se requiere ser administrador de la organización',
  'un miembro sin rol administrador no puede elegir proveedor de organización (FR-008)'
);

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$select elegir_proveedor_capacidad_organizacion('capacidad-prueba', 'inexistente', true)$$,
  'P0001',
  null,
  'elegir un proveedor que no está en el catálogo activo falla (PROVEEDOR_INEXISTENTE)'
);

select throws_ok(
  $$select elegir_proveedor_capacidad_organizacion('capacidad-prueba', 'externo', false)$$,
  'P0001',
  null,
  'elegir un proveedor que requiere conexión sin tenerla falla (PROVEEDOR_SIN_CONEXION, FR-005)'
);

-- Crea la conexión requerida (como postgres: authenticated no tiene INSERT
-- directo sobre conexiones, igual que sobre las tablas de esta spec), pero
-- sin aceptar el envío de credencial.
reset role;

insert into conexiones (id, organizacion_id, sistema_externo, estado, credencial_vault_id) values
  ('a4000000-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111', 'sistema-externo-pec', 'activa', gen_random_uuid());

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$select elegir_proveedor_capacidad_organizacion('capacidad-prueba', 'externo', false)$$,
  'P0001',
  null,
  'con conexión pero sin aceptar el envío de credencial falla (ACEPTACION_REQUERIDA, FR-006)'
);

select lives_ok(
  $$select elegir_proveedor_capacidad_organizacion('capacidad-prueba', 'externo', true)$$,
  'con conexión y aceptación explícita, la elección se registra (FR-001, FR-002)'
);

select is(
  (select proveedor from proveedor_capacidad_organizacion where organizacion_id = 'a1111111-1111-1111-1111-111111111111' and capacidad = 'capacidad-prueba'),
  'externo',
  'la organización queda con el proveedor externo elegido'
);

select isnt(
  (select acepto_envio_credencial_en from proveedor_capacidad_organizacion where organizacion_id = 'a1111111-1111-1111-1111-111111111111' and capacidad = 'capacidad-prueba'),
  null,
  'la aceptación de envío de credencial queda registrada con su momento'
);

select is(
  (select count(*)::int from eventos_proveedor_capacidad where organizacion_id = 'a1111111-1111-1111-1111-111111111111' and capacidad = 'capacidad-prueba' and proveedor_nuevo = 'externo' and actor = 'a1000000-0000-0000-0000-000000000001'),
  1,
  'la elección queda auditada con actor y proveedor nuevo (FR-007)'
);

select results_eq(
  $$select proveedor, origen, disponible from proveedores_capacidad_de_organizacion() where capacidad = 'capacidad-prueba'$$,
  $$values ('externo'::text, 'organizacion'::text, true)$$,
  'la resolución de organización ahora devuelve el proveedor externo, disponible'
);

reset role;

-- ============================================================================
-- Conexión inválida: no disponible, sin sustituir (FR-005, R3, SC-004)
-- ============================================================================

update conexiones set estado = 'credencial_invalida' where id = 'a4000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  $$select proveedor, origen, disponible from proveedores_capacidad_de_organizacion() where capacidad = 'capacidad-prueba'$$,
  $$values ('externo'::text, 'organizacion'::text, false)$$,
  'conexión inválida: sigue siendo "externo" (no sustituye) pero no disponible (SC-004)'
);

reset role;

select is(
  (select motivo_no_disponible from private.resolver_proveedor_capacidad('a1111111-1111-1111-1111-111111111111', null, 'capacidad-prueba')),
  'CONEXION_INVALIDA',
  'el motivo de no disponibilidad es CONEXION_INVALIDA'
);

delete from conexiones where id = 'a4000000-0000-0000-0000-000000000001';

select is(
  (select motivo_no_disponible from private.resolver_proveedor_capacidad('a1111111-1111-1111-1111-111111111111', null, 'capacidad-prueba')),
  'SIN_CONEXION',
  'sin ninguna conexión al sistema externo, el motivo es SIN_CONEXION'
);

select is(
  (select proveedor from private.resolver_proveedor_capacidad('a1111111-1111-1111-1111-111111111111', null, 'capacidad-prueba')),
  'externo',
  'incluso sin conexión, el proveedor efectivo sigue siendo el elegido (no se sustituye solo)'
);

-- Restaurar conexión activa para los casos siguientes.
insert into conexiones (id, organizacion_id, sistema_externo, estado, credencial_vault_id) values
  ('a4000000-0000-0000-0000-000000000002', 'a1111111-1111-1111-1111-111111111111', 'sistema-externo-pec', 'activa', gen_random_uuid());

-- ============================================================================
-- Historia 2: excepción por cliente (FR-003, FR-004, SC-003)
-- ============================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$select elegir_proveedor_capacidad_cliente('a3000000-0000-0000-0000-000000000002', 'capacidad-prueba', 'propio', false)$$,
  'P0001',
  null,
  'el administrador de X no puede elegir proveedor para un cliente de Y (aislamiento)'
);

select lives_ok(
  $$select elegir_proveedor_capacidad_cliente('a3000000-0000-0000-0000-000000000001', 'capacidad-prueba', 'propio', false)$$,
  'el administrador de X pone a su cliente en el proveedor propio (excepción, FR-003)'
);

-- private.resolver_proveedor_capacidad solo la ejecutan kestra_orquestacion
-- / workers_orquestacion (contracts/rpc.md); se consulta acá como postgres
-- (dueño de la función) para verificar la resolución directamente, no como
-- lo haría el panel (que usa las funciones públicas de más abajo).
reset role;

select results_eq(
  $$select proveedor, origen from private.resolver_proveedor_capacidad('a1111111-1111-1111-1111-111111111111', 'a3000000-0000-0000-0000-000000000001', 'capacidad-prueba')$$,
  $$values ('propio'::text, 'cliente'::text)$$,
  'el cliente con excepción resuelve "propio" vía origen cliente (precedencia cliente > organización)'
);

select results_eq(
  $$select proveedor, origen from private.resolver_proveedor_capacidad('a1111111-1111-1111-1111-111111111111', null, 'capacidad-prueba')$$,
  $$values ('externo'::text, 'organizacion'::text)$$,
  'un cliente sin excepción (o sin cliente puntual) sigue heredando el default de organización'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$select quitar_proveedor_capacidad_cliente('a3000000-0000-0000-0000-000000000001', 'capacidad-prueba')$$,
  'quitar la excepción no falla'
);

reset role;

select results_eq(
  $$select proveedor, origen from private.resolver_proveedor_capacidad('a1111111-1111-1111-1111-111111111111', 'a3000000-0000-0000-0000-000000000001', 'capacidad-prueba')$$,
  $$values ('externo'::text, 'organizacion'::text)$$,
  'tras quitar la excepción, el cliente vuelve a heredar el default de organización (FR-003)'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$select quitar_proveedor_capacidad_cliente('a3000000-0000-0000-0000-000000000001', 'capacidad-prueba')$$,
  'quitar una excepción que ya no existe es un no-op'
);

-- Vuelve a dejar una excepción para probar el evento y la lectura por
-- ficha de cliente.
select elegir_proveedor_capacidad_cliente('a3000000-0000-0000-0000-000000000001', 'capacidad-prueba', 'propio', false);

select is(
  (select count(*)::int from eventos_proveedor_capacidad where cliente_id = 'a3000000-0000-0000-0000-000000000001' and capacidad = 'capacidad-prueba'),
  3,
  'alta + baja + alta de la excepción del cliente quedan las tres auditadas (FR-007)'
);

reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', 'a1000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  $$select proveedor, nombre_visible, origen from proveedores_efectivos_de_cliente('a3000000-0000-0000-0000-000000000001') where capacidad = 'capacidad-prueba'$$,
  $$values ('propio'::text, 'Automatización propia'::text, 'cliente'::text)$$,
  'la ficha del cliente muestra el proveedor elegido para él y su nombre legible (FR-011)'
);

select throws_ok(
  $$select proveedores_efectivos_de_cliente('a3000000-0000-0000-0000-000000000002')$$,
  'P0001',
  null,
  'un miembro de X no puede leer los proveedores efectivos de un cliente de Y (aislamiento, SC-003)'
);

reset role;

-- ============================================================================
-- Aislamiento entre organizaciones (RLS)
-- ============================================================================

select set_config('request.jwt.claims',
  json_build_object('sub', 'a2000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from proveedor_capacidad_organizacion where organizacion_id = 'a1111111-1111-1111-1111-111111111111'),
  0,
  'un usuario de Y no ve las elecciones de organización de X (RLS)'
);

select is(
  (select count(*)::int from proveedor_capacidad_cliente where organizacion_id = 'a1111111-1111-1111-1111-111111111111'),
  0,
  'un usuario de Y no ve las excepciones de cliente de X (RLS)'
);

select is(
  (select count(*)::int from eventos_proveedor_capacidad where organizacion_id = 'a1111111-1111-1111-1111-111111111111'),
  0,
  'un usuario de Y no ve los eventos de X (RLS)'
);

select throws_ok(
  $$select elegir_proveedor_capacidad_cliente('a3000000-0000-0000-0000-000000000001', 'capacidad-prueba', 'propio', false)$$,
  'P0001',
  null,
  'el administrador de Y no puede elegir proveedor para un cliente de X'
);

reset role;

-- ============================================================================
-- Cliente borrado: se borran sus excepciones; los eventos sobreviven
-- huérfanos (Edge Cases)
-- ============================================================================

insert into t_ids (key, val)
select 'evento_cliente_x1', id
from eventos_proveedor_capacidad
where cliente_id = 'a3000000-0000-0000-0000-000000000001' and capacidad = 'capacidad-prueba'
order by id desc
limit 1;

delete from clientes where id = 'a3000000-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from proveedor_capacidad_cliente where cliente_id = 'a3000000-0000-0000-0000-000000000001'),
  0,
  'borrar un cliente borra en cascada su excepción de proveedor (Edge Cases)'
);

select is(
  (select cliente_id from eventos_proveedor_capacidad where id = (select val from t_ids where key = 'evento_cliente_x1')),
  null,
  'el evento de un cliente borrado sobrevive, con cliente_id puesto a null (auditoría no se pierde)'
);

-- ============================================================================
-- Retiro de un proveedor del catálogo: cae al default y audita (Edge Cases)
-- ============================================================================

update capacidades_proveedores set activo = false where capacidad = 'capacidad-prueba' and proveedor = 'externo';

select is(
  (select count(*)::int from proveedor_capacidad_organizacion where capacidad = 'capacidad-prueba' and proveedor = 'externo'),
  0,
  'retirar un proveedor del catálogo borra las elecciones de organización que lo usaban (Edge Cases)'
);

select is(
  (select count(*)::int from eventos_proveedor_capacidad where capacidad = 'capacidad-prueba' and proveedor_anterior = 'externo' and actor is null),
  1,
  'el retiro queda auditado con actor null (decisión del producto, no del administrador)'
);

select results_eq(
  $$select proveedor, origen, disponible from private.resolver_proveedor_capacidad('a1111111-1111-1111-1111-111111111111', null, 'capacidad-prueba')$$,
  $$values ('propio'::text, 'catalogo'::text, true)$$,
  'tras el retiro, la resolución cae sola al default del catálogo'
);

select * from finish();

rollback;
