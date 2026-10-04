# Research: Privilegios por defecto acotados en los esquemas expuestos

## Evidencia del producto derivado

Repo `estudio-contable-automation` (Nexo Contable):

- `docs/wiki/portback-template.md`, sección "Candidatos de la spec
  identidad-clientes-dominio", rama `normalizar-esquema-supabase`, commit
  `80407ad`: "Supabase otorga a `anon` y `authenticated` `TRUNCATE`,
  `REFERENCES` y `TRIGGER` en toda tabla nueva de `public` (`pg_default_acl`),
  y RLS no cubre `TRUNCATE`. Verificado el 2026-10-04 en `public.clientes`".
- Las tablas nuevas de `dominio` de esa spec revocan a mano
  (`revoke all ... from anon, authenticated`), por ejemplo
  `supabase/migrations/20261004150000_clientes_empresas_sistema.sql`
  (commit `a1b2810`).

Verificación propia, solo lectura, 2026-10-04:

| Stack | `pg_default_acl` de `postgres` en `public` (tablas) | Grants efectivos en `public.clientes` |
|---|---|---|
| Desarrollo del producto, levantado con la CLI (Postgres 17.6) | `anon=Dxtm`, `authenticated=Dxtm`, `service_role=Dxtm` | `anon`: REFERENCES, TRIGGER, TRUNCATE. `authenticated`: además SELECT, INSERT, UPDATE |
| CI del template (`ci-automation-platform-template`, después de `reset-db-ci.mjs`) | sin fila: se perdió al recrear el esquema | `authenticated`: SELECT, INSERT, UPDATE. Sin TRUNCATE |

`D` = TRUNCATE, `x` = REFERENCES, `t` = TRIGGER, `m` = MAINTAIN (Postgres 17;
`information_schema.role_table_grants` no lo lista). Para secuencias, el
default es `anon=w`, `authenticated=w` (UPDATE).

También existen defaults de `supabase_admin` en `public` que otorgan todo a
`anon`/`authenticated` (`arwdDxtm`) para los objetos que cree ese rol.
`postgres` no puede alterarlos.

## Decisión 1: revocar en la base, no confiar en PostgREST

**Decision**: revocar explícitamente y corregir los default privileges.

**Rationale**: Principio I (aislamiento por diseño). RLS no se evalúa para
`TRUNCATE`, y `REFERENCES`/`TRIGGER`/`MAINTAIN` no tienen uso legítimo para
los roles de la API en esta plataforma. Que PostgREST no los exponga es una
propiedad de la capa de transporte, no de la base.

**Alternatives considered**: dejarlo documentado sin cambio (descartado: el
producto ya tuvo que revocar a mano en cada tabla nueva); revocar solo en
`clientes` (descartado: el hueco es de todas las tablas).

## Decisión 2: alcance de esquemas y roles

**Decision**: `public` y `dominio` (los esquemas expuestos por la Data API en
`supabase/config.toml`), roles `anon` y `authenticated`. `service_role` y
`postgres` no se tocan.

**Rationale**: `service_role` ya ignora RLS y es de backend; quitarle
privilegios puede romper Edge Functions sin ganancia. `dominio` hoy no tiene
default privileges de Supabase, pero corregirlo igual deja la invariante
simétrica y cubre productos que creen tablas ahí.

## Decisión 3: secuencias y funciones fuera de alcance

**Decision**: no se tocan.

**Rationale**: revocar `UPDATE` de secuencias puede romper inserts en tablas
con `serial` (el rol que inserta necesita `nextval`). Hace falta un
inventario aparte. El `EXECUTE` por defecto de funciones ya se revoca
función por función en las migraciones.

## Decisión 4: que el CI pruebe el mismo estado que un stack real

**Decision**: `scripts/reset-db-ci.mjs` deja de hacer `drop schema public
cascade; create schema public;` y pasa a vaciar `public` (borrar sus objetos)
sin borrar el esquema, de modo que conserve los default privileges y los
grants del esquema que configuró Supabase al levantar el stack.

**Rationale**: con el reset actual, la invariante pgTAP pasaría en vacío en el
CI (verificado arriba) y el CI no reproduciría el hueco que corrige esta spec.
Vaciar el esquema no requiere conocer los internos de Supabase ni privilegios
de `supabase_admin`.

**Alternatives considered**:

- Capturar `pg_default_acl` antes del drop y reaplicarlo: descartado. Los
  defaults de `supabase_admin` no se pueden reaplicar como `postgres`.
- Reaplicar en el reset los defaults "conocidos" de Supabase: descartado.
  Duplica internos de Supabase que cambian entre versiones.
- Usar `supabase db reset` de la CLI en el CI: fuera de alcance. Cambia el
  diseño de `isolated-ci-database`.

**Riesgo a verificar en la implementación**: que vaciar `public` deje la base
equivalente a un stack recién levantado. Se compara el resultado de
`pg_default_acl` y de los grants de `public.clientes` entre el stack del CI y
uno levantado con la CLI.

## Decisión 5: forma de la invariante

**Decision**: una prueba pgTAP nueva que consulta `aclexplode(relacl)` de
todas las relaciones (`r`, `p`, `v`, `m`, `f`) de `public` y `dominio`, y
`aclexplode(defaclacl)` de `pg_default_acl` de `postgres` en esos esquemas,
buscando `TRUNCATE`, `REFERENCES`, `TRIGGER` o `MAINTAIN` para `anon` o
`authenticated`. Falla listando relación y privilegio. Suma una tabla
temporal de control creada como `postgres` dentro de la transacción para
fijar US2.

**Rationale**: mira privilegios efectivos, así que cubre también las tablas
creadas por `supabase_admin` (Edge Case) y cualquier `grant` explícito futuro.
`aclexplode` sí reporta `MAINTAIN`.

## Cómo vuelve al producto

1. El producto adopta selectivamente: copia la migración nueva (renombrada a
   una versión libre de su árbol), la prueba pgTAP y el cambio de
   `scripts/reset-db-ci.mjs`. Sus revocaciones manuales en `dominio` quedan
   redundantes pero inofensivas.
2. Registra en `template-adoption.json` la capacidad nueva
   (`api-role-default-privileges`) y la versión nueva de
   `isolated-ci-database`, con la evidencia de la corrida (pgTAP verde en su
   stack de desarrollo y en su CI).
3. Deja asentado el port-back en `docs/wiki/sistemas/sincronizacion-template.md`
   y marca el candidato como "llevado" en `docs/wiki/portback-template.md`.

No es un `git merge upstream/main`: ese merge solo aplica a
`docs/roadmap-template.md`.
