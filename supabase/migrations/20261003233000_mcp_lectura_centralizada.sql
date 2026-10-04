-- Refuerzo de seguridad (hallazgo del coordinador, 2026-10-03): el
-- aislamiento de organización para lecturas MCP NO puede depender de un
-- `.eq('organizacion_id', ...)` suelto en TypeScript — alcanza con que una
-- lectura nueva se agregue sin ese filtro, o con el valor equivocado, para
-- cruzar datos entre organizaciones, y nada en la base lo detecta. Esta
-- función es ahora la ÚNICA forma en que herramientas.ts toca datos de
-- negocio de lectura: arma el `where organizacion_id = ...` DENTRO del SQL,
-- revalida la capacidad otra vez acá (defensa en profundidad, no confía en
-- que el server ya la chequeó), y resuelve la vista desde fuentes_mcp en
-- vez de confiar en un nombre de vista que le pase el llamador.

create or replace function private.mcp_leer_fila(p_organizacion_id uuid, p_feature_id text, p_filtros jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vista text;
  v_where text := '';
  v_clave text;
  v_valor text;
  v_resultado jsonb;
begin
  if not private.puede_mcp_leer_funcionalidad(p_feature_id, p_organizacion_id) then
    raise exception 'Funcionalidad no legible para esta organización' using errcode = '42501';
  end if;

  select vista into v_vista from public.fuentes_mcp where feature_id = p_feature_id limit 1;
  if v_vista is null then
    raise exception 'Sin vista registrada para %', p_feature_id using errcode = '42704';
  end if;

  -- Filtros adicionales del llamador: nombre de columna vía format(%I)
  -- (identificador seguro, nunca concatenación directa) y valor vía
  -- format(%L) (literal escapado). Si el llamador intenta meter su propio
  -- "organizacion_id" en p_filtros, el resultado es una condición
  -- contradictoria (and organizacion_id = <el real> and organizacion_id =
  -- <el que mandó>) que a lo sumo devuelve menos filas, nunca de otra
  -- organización — el primer `organizacion_id = %L` ya fijo abajo es el que
  -- manda siempre.
  for v_clave, v_valor in select key, value from jsonb_each_text(coalesce(p_filtros, '{}'::jsonb))
  loop
    v_where := v_where || format(' and %I = %L', v_clave, v_valor);
  end loop;

  -- search_path='' en esta función: sin calificar explícitamente el
  -- esquema, %I por sí solo no resuelve a nada (ninguna ruta de búsqueda
  -- implícita). fuentes_mcp.vista siempre refiere a una vista/tabla de
  -- public — mismo supuesto que ya tenía el código viejo vía supabase-js.
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where organizacion_id = %L%s',
    v_vista, p_organizacion_id, v_where
  ) into v_resultado;

  return v_resultado;
end;
$$;

comment on function private.mcp_leer_fila(uuid, text, jsonb) is
  'Contrato: specs/servidor-mcp-generico/data-model.md. Única forma en que el servidor MCP lee datos de negocio — el filtro de organización vive acá, no en TypeScript. Revalida puede_mcp_leer_funcionalidad (defensa en profundidad sobre el chequeo que ya hace herramientas.ts al listar).';

create or replace function public.mcp_leer_fila(p_organizacion_id uuid, p_feature_id text, p_filtros jsonb default '{}'::jsonb)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.mcp_leer_fila(p_organizacion_id, p_feature_id, p_filtros); $$;

revoke execute on function public.mcp_leer_fila(uuid, text, jsonb) from public, authenticated;
grant execute on function public.mcp_leer_fila(uuid, text, jsonb) to service_role;
