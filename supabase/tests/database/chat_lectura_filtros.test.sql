-- Lectura del chat companion: descubrimiento de fuentes con columnas, alta por
-- convención y habilitación de agregaciones de PostgREST
-- (spec 20261018-104239-chat-lectura-filtros). Ver
-- specs/20261018-104239-chat-lectura-filtros/contracts/tool-leer.md.
--
-- Mismo patrón que panel_de_funcionalidades.test.sql: fixture como postgres
-- (dueño, RLS no aplica) y después "authenticated" simulando cada usuario vía
-- request.jwt.claims, igual que PostgREST.
begin;

select plan(28);

-- ============================================================================
-- Fixture
-- ============================================================================

insert into organizaciones (id, nombre) values
  ('d1111111-1111-1111-1111-111111111111', 'Organización con la fuente'),
  ('d2222222-2222-2222-2222-222222222222', 'Organización vecina'),
  -- Sin ninguna habilitación: prueba de aislamiento (fail-closed).
  ('d3333333-3333-3333-3333-333333333333', 'Organización sin nada habilitado');

insert into auth.users (id, email) values
  ('d5000000-0000-0000-0000-000000000005', 'superadmin-chat@example.com'),
  ('d1000000-0000-0000-0000-000000000001', 'admin-con@example.com'),
  ('d3000000-0000-0000-0000-000000000001', 'admin-sin@example.com');

insert into superadmins (user_id) values ('d5000000-0000-0000-0000-000000000005');

insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('d1000000-0000-0000-0000-000000000001', 'd1111111-1111-1111-1111-111111111111', 'administrador'),
  ('d3000000-0000-0000-0000-000000000001', 'd3333333-3333-3333-3333-333333333333', 'administrador');

insert into features (id, nombre, descripcion) values
  ('chat-ia', 'Chat', 'Chat conversacional'),
  ('chat-fuente-a', 'Fuente A', 'Funcionalidad de prueba con una vista consultable')
on conflict (id) do nothing;

-- La organización dueña tiene la fuente y el chat habilitados; la vecina
-- también las tiene (las fuentes son de plataforma, no por organización); la
-- tercera no tiene nada.
insert into organizaciones_features (feature_id, organizacion_id, habilitado_por) values
  ('chat-ia', 'd1111111-1111-1111-1111-111111111111', 'd5000000-0000-0000-0000-000000000005'),
  ('chat-fuente-a', 'd1111111-1111-1111-1111-111111111111', 'd5000000-0000-0000-0000-000000000005'),
  ('chat-ia', 'd2222222-2222-2222-2222-222222222222', 'd5000000-0000-0000-0000-000000000005'),
  ('chat-fuente-a', 'd2222222-2222-2222-2222-222222222222', 'd5000000-0000-0000-0000-000000000005');

-- Vistas de solo lectura de prueba: una en public y otra en su propio esquema
-- (como las vistas de negocio reales).
create schema if not exists dominio;

create view public.fuente_prueba_a with (security_invoker = true) as
  select 1::int as id, 'acme'::text as nombre, date '2026-07-01' as fecha;

create view dominio.fuente_prueba_b with (security_invoker = true) as
  select 1::int as id, 100.50::numeric as debe;

grant usage on schema dominio to authenticated;
grant select on public.fuente_prueba_a to authenticated;
grant select on dominio.fuente_prueba_b to authenticated;

-- ============================================================================
-- Alta por convención (FR-005): fuente + capacidad de lectura, atómico
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$select public.registrar_fuente_chat_ia('chat-fuente-a', 'public.fuente_prueba_a', 'Vista A de prueba (movimientos)')$$,
  'el superadmin registra una fuente con su descripción'
);

reset role;

select is(
  (select count(*)::int from public.fuentes_chat_ia where feature_id = 'chat-fuente-a'),
  1,
  'el alta deja exactamente una fila en fuentes_chat_ia'
);

select is(
  (select lectura from public.capacidades_chat_ia where feature_id = 'chat-fuente-a'),
  true,
  'el alta habilita la lectura de la funcionalidad en el mismo acto (atómico)'
);

-- ============================================================================
-- Idempotencia (FR-005): reintentar el alta no duplica ni deshabilita
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select lives_ok(
  $$select public.registrar_fuente_chat_ia('chat-fuente-a', 'public.fuente_prueba_a', 'Vista A (descripción corregida)')$$,
  'reintentar el alta de la misma fuente no falla'
);

reset role;

select is(
  (select count(*)::int from public.fuentes_chat_ia where feature_id = 'chat-fuente-a'),
  1,
  'reintentar el alta no duplica la fuente (idempotente)'
);

select is(
  (select descripcion from public.fuentes_chat_ia
    where feature_id = 'chat-fuente-a' and vista = 'public.fuente_prueba_a'),
  'Vista A (descripción corregida)',
  'reintentar el alta actualiza la descripción con el último valor'
);

-- ============================================================================
-- Validaciones del alta
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select public.registrar_fuente_chat_ia('chat-fuente-a', 'public.Fuente_Prueba_A', 'mayúsculas')$$,
  '22023',
  null,
  'rechaza una vista que no es "tabla" ni "esquema.tabla"'
);

select throws_ok(
  $$select public.registrar_fuente_chat_ia('chat-fuente-a', '   ', 'vacía')$$,
  '22023',
  null,
  'rechaza una vista vacía'
);

select throws_ok(
  $$select public.registrar_fuente_chat_ia('', 'public.fuente_prueba_a', 'sin funcionalidad')$$,
  '22023',
  null,
  'rechaza una funcionalidad vacía'
);

select throws_ok(
  $$select public.registrar_fuente_chat_ia('funcionalidad-inexistente', 'public.fuente_prueba_a', 'x')$$,
  'P0002',
  null,
  'rechaza una funcionalidad que no existe en el catálogo'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select throws_ok(
  $$select public.registrar_fuente_chat_ia('chat-fuente-a', 'public.fuente_prueba_b', 'sin permiso')$$,
  '42501',
  null,
  'un administrador de organización no puede registrar fuentes (solo superadmin)'
);

reset role;

-- ============================================================================
-- Descubrimiento (FR-001..FR-004): la fuente legible, con sus columnas
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.chat_fuentes_disponibles()),
  1,
  'la organización con la fuente y el chat habilitados descubre la fuente'
);

select is(
  (select columnas::text from public.chat_fuentes_disponibles() where vista = 'public.fuente_prueba_a'),
  '{id,nombre,fecha}',
  'las columnas se derivan de la vista en runtime, en orden de posición (FR-014)'
);

select is(
  (select descripcion from public.chat_fuentes_disponibles() where vista = 'public.fuente_prueba_a'),
  'Vista A (descripción corregida)',
  'el descubrimiento devuelve la descripción registrada (insumo del catálogo)'
);

reset role;

-- ============================================================================
-- Fail-closed en las tres capas (FR-003)
-- ============================================================================

delete from organizaciones_features
where feature_id = 'chat-ia' and organizacion_id = 'd1111111-1111-1111-1111-111111111111';

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.chat_fuentes_disponibles()),
  0,
  'sin el chat habilitado para la organización no se descubre ninguna fuente'
);

reset role;

insert into organizaciones_features (feature_id, organizacion_id, habilitado_por)
values ('chat-ia', 'd1111111-1111-1111-1111-111111111111', 'd5000000-0000-0000-0000-000000000005');

delete from organizaciones_features
where feature_id = 'chat-fuente-a' and organizacion_id = 'd1111111-1111-1111-1111-111111111111';

set local role authenticated;

select is(
  (select count(*)::int from public.chat_fuentes_disponibles()),
  0,
  'con la funcionalidad dueña de la fuente deshabilitada no se descubre nada'
);

reset role;

insert into organizaciones_features (feature_id, organizacion_id, habilitado_por)
values ('chat-fuente-a', 'd1111111-1111-1111-1111-111111111111', 'd5000000-0000-0000-0000-000000000005');

update public.capacidades_chat_ia set lectura = false where feature_id = 'chat-fuente-a';

set local role authenticated;

select is(
  (select count(*)::int from public.chat_fuentes_disponibles()),
  0,
  'con la capacidad de plataforma en lectura=false no se descubre nada'
);

reset role;

update public.capacidades_chat_ia set lectura = true where feature_id = 'chat-fuente-a';

-- Aislamiento: la organización que no tiene nada habilitado no ve la fuente,
-- aunque el registro sea de plataforma.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.chat_fuentes_disponibles()),
  0,
  'una organización sin habilitaciones no ve las fuentes registradas por otra'
);

reset role;

-- ============================================================================
-- Casos de borde del descubrimiento
-- ============================================================================

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

-- Vista registrada que todavía no existe en la base: aparece igual, sin
-- columnas (la lectura después falla contenida y distinguible).
select lives_ok(
  $$select public.registrar_fuente_chat_ia('chat-fuente-a', 'public.fuente_inexistente', 'Vista que todavía no existe')$$,
  'se puede registrar una vista cuyo nombre es válido aunque la relación no exista'
);

-- Vista sin prefijo de esquema: se resuelve contra public.
select lives_ok(
  $$select public.registrar_fuente_chat_ia('chat-fuente-a', 'fuente_prueba_a', 'Misma vista, sin esquema')$$,
  'se puede registrar una vista sin prefijo de esquema'
);

reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'd1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select columnas::text from public.chat_fuentes_disponibles() where vista = 'public.fuente_inexistente'),
  '{}',
  'una fuente cuya vista no existe se descubre con la lista de columnas vacía'
);

select is(
  (select columnas::text from public.chat_fuentes_disponibles() where vista = 'fuente_prueba_a'),
  '{id,nombre,fecha}',
  'una vista sin prefijo se resuelve contra el esquema public'
);

select is(
  (select count(*)::int from public.chat_fuentes_disponibles()),
  3,
  'el descubrimiento devuelve todas las fuentes legibles de la funcionalidad'
);

select is(
  (select vista from public.chat_fuentes_disponibles() limit 1),
  'fuente_prueba_a',
  'el orden de salida del descubrimiento es estable (por vista dentro de la funcionalidad)'
);

reset role;

-- ============================================================================
-- Agregaciones de PostgREST (FR-009) y permisos de los RPCs
-- ============================================================================

select is(
  (
    select count(*)::int from pg_roles
    where rolname = 'authenticator'
      and array_to_string(rolconfig, ',') like '%pgrst.db_aggregates_enabled=true%'
  ),
  1,
  'el rol authenticator queda con las agregaciones de PostgREST habilitadas (sin esto el motor responde PGRST123)'
);

select ok(
  has_function_privilege('authenticated', 'public.chat_fuentes_disponibles()', 'execute'),
  'authenticated puede ejecutar el descubrimiento de fuentes'
);

select ok(
  not has_function_privilege('anon', 'public.chat_fuentes_disponibles()', 'execute'),
  'anon no puede ejecutar el descubrimiento de fuentes'
);

select ok(
  has_function_privilege('authenticated', 'public.registrar_fuente_chat_ia(text, text, text)', 'execute'),
  'authenticated puede ejecutar el alta por convención (el chequeo de superadmin vive en el cuerpo)'
);

select * from finish();

rollback;
