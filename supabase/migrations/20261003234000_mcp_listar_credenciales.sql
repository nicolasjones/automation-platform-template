-- Bug real encontrado en code-review (eje Spec, 2026-10-03): la migración
-- original dejó credenciales_mcp deliberadamente sin GRANT a authenticated
-- ("nunca un insert/select directo a esta tabla, ni para un superadmin"),
-- pero nunca se construyó la RPC de listado que esa decisión implicaba —
-- la pantalla /ia/capacidades-mcp quedó sin forma real de listar ni
-- revocar una credencial existente (Acceptance Scenario 2, User Story 3).

create or replace function private.listar_credenciales_mcp(p_organizacion_id uuid default null)
returns table (id uuid, organizacion_id uuid, creada_en timestamptz, revocada_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.organizacion_id, c.creada_en, c.revocada_en
  from public.credenciales_mcp c
  where private.is_superadmin()
    and (p_organizacion_id is null or c.organizacion_id = p_organizacion_id)
  order by c.creada_en desc;
$$;

comment on function private.listar_credenciales_mcp(uuid) is
  'Contrato: specs/servidor-mcp-generico/data-model.md. Nunca devuelve hash — mismo criterio que nunca mostrar el token tras generarlo (FR-005). p_organizacion_id null lista todas (pantalla de gobernanza).';

create or replace function public.listar_credenciales_mcp(p_organizacion_id uuid default null)
returns table (id uuid, organizacion_id uuid, creada_en timestamptz, revocada_en timestamptz)
language sql stable security definer set search_path = ''
as $$ select * from private.listar_credenciales_mcp(p_organizacion_id); $$;

revoke execute on function public.listar_credenciales_mcp(uuid) from public;
grant execute on function public.listar_credenciales_mcp(uuid) to authenticated;

-- Bug real de Standards (code-review, 2026-10-03): la pantalla hacía un
-- upsert directo sobre capacidades_mcp desde el frontend — viola
-- docs/wiki/sistemas/supabase.md ("toda mutación pasa por una RPC security
-- definer, nunca un insert/update directo... desde el frontend"). La propia
-- tabla ya graba actualizado_por/actualizado_en, pensada para que una
-- función los setee, no un upsert crudo que los deja en null.

create or replace function private.actualizar_capacidad_mcp(p_feature_id text, p_lectura boolean, p_ejecucion boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_superadmin()) then
    raise exception 'Solo un superadmin puede modificar capacidades MCP' using errcode = '42501';
  end if;

  insert into public.capacidades_mcp (feature_id, lectura, ejecucion, actualizado_por, actualizado_en)
  values (p_feature_id, p_lectura, p_ejecucion, (select auth.uid()), now())
  on conflict (feature_id) do update
    set lectura = excluded.lectura, ejecucion = excluded.ejecucion,
        actualizado_por = excluded.actualizado_por, actualizado_en = excluded.actualizado_en;
end;
$$;

comment on function private.actualizar_capacidad_mcp(text, boolean, boolean) is
  'Contrato: specs/servidor-mcp-generico/data-model.md. Única forma de modificar capacidades_mcp — registra actualizado_por/actualizado_en, un upsert crudo del frontend los dejaba en null.';

create or replace function public.actualizar_capacidad_mcp(p_feature_id text, p_lectura boolean, p_ejecucion boolean)
returns void language sql security definer set search_path = ''
as $$ select private.actualizar_capacidad_mcp(p_feature_id, p_lectura, p_ejecucion); $$;

revoke execute on function public.actualizar_capacidad_mcp(text, boolean, boolean) from public;
grant execute on function public.actualizar_capacidad_mcp(text, boolean, boolean) to authenticated;

-- Ya no hace falta exponer insert/update directo de capacidades_mcp al
-- frontend — todo pasa por la RPC de arriba.
revoke insert, update, delete on table capacidades_mcp from authenticated;
