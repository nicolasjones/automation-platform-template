-- US3 de Servidor MCP: generación/revocación de credenciales (T022, T023).
-- Reversión: retirar ambas funciones.

create or replace function private.generar_credencial_mcp(p_organizacion_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not (select private.is_superadmin()) then
    raise exception 'Solo un superadmin puede generar credenciales MCP' using errcode = '42501';
  end if;

  -- research.md R2: el token se genera acá y se devuelve una sola vez
  -- (FR-005) — solo el hash se persiste, nunca el valor en texto plano.
  v_token := encode(extensions.gen_random_bytes(32), 'base64');

  insert into public.credenciales_mcp (organizacion_id, hash, creada_por)
  values (p_organizacion_id, extensions.digest(v_token, 'sha256'), (select auth.uid()));

  return v_token;
end;
$$;

comment on function private.generar_credencial_mcp(uuid) is
  'Contrato: specs/servidor-mcp-generico/spec.md FR-004/FR-005. El valor de retorno es el único momento en que el token existe en texto plano — el llamador debe mostrarlo una vez y no puede volver a pedirlo.';

create or replace function private.revocar_credencial_mcp(p_credencial_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_superadmin()) then
    raise exception 'Solo un superadmin puede revocar credenciales MCP' using errcode = '42501';
  end if;

  update public.credenciales_mcp set revocada_en = now()
  where id = p_credencial_id and revocada_en is null;
end;
$$;

comment on function private.revocar_credencial_mcp(uuid) is
  'Efecto inmediato en la próxima solicitud (FR-012) — private.validar_credencial_mcp ya filtra por revocada_en is null, sin necesitar reiniciar nada.';

create or replace function public.generar_credencial_mcp(p_organizacion_id uuid)
returns text language plpgsql security definer set search_path = ''
as $$ begin return private.generar_credencial_mcp(p_organizacion_id); end; $$;

create or replace function public.revocar_credencial_mcp(p_credencial_id uuid)
returns void language sql security definer set search_path = ''
as $$ select private.revocar_credencial_mcp(p_credencial_id); $$;

revoke execute on function public.generar_credencial_mcp(uuid) from public;
revoke execute on function public.revocar_credencial_mcp(uuid) from public;
grant execute on function public.generar_credencial_mcp(uuid) to authenticated;
grant execute on function public.revocar_credencial_mcp(uuid) to authenticated;
