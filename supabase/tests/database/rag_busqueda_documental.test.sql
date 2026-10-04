-- Búsqueda documental con IA / RAG (spec rag-busqueda-documental). Ver
-- specs/20261003-213800-rag-busqueda-documental/data-model.md.
begin;

select plan(16);

-- ============================================================================
-- Fixture
-- ============================================================================

insert into organizaciones (id, nombre) values
  ('f1111111-1111-1111-1111-111111111111', 'Organización A'),
  ('f2222222-2222-2222-2222-222222222222', 'Organización B');

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'usuario-a@example.com'),
  ('f2000000-0000-0000-0000-000000000001', 'usuario-b@example.com'),
  ('f5000000-0000-0000-0000-000000000005', 'superadmin-rag@example.com');

insert into superadmins (user_id) values ('f5000000-0000-0000-0000-000000000005');

insert into usuarios_organizacion (user_id, organizacion_id, rol_id) values
  ('f1000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', 'administrador'),
  ('f2000000-0000-0000-0000-000000000001', 'f2222222-2222-2222-2222-222222222222', 'administrador');

-- buscar_fragmentos (FR-017) exige la funcionalidad habilitada — sin esto,
-- cualquier test de búsqueda devolvería cero filas por diseño.
select set_config('request.jwt.claims', json_build_object('sub', 'f5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.habilitar_feature('busqueda-documental', 'f1111111-1111-1111-1111-111111111111');
select public.habilitar_feature('busqueda-documental', 'f2222222-2222-2222-2222-222222222222');
reset role;

-- Documento + versión activa de la Organización A, con un fragmento
-- indexado de contenido TEXTUALMENTE IDÉNTICO al que va a tener B (edge
-- case explícito de la spec: aislamiento no puede depender del contenido).
insert into documentos (id, organizacion_id, nombre, subido_por) values
  ('f3000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', 'doc-a.pdf', 'f1000000-0000-0000-0000-000000000001');

insert into versiones_documento (id, documento_id, storage_path, estado, subida_por) values
  ('f4000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111/f3000000-0000-0000-0000-000000000001/f4000000-0000-0000-0000-000000000001', 'activa', 'f1000000-0000-0000-0000-000000000001');

insert into fragmentos_indexados (version_id, organizacion_id, texto, embedding, orden) values
  ('f4000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111', 'contenido idéntico de prueba', array_fill(0.1, array[1536])::vector, 0);

-- Mismo contenido textual, organización B.
insert into documentos (id, organizacion_id, nombre, subido_por) values
  ('f3000000-0000-0000-0000-000000000002', 'f2222222-2222-2222-2222-222222222222', 'doc-b.pdf', 'f2000000-0000-0000-0000-000000000001');

insert into versiones_documento (id, documento_id, storage_path, estado, subida_por) values
  ('f4000000-0000-0000-0000-000000000002', 'f3000000-0000-0000-0000-000000000002', 'f2222222-2222-2222-2222-222222222222/f3000000-0000-0000-0000-000000000002/f4000000-0000-0000-0000-000000000002', 'activa', 'f2000000-0000-0000-0000-000000000001');

insert into fragmentos_indexados (version_id, organizacion_id, texto, embedding, orden) values
  ('f4000000-0000-0000-0000-000000000002', 'f2222222-2222-2222-2222-222222222222', 'contenido idéntico de prueba', array_fill(0.1, array[1536])::vector, 0);

-- Una versión "procesando" y una "fallida" de A, que buscar_fragmentos
-- NUNCA debe considerar (T015).
insert into versiones_documento (id, documento_id, storage_path, estado, subida_por) values
  ('f4000000-0000-0000-0000-000000000003', 'f3000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111/f3000000-0000-0000-0000-000000000001/f4000000-0000-0000-0000-000000000003', 'procesando', 'f1000000-0000-0000-0000-000000000001');
insert into fragmentos_indexados (version_id, organizacion_id, texto, embedding, orden) values
  ('f4000000-0000-0000-0000-000000000003', 'f1111111-1111-1111-1111-111111111111', 'fragmento en proceso, no debe aparecer', array_fill(0.1, array[1536])::vector, 0);

-- ============================================================================
-- Aislamiento por organización (FR-005) — T009
-- ============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

-- En este punto Org A tiene 1 fragmento en versión 'activa' (el de
-- 'procesando' ya se prueba excluido en el siguiente bloque) — si
-- buscar_fragmentos filtrara mal por organización, acá aparecería
-- también el fragmento idéntico de Org B.
select results_eq(
  $$select organizacion_id from private.buscar_fragmentos((select array_fill(0.1, array[1536])::vector), 0.0::float, 10)$$,
  $$values ('f1111111-1111-1111-1111-111111111111'::uuid)$$,
  'un usuario de la organización A nunca recibe fragmentos de la organización B, aun con contenido textualmente idéntico (FR-005)'
);

reset role;

-- ============================================================================
-- buscar_fragmentos nunca considera versiones no activas — T015
-- ============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from private.buscar_fragmentos((select array_fill(0.1, array[1536])::vector), 0.0::float, 10) where texto = 'fragmento en proceso, no debe aparecer'),
  0,
  'private.buscar_fragmentos nunca devuelve fragmentos de una versión en procesando'
);

reset role;

-- ============================================================================
-- Índice único parcial: a lo sumo una versión activa por documento — T021
-- ============================================================================

select throws_ok(
  $$insert into versiones_documento (documento_id, storage_path, estado, subida_por) values ('f3000000-0000-0000-0000-000000000001', 'otra-ruta', 'activa', 'f1000000-0000-0000-0000-000000000001')$$,
  '23505',
  null,
  'el índice único parcial rechaza una segunda versión activa para el mismo documento'
);

-- ============================================================================
-- Tras una actualización, buscar_fragmentos solo ve la versión nueva — T022
-- ============================================================================

update versiones_documento set estado = 'reemplazada' where id = 'f4000000-0000-0000-0000-000000000001';
insert into versiones_documento (id, documento_id, storage_path, estado, subida_por) values
  ('f4000000-0000-0000-0000-000000000004', 'f3000000-0000-0000-0000-000000000001', 'f1111111-1111-1111-1111-111111111111/f3000000-0000-0000-0000-000000000001/f4000000-0000-0000-0000-000000000004', 'activa', 'f1000000-0000-0000-0000-000000000001');
insert into fragmentos_indexados (version_id, organizacion_id, texto, embedding, orden) values
  ('f4000000-0000-0000-0000-000000000004', 'f1111111-1111-1111-1111-111111111111', 'contenido de la version nueva', array_fill(0.1, array[1536])::vector, 0);

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from private.buscar_fragmentos((select array_fill(0.1, array[1536])::vector), 0.0::float, 10) where texto = 'contenido idéntico de prueba'),
  0,
  'tras reemplazar la versión activa, buscar_fragmentos ya no ve fragmentos de la versión reemplazada (FR-013)'
);

select is(
  (select count(*)::int from private.buscar_fragmentos((select array_fill(0.1, array[1536])::vector), 0.0::float, 10) where texto = 'contenido de la version nueva'),
  1,
  'buscar_fragmentos ve el fragmento de la nueva versión activa'
);

reset role;

-- ============================================================================
-- Purga real al eliminar — T026
-- ============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$select public.eliminar_documento('f3000000-0000-0000-0000-000000000001')$$,
  'eliminar_documento no lanza error para un documento de la propia organización'
);

reset role;

select is(
  (select count(*)::int from versiones_documento where documento_id = 'f3000000-0000-0000-0000-000000000001'),
  0,
  'eliminar_documento borra en cascada todas las versiones del documento'
);

select is(
  (select count(*)::int from fragmentos_indexados where version_id in ('f4000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000003', 'f4000000-0000-0000-0000-000000000004')),
  0,
  'eliminar_documento borra en cascada todos los fragmentos indexados del documento'
);

-- Rechazo cross-organización (FR-016): el usuario de B no puede eliminar
-- el documento de A (ya eliminado arriba, probamos contra el de B mismo
-- para confirmar el guard general con un documento que sí existe).
select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$select public.eliminar_documento('f3000000-0000-0000-0000-000000000002')$$,
  '42501',
  null,
  'un usuario no puede eliminar un documento de otra organización (FR-016)'
);

reset role;

-- ============================================================================
-- Activación atómica de una versión (T011) — reemplaza la activa previa
-- ============================================================================

insert into documentos (id, organizacion_id, nombre, subido_por) values
  ('f3000000-0000-0000-0000-000000000003', 'f2222222-2222-2222-2222-222222222222', 'doc-c.pdf', 'f2000000-0000-0000-0000-000000000001');
insert into versiones_documento (id, documento_id, storage_path, estado, subida_por) values
  ('f4000000-0000-0000-0000-000000000005', 'f3000000-0000-0000-0000-000000000003', 'ruta-activa', 'activa', 'f2000000-0000-0000-0000-000000000001'),
  ('f4000000-0000-0000-0000-000000000006', 'f3000000-0000-0000-0000-000000000003', 'ruta-nueva', 'procesando', 'f2000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', json_build_object('sub', 'f2000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select lives_ok(
  $$select public.activar_version_documento('f4000000-0000-0000-0000-000000000006')$$,
  'activar_version_documento no lanza error para una versión en procesando'
);

select is(
  (select estado from versiones_documento where id = 'f4000000-0000-0000-0000-000000000005'),
  'reemplazada',
  'la versión antes activa queda reemplazada tras activar la nueva'
);

select throws_ok(
  $$select public.activar_version_documento('f4000000-0000-0000-0000-000000000006')$$,
  '22023',
  null,
  'no se puede volver a activar una versión que ya no está en procesando (evita doble activación)'
);

reset role;

-- ============================================================================
-- Falla de indexación de una actualización no toca la versión anterior
-- activa (T019, R4, FR-015) — simula lo que indexar-documento hace al
-- fallar: marca 'fallida' sin llamar a activar_version_documento.
-- ============================================================================

insert into documentos (id, organizacion_id, nombre, subido_por) values
  ('f3000000-0000-0000-0000-000000000004', 'f1111111-1111-1111-1111-111111111111', 'doc-d.pdf', 'f1000000-0000-0000-0000-000000000001');
insert into versiones_documento (id, documento_id, storage_path, estado, subida_por) values
  ('f4000000-0000-0000-0000-000000000007', 'f3000000-0000-0000-0000-000000000004', 'ruta-d-activa', 'activa', 'f1000000-0000-0000-0000-000000000001'),
  ('f4000000-0000-0000-0000-000000000008', 'f3000000-0000-0000-0000-000000000004', 'ruta-d-nueva', 'procesando', 'f1000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

update versiones_documento set estado = 'fallida', motivo_error = 'simulado para test' where id = 'f4000000-0000-0000-0000-000000000008';

select is(
  (select estado from versiones_documento where id = 'f4000000-0000-0000-0000-000000000007'),
  'activa',
  'si la indexación de una actualización falla, la versión anterior sigue activa sin cambios (T019, FR-015)'
);

reset role;

-- ============================================================================
-- Varios documentos: retrieval por cercanía real, no solo por organización
-- (US4, T028) — embeddings sintéticos distintos, sin necesitar OpenAI real.
-- ============================================================================

insert into documentos (id, organizacion_id, nombre, subido_por) values
  ('f3000000-0000-0000-0000-000000000005', 'f1111111-1111-1111-1111-111111111111', 'doc-cercano.pdf', 'f1000000-0000-0000-0000-000000000001'),
  ('f3000000-0000-0000-0000-000000000006', 'f1111111-1111-1111-1111-111111111111', 'doc-lejano.pdf', 'f1000000-0000-0000-0000-000000000001');
insert into versiones_documento (id, documento_id, storage_path, estado, subida_por) values
  ('f4000000-0000-0000-0000-000000000009', 'f3000000-0000-0000-0000-000000000005', 'ruta-cercano', 'activa', 'f1000000-0000-0000-0000-000000000001'),
  ('f4000000-0000-0000-0000-000000000010', 'f3000000-0000-0000-0000-000000000006', 'ruta-lejano', 'activa', 'f1000000-0000-0000-0000-000000000001');
-- "cercano": mismo vector que la consulta (distancia coseno 0). "lejano":
-- vector ortogonal (distancia coseno 1, similitud 0) — no debe aparecer
-- con un umbral alto.
insert into fragmentos_indexados (version_id, organizacion_id, texto, embedding, orden) values
  ('f4000000-0000-0000-0000-000000000009', 'f1111111-1111-1111-1111-111111111111', 'tema específico buscado', (select array_fill(0.2, array[1536])::vector), 0),
  ('f4000000-0000-0000-0000-000000000010', 'f1111111-1111-1111-1111-111111111111', 'tema completamente distinto', (select (array_fill(0.2, array[768]) || array_fill(-0.2, array[768]))::vector), 0);

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select results_eq(
  $$select texto from private.buscar_fragmentos((select array_fill(0.2, array[1536])::vector), 0.9::float, 10)$$,
  $$values ('tema específico buscado'::text)$$,
  'con un umbral alto, buscar_fragmentos encuentra el documento semánticamente cercano y descarta el lejano, sin que el usuario indique cuál (US4, SC-003)'
);

reset role;

-- ============================================================================
-- FR-017: deshabilitar la funcionalidad corta buscar_fragmentos, no solo
-- la UI (control real de datos, mismo criterio que private.tiene_feature
-- en el resto del panel)
-- ============================================================================

select set_config('request.jwt.claims', json_build_object('sub', 'f5000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
set local role authenticated;
select public.deshabilitar_feature('busqueda-documental', 'f1111111-1111-1111-1111-111111111111');
reset role;

select set_config('request.jwt.claims', json_build_object('sub', 'f1000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;

select is(
  (select count(*)::int from private.buscar_fragmentos((select array_fill(0.2, array[1536])::vector), 0.0::float, 10)),
  0,
  'con la funcionalidad deshabilitada para la organización, buscar_fragmentos no devuelve nada aunque haya fragmentos indexados (FR-017)'
);

-- FR-002/FR-012: tampoco se puede subir un documento nuevo (ni actualizar
-- uno existente) con la funcionalidad deshabilitada.
select throws_ok(
  $$insert into documentos (organizacion_id, nombre, subido_por) values ('f1111111-1111-1111-1111-111111111111', 'no-deberia-entrar.pdf', 'f1000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'no se puede crear un documento nuevo con la funcionalidad deshabilitada para la organización (FR-002)'
);

reset role;

select finish();
rollback;
