# Data Model: Privilegios por defecto acotados en los esquemas expuestos

Sin tablas ni columnas nuevas. Cambia el catálogo de privilegios.

## Estado objetivo

| Objeto | `anon` | `authenticated` | `service_role` / `postgres` |
|---|---|---|---|
| Relaciones existentes de `public`/`dominio` | solo grants explícitos de migraciones (hoy ninguno) | solo grants explícitos (`SELECT`, `INSERT`, `UPDATE`, según cada tabla) | sin cambios |
| Default privileges de `postgres` en `public`/`dominio` (tablas) | ninguno | ninguno | sin cambios |
| Secuencias y funciones | sin cambios (fuera de alcance) | sin cambios | sin cambios |

Privilegios revocados: `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`.

## Reversión (encabezado de la migración)

```sql
-- Vuelve al estado de Supabase previo a esta migración:
-- do $$ ... grant truncate, references, trigger, maintain on <cada relación de public> to anon, authenticated ... $$;
-- alter default privileges for role postgres in schema public
--   grant truncate, references, trigger, maintain on tables to anon, authenticated;
-- (dominio no tenía default privileges: no se restaura nada ahí)
```
