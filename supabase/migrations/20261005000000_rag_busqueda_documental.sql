-- Búsqueda documental con IA / RAG (spec rag-busqueda-documental). Reversión:
-- deshabilitar la funcionalidad (borrar de organizaciones_features), después
-- retirar RLS/RPCs/tablas/bucket en orden inverso a como se crean acá.

-- ============================================================================
-- Tablas
-- ============================================================================

create table documentos (
  id uuid primary key default gen_random_uuid(),
  -- Bug real, encontrado probando en vivo: sin default, el insert de la
  -- UI (apps/web/src/pages/ia/documentos.tsx, solo manda {nombre}) viola
  -- NOT NULL en organizacion_id/subido_por antes de llegar siquiera al
  -- RLS. Mismo patrón que conversaciones_chat_ia (chat-companion-mechanism).
  organizacion_id uuid not null default private.organizacion_id() references organizaciones (id) on delete cascade,
  nombre text not null,
  subido_por uuid not null default auth.uid() references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

comment on table documentos is
  'Identidad lógica de un documento subido por un usuario de una organización — estable a través de actualizaciones (research.md R3).';

alter table documentos enable row level security;

-- FR-002/FR-017: la habilitación de la funcionalidad es un control real de
-- datos, no solo de UI (mismo criterio que private.tiene_feature en spec
-- 009) — separado de SELECT/UPDATE/DELETE para que, al deshabilitar, los
-- documentos existentes se conserven visibles (FR-017) pero no se puedan
-- crear nuevos.
create policy documentos_propia_organizacion_select on documentos
  for select
  using (organizacion_id = (select private.organizacion_id()));

create policy documentos_propia_organizacion_insert on documentos
  for insert
  with check (organizacion_id = (select private.organizacion_id()) and (select private.tiene_feature('busqueda-documental')));

create policy documentos_propia_organizacion_update on documentos
  for update
  using (organizacion_id = (select private.organizacion_id()))
  with check (organizacion_id = (select private.organizacion_id()));

create policy documentos_propia_organizacion_delete on documentos
  for delete
  using (organizacion_id = (select private.organizacion_id()));

grant select, insert, update, delete on table documentos to authenticated;

create table versiones_documento (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references documentos (id) on delete cascade,
  storage_path text not null,
  estado text not null check (estado in ('procesando', 'activa', 'reemplazada', 'fallida')),
  -- Mismo bug real que documentos.subido_por: la UI nunca manda este
  -- campo en el insert (apps/web/src/pages/ia/documentos.tsx).
  subida_por uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subida_en timestamptz not null default now(),
  motivo_error text
);

comment on table versiones_documento is
  'Una fila por versión de un documento; a lo sumo una activa por documento_id (índice único parcial abajo) — research.md R3/R4.';

create unique index versiones_documento_una_activa_idx on versiones_documento (documento_id) where estado = 'activa';

alter table versiones_documento enable row level security;

create policy versiones_documento_propia_organizacion_select on versiones_documento
  for select
  using (
    exists (
      select 1 from documentos d
      where d.id = versiones_documento.documento_id
        and d.organizacion_id = (select private.organizacion_id())
    )
  );

-- FR-012/FR-017: subir una nueva versión (actualizar) exige la
-- funcionalidad habilitada, igual que un documento nuevo.
create policy versiones_documento_propia_organizacion_insert on versiones_documento
  for insert
  with check (
    exists (
      select 1 from documentos d
      where d.id = versiones_documento.documento_id
        and d.organizacion_id = (select private.organizacion_id())
    )
    and (select private.tiene_feature('busqueda-documental'))
  );

create policy versiones_documento_propia_organizacion_update on versiones_documento
  for update
  using (
    exists (
      select 1 from documentos d
      where d.id = versiones_documento.documento_id
        and d.organizacion_id = (select private.organizacion_id())
    )
  )
  with check (
    exists (
      select 1 from documentos d
      where d.id = versiones_documento.documento_id
        and d.organizacion_id = (select private.organizacion_id())
    )
  );

create policy versiones_documento_propia_organizacion_delete on versiones_documento
  for delete
  using (
    exists (
      select 1 from documentos d
      where d.id = versiones_documento.documento_id
        and d.organizacion_id = (select private.organizacion_id())
    )
  );

grant select, insert, update, delete on table versiones_documento to authenticated;

create table fragmentos_indexados (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references versiones_documento (id) on delete cascade,
  organizacion_id uuid not null references organizaciones (id) on delete cascade,
  texto text not null,
  embedding public.vector(1536) not null,
  orden int not null
);

comment on table fragmentos_indexados is
  'organizacion_id denormalizado a propósito — es el control real de aislamiento en la búsqueda (FR-005), no una conveniencia. Ver data-model.md.';

create index fragmentos_indexados_embedding_idx on fragmentos_indexados using hnsw (embedding public.vector_cosine_ops);
create index fragmentos_indexados_organizacion_idx on fragmentos_indexados (organizacion_id);

alter table fragmentos_indexados enable row level security;

create policy fragmentos_indexados_propia_organizacion on fragmentos_indexados
  for all
  using (organizacion_id = (select private.organizacion_id()))
  with check (organizacion_id = (select private.organizacion_id()));

grant select, insert, update, delete on table fragmentos_indexados to authenticated;

-- ============================================================================
-- Storage: bucket privado, un objeto por versión
-- ============================================================================

-- FR-009: límite de tamaño y de formato aplicado por el propio Storage
-- (antes de que el archivo llegue a indexar-documento) — 20 MB, formatos
-- soportados por extraerTexto (txt/pdf/docx). Un documento más grande o de
-- otro formato se rechaza al subir con un error claro de Storage, no
-- silenciosamente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (
  'documentos-rag',
  'documentos-rag',
  false,
  20971520,
  array['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- storage_path = {organizacion_id}/{documento_id}/{version_id} — primer
-- segmento de la ruta es la organización (mismo patrón que
-- 20260916160000_xubio_libro_mayor_storage.sql).
create policy documentos_rag_propia_organizacion_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documentos-rag' and (storage.foldername(name))[1] = (select private.organizacion_id())::text);

create policy documentos_rag_propia_organizacion_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos-rag' and (storage.foldername(name))[1] = (select private.organizacion_id())::text);

create policy documentos_rag_propia_organizacion_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos-rag' and (storage.foldername(name))[1] = (select private.organizacion_id())::text);

-- ============================================================================
-- Funciones private (security definer, search_path = '')
-- ============================================================================

create or replace function private.buscar_fragmentos(p_embedding public.vector(1536), p_umbral float, p_k int)
returns setof public.fragmentos_indexados
language sql
stable
security definer
set search_path = ''
as $$
  -- search_path='' no trae los operadores de pgvector (viven en public);
  -- OPERATOR(public.<=>) los referencia explícito sin abrir el search_path.
  -- tiene_feature acá (no solo en la UI) es el control real de FR-017: con
  -- la funcionalidad deshabilitada, esto devuelve cero filas y el llamador
  -- ya sabe interpretarlo como "sin información relevante" (FR-006).
  select f.*
  from public.fragmentos_indexados f
  where (select private.tiene_feature('busqueda-documental'))
    and f.organizacion_id = (select private.organizacion_id())
    and f.version_id in (select id from public.versiones_documento where estado = 'activa')
    and 1 - (f.embedding OPERATOR(public.<=>) p_embedding) >= p_umbral
  order by f.embedding OPERATOR(public.<=>) p_embedding
  limit p_k;
$$;

comment on function private.buscar_fragmentos(public.vector, float, int) is
  'Contrato: specs/20261003-213800-rag-busqueda-documental/data-model.md. Filtra por organización y por versión activa únicamente (R6) — nunca considera una versión reemplazada o en proceso.';

-- PostgREST no expone el schema private — wrapper público mismo patrón que
-- public.puede_chat_leer_funcionalidad (spec chat-ia-supabase).
create or replace function public.buscar_fragmentos(p_embedding public.vector(1536), p_umbral float, p_k int)
returns setof public.fragmentos_indexados
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.buscar_fragmentos(p_embedding, p_umbral, p_k);
$$;

revoke execute on function public.buscar_fragmentos(public.vector, float, int) from public;
grant execute on function public.buscar_fragmentos(public.vector, float, int) to authenticated;

create or replace function private.activar_version_documento(p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_documento_id uuid;
begin
  select documento_id into v_documento_id from public.versiones_documento
  where id = p_version_id and estado = 'procesando';

  if v_documento_id is null then
    raise exception 'Versión no encontrada o ya procesada' using errcode = '22023';
  end if;

  -- Atómico: reemplazar la activa anterior y activar la nueva en una sola
  -- transacción (la función ya corre en una) — nunca hay ventana sin
  -- ninguna versión usable (R4, T011).
  update public.versiones_documento set estado = 'reemplazada'
  where documento_id = v_documento_id and estado = 'activa';

  update public.versiones_documento set estado = 'activa'
  where id = p_version_id;
end;
$$;

comment on function private.activar_version_documento(uuid) is
  'Contrato: specs/20261003-213800-rag-busqueda-documental/contracts/indexacion-documento.md paso 5. Llamar solo tras indexar todos los fragmentos con éxito.';

create or replace function public.activar_version_documento(p_version_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.activar_version_documento(p_version_id);
$$;

revoke execute on function public.activar_version_documento(uuid) from public;
grant execute on function public.activar_version_documento(uuid) to authenticated;

create or replace function private.eliminar_documento(p_documento_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organizacion_id uuid;
  v_path text;
begin
  select organizacion_id into v_organizacion_id from public.documentos where id = p_documento_id;

  if v_organizacion_id is null or v_organizacion_id != (select private.organizacion_id()) then
    raise exception 'Documento no encontrado' using errcode = '42501';
  end if;

  -- storage.objects bloquea el delete directo por SQL salvo opt-in
  -- explícito por transacción (storage.protect_delete) — ver nota de
  -- desvío en research.md, encontrado al verificar contra la base real.
  perform set_config('storage.allow_delete_query', 'true', true);

  for v_path in select storage_path from public.versiones_documento where documento_id = p_documento_id loop
    delete from storage.objects where bucket_id = 'documentos-rag' and name = v_path;
  end loop;

  delete from public.documentos where id = p_documento_id;
end;
$$;

comment on function private.eliminar_documento(uuid) is
  'Contrato: specs/20261003-213800-rag-busqueda-documental/data-model.md. Purga real (R5, FR-020): borra objetos de Storage de todas las versiones + delete en cascada de versiones_documento/fragmentos_indexados. Rechaza cross-organización (FR-016).';

create or replace function public.eliminar_documento(p_documento_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.eliminar_documento(p_documento_id);
$$;

revoke execute on function public.eliminar_documento(uuid) from public;
grant execute on function public.eliminar_documento(uuid) to authenticated;

-- ============================================================================
-- Acceso a la credencial del proveedor de IA desde una Edge Function
-- ============================================================================
-- Mismo fix ya aplicado en chat-ia-supabase y mcp-servidor-ia: estas
-- funciones (spec gateway-ia) solo estaban otorgadas a workers_orquestacion
-- (rol de los workers en el VPS del cliente). RAG es una funcionalidad
-- centralizada (Edge Functions indexar-documento/preguntar), no un worker
-- de cliente — usa service_role, nunca expuesta al navegador. GRANT
-- idempotente: si ya existe desde otra rama, esto no rompe nada.
grant execute on function private.resolver_politica_ia(text) to service_role;
grant execute on function private.obtener_clave_perfil_ia(uuid) to service_role;

-- ============================================================================
-- Registro de la funcionalidad en el panel (patrón descentralizado, spec 009)
-- ============================================================================

do $$
declare
  v_actor uuid;
begin
  select user_id into v_actor from public.superadmins order by user_id limit 1;

  if v_actor is null then
    raise notice 'No existe ningún superadmin todavía — Búsqueda documental en Funcionalidades queda para que lo registre seed.sql (dev/CI) o un alta manual posterior (producción)';
    return;
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_actor)::text, true);

  if not exists (select 1 from public.features where id = 'busqueda-documental') then
    perform public.registrar_feature(
      'busqueda-documental',
      'Búsqueda documental (RAG)',
      'Subir documentos propios de la organización y preguntarles en lenguaje natural, con respuestas que citan el documento de origen.'
    );
  end if;
end $$;
