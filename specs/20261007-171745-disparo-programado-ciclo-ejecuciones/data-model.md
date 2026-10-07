# Data Model: Disparo programado en el ciclo de ejecuciones

Todas las migraciones son aditivas (Constitución, Technology and Quality Gates).

## 1. `public.programacion_ejecucion` (nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `organizacion_id` | uuid not null | FK `organizaciones`; RLS por organización (Principio I) |
| `capacidad_id` | uuid not null | FK `public.capacidades_ejecucion(id)` — ata la programación a una capacidad real |
| `frecuencia` | text not null | `check in ('diaria','semanal','mensual')` |
| `dia_semana` | smallint null | solo cuando `frecuencia = 'semanal'`, `check between 0 and 6` |
| `dia_mes` | smallint null | solo cuando `frecuencia = 'mensual'`, `check between 1 and 31` |
| `hora` | time not null | |
| `desde` | date not null | |
| `hasta` | date null | `null` = "hasta hoy" (sin fin); `hasta < hoy` = vencida (FR-004), no se borra sola |
| `created_by` / `updated_by` | uuid | auditoría |
| `created_at` / `updated_at` | timestamptz | |

Restricción: `unique (capacidad_id)` — a lo sumo una programación activa por capacidad (FR-001).

RLS: `select` para miembros de la organización; `insert`/`update`/`delete` únicamente vía RPC (sección 3), nunca directo para `authenticated` — mismo patrón que `dominio.accesos_arca` y el resto de tablas de dominio con escritura mediada.

## 2. Cambio mínimo en `public.iniciar_ejecucion_worker` (migración aditiva, reemplaza la función)

Único cambio real (`research.md` #1):

```sql
-- antes
if p_origen = 'manual' then
  insert into public.despachos_ejecucion (ejecucion_id, organizacion_id)
  values (v_nueva_id, v_conexion.organizacion_id);
end if;

-- después
if p_origen in ('manual', 'programada') then
  insert into public.despachos_ejecucion (ejecucion_id, organizacion_id)
  values (v_nueva_id, v_conexion.organizacion_id);
end if;
```

Nada más de la función cambia: firma, errores contractuales (`CAPACIDAD_NO_HABILITADA`, `CONEXION_CREDENCIAL_INVALIDA`, `YA_EN_CURSO`) y el comportamiento para `manual`/`kestra` quedan idénticos (FR-009).

## 3. Función nueva: concurrencia por conexión

```sql
create or replace function private.conexion_en_curso(p_conexion_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ejecuciones_worker e
    join public.capacidades_ejecucion c on c.id = e.capacidad_id
    where e.conexion_id = p_conexion_id
      and e.estado = 'en_curso'
      and e.iniciada_en >= clock_timestamp() - make_interval(secs => c.tiempo_max_seg)
  );
$$;
```

Generaliza `private.estado_ejecucion_vigente` (misma idea de vigencia con timeout, agrupando por `conexion_id` en vez de por un `ejecucion_id` puntual — `research.md` #2). Sin grants a `authenticated`; la consulta el despachador (rol `kestra_orquestacion`) y, si un producto derivado quiere mostrar "en curso" en su propia UI, una función pública delgada que la envuelva con la verificación de organización (a definir en la implementación, no en el diseño genérico).

## 4. RPCs

Ver `contracts/rpc.md`.

## 5. Flow Kestra

`infra/kestra/flows/despachador-programado.yml` — trigger `Schedule` (sintaxis real en `research.md` #3), sin inputs de sistema/imagen (a diferencia de `plantilla-generico.yml`): consulta `programacion_ejecucion` join `capacidades_ejecucion` por lo que está vencido/debido, llama `private.conexion_en_curso` antes de cada una, y `iniciar_ejecucion_worker(conexion_id, clave, 'programada')` por cada capacidad que corresponda y no esté bloqueada.
