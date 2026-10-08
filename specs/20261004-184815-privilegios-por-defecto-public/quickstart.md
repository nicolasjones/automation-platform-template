# Quickstart: Privilegios por defecto acotados en los esquemas expuestos

## Antes (stack local levantado con la CLI)

```sql
select grantee, string_agg(privilege_type, ',' order by privilege_type)
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'clientes'
group by 1;
-- anon          | REFERENCES,TRIGGER,TRUNCATE
-- authenticated | INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE

select r.rolname, n.nspname, d.defaclacl
from pg_default_acl d
join pg_roles r on r.oid = d.defaclrole
join pg_namespace n on n.oid = d.defaclnamespace
where r.rolname = 'postgres' and n.nspname = 'public' and d.defaclobjtype = 'r';
-- {..., anon=Dxtm/postgres, authenticated=Dxtm/postgres, ...}
```

## Después

1. `pnpm dev:supabase` y `supabase migration up --local` (con el lock del stack compartido si corresponde).
2. Las dos consultas de arriba: `anon` sin filas; `authenticated` con `INSERT,SELECT,UPDATE`; el default de `postgres` en `public` sin `anon`/`authenticated` (o sin `Dxtm`).
3. `supabase test db --local`: la prueba `privilegios_por_defecto_api.test.sql` pasa.
4. Inyección: en `psql`, `begin; grant truncate on public.clientes to anon;` y correr las aserciones de la prueba: fallan. `rollback;`.

## CI

1. `pnpm db:ci:preparar`, `supabase start ...`, `pnpm db:reset:ci`.
2. Antes de aplicar la migración nueva, la consulta de `pg_default_acl` sobre el stack del CI tiene que mostrar los mismos defaults que el stack local: esto confirma que el reset ya no los borra.
3. `pnpm test:db:ci` verde.

## Staging (antes de cerrar)

Consulta de solo lectura de `pg_default_acl` en Supabase Cloud de staging,
antes y después de `migraciones-cloud`, para confirmar que Cloud tenía el
mismo default que el stack local (Assumption de spec.md).
