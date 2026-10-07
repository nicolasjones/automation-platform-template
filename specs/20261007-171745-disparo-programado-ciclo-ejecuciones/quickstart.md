# Quickstart: validar Disparo programado en el ciclo de ejecuciones

## Setup

```bash
pnpm dev:supabase   # stack local con las migraciones de esta spec aplicadas
```

Necesitás al menos una organización con una conexión activa y una capacidad habilitada (fixtures de `supabase/tests/database/ciclo_ejecuciones_workers.test.sql` sirven de base).

## Escenario 1 — Programar y que corra sola (US1)

1. `select public.programar_capacidad_ejecucion(p_capacidad_id, 'diaria', '06:00', current_date)` como administrador de la organización.
2. Disparar manualmente el flow `despachador-programado` desde Kestra (sin esperar al cron, para la prueba).
3. Confirmar: una fila nueva en `ejecuciones_worker` con `origen = 'programada'`, Y una fila nueva en `despachos_ejecucion` con `estado = 'pendiente'` (la parte que antes del fix de `research.md` #1 NO se generaba).
4. Confirmar que `plantilla-generico.yml`/`plantilla-dedicado.yml` (o cualquier flow de producto que ya use `private.reclamar_despachos_ejecucion`) la reclama sin ningún cambio de su parte.

**Resultado esperado**: SC-001, y la prueba directa de que FR-002/FR-003 funcionan de punta a punta, no solo a nivel de `ejecuciones_worker`.

## Escenario 2 — Concurrencia por conexión, no por capacidad (US2)

1. Con una conexión que tiene 2 capacidades habilitadas, iniciar una (`iniciar_ejecucion_worker(conexion_id, clave_A, 'manual', actor)`).
2. Mientras sigue `en_curso`, intentar iniciar la otra (`clave_B`, misma conexión) — hoy (antes de esta spec) esto tendría éxito; después de esta spec, `private.conexion_en_curso` debe devolver `true` y el flujo que la consulte (el despachador, o una RPC de disparo en lote de un producto derivado) debe rechazarla o encolarla, nunca dejarla correr en paralelo.
3. Confirmar que una conexión distinta (incluso del mismo `sistema_externo`) no se ve afectada — SC-002 es por conexión, no por sistema.

## Escenario 3 — Vigencia con timeout (Edge Cases)

1. Simular una ejecución `en_curso` cuya `iniciada_en` ya superó `tiempo_max_seg` de su capacidad (como ya hacen los fixtures de `ejecucion_en_curso_worker.test.sql`).
2. Confirmar que `private.conexion_en_curso` la ignora (devuelve `false` si esa era la única en curso) — una ejecución colgada no bloquea la conexión para siempre.

## Escenario 4 — El disparo manual no cambia (regresión)

1. Repetir cualquier test existente de `ciclo_ejecuciones_workers.test.sql` sin modificar — deben seguir pasando igual, confirmando que el cambio de `iniciar_ejecucion_worker` (FR-009) no alteró el comportamiento de `manual`/`kestra`.
