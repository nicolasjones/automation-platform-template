# Quickstart: Identificadores externos únicos por organización

## Antes (reproducción del defecto, stack local)

Con dos organizaciones A y B, un administrador de cada una y un cliente en
cada una:

1. Como admin de A: `select vincular_identificador_externo(<cliente A>, 'sistema_x', '123');` → OK.
2. Como admin de B: `select vincular_identificador_externo(<cliente B>, 'sistema_x', '123');` → `23505` "ya está vinculado a otro cliente" (fuga: B se entera de que existe en otra organización).

## Después

1. Aplicar la migración (`supabase migration up --local`).
2. Repetir 1 y 2: las dos operaciones tienen éxito; cada admin ve solo su fila.
3. Pendientes, como rol técnico de A (o admin de A):
   - `select registrar_identificador_externo(<org A>, 'sistema_x', '999', 'Entidad 999');` → `null` (pendiente).
   - Admin de A: `select vincular_identificador_externo(<cliente A>, 'sistema_x', '999');` → asignado.
   - Rol técnico: misma registración → devuelve `<cliente A>`.
   - Admin: `select desasignar_identificador_externo(<id>);` → vuelve a pendiente.
4. Rol técnico de A con `p_organizacion_id = <org B>` → `42501`.
5. `supabase test db --local`: `mapeo_identificadores_clientes.test.sql` verde.
