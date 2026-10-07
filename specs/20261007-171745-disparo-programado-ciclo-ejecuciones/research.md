# Research: Disparo programado en el ciclo de ejecuciones

## 1. El outbox NO dispara nada hoy para `origen = 'programada'` — hallazgo central

**Decision**: extender `iniciar_ejecucion_worker` para que `'programada'` también genere una orden en `despachos_ejecucion`, igual que `'manual'`. Sin esto, la spec entera no funciona: el despachador podría crear filas en `ejecuciones_worker`, pero nada las ejecutaría de verdad.

**Evidencia real**: `supabase/migrations/20260923172738_iniciar_ejecucion_outbox.sql`:

```sql
if p_origen = 'manual' then
  insert into public.despachos_ejecucion (ejecucion_id, organizacion_id)
  values (v_nueva_id, v_conexion.organizacion_id);
end if;
```

Comentario del archivo: *"Orígenes programada y kestra no generan una orden para evitar recursión de despacho."* Esto tiene sentido para `'kestra'`: ese origen lo usa un flow que YA está, en esa misma ejecución de Kestra, a punto de hacer el trabajo (ver `specs/016-ciclo-ejecuciones-workers/contracts/ciclo-ejecuciones.md:1-8`, patrón usado por `infra/kestra/flows/respaldo-postgres.yml`) — insertar una orden ahí sí sería recursivo (Kestra se despacharía a sí mismo algo que ya está haciendo).

Pero el despachador programado de esta spec **no puede** hacer eso: es genérico (FR-007, sin lógica de ningún sistema), así que no sabe cómo "ejecutar el trabajo" de ninguna capacidad concreta — necesita delegarlo a quien sí sabe (el flow de producto correspondiente), exactamente el rol que ya cumple el outbox para `'manual'`. No hay recursión: el despachador no es el mismo flow que va a hacer el trabajo.

**Alternativas consideradas**:
- Dejar `'programada'` como está y hacer que el despachador use el patrón `'kestra'` (ejecutar inline) — rechazada: viola FR-007, el despachador tendría que conocer la imagen/SSH de cada sistema, exactamente la duplicación que esta spec busca evitar.
- Crear una tabla de outbox nueva, paralela, solo para disparos programados — rechazada: duplica `despachos_ejecucion`/`reclamar_despachos_ejecucion` sin necesidad; el consumidor (`plantilla-generico.yml`) ya sabe leer de la única tabla que existe.

**Implicancia de diseño**: cambio de una línea (`if p_origen = 'manual' then` → `if p_origen in ('manual', 'programada') then`) en una migración nueva aditiva — no se reescribe la función existente desde cero, se agrega una migración que la reemplaza con el cambio mínimo. FR-009 de la spec ya se corrigió para reflejar esto explícitamente.

## 2. La unidad de concurrencia es la conexión, no la capacidad ni un nombre de sistema

**Decision**: generalizar `YA_EN_CURSO` de `(organizacion_id, capacidad_id)` a `(organizacion_id, conexion_id)`.

**Evidencia real**: `public.conexiones.sistema_externo` (`20260914150000_orquestacion_multi_organizacion.sql:66-74`) — comentario explícito: *"una organización puede tener más de una conexión al mismo sistema"*. `public.capacidades_ejecucion` tiene `unique (conexion_id, clave)` — varias capacidades por conexión son el caso normal, no la excepción. La función actual (`20260923172738_iniciar_ejecucion_outbox.sql:41-48`) ya filtra por `capacidad_id`, nunca por `conexion_id`, así que dos capacidades distintas de la misma conexión pueden tener filas `en_curso` simultáneas hoy.

**Alternativas consideradas**: agrupar por `sistema_externo` en vez de `conexion_id` — rechazada: sobre-restringiría a organizaciones con más de una conexión al mismo sistema (cada conexión es una sesión/credencial independiente, no hay razón real para bloquearlas entre sí).

**Implicancia de diseño**: una función nueva `private.conexion_en_curso(p_conexion_id uuid)` que generaliza `private.estado_ejecucion_vigente` (mismo criterio de vigencia con timeout, agrupando por `conexion_id` en vez de por `ejecucion_id` puntual) — consultada por el despachador antes de llamar a `iniciar_ejecucion_worker`, y disponible para que cualquier producto derivado la use desde su propia UI de disparo en lote (como el fork ya necesita).

## 3. Sintaxis real de un trigger `Schedule` en este repo

**Decision**: seguir el patrón ya usado, sin inventar sintaxis.

**Evidencia real**: `infra/kestra/flows/respaldo-postgres.yml:149-160`:

```yaml
triggers:
  - id: schedule_diario
    type: io.kestra.plugin.core.trigger.Schedule
    cron: "0 3 * * *"
    inputs:
      origen: programado
```

**Implicancia de diseño**: el flow despachador usa un `Schedule` con un cron frecuente (cada 5-15 minutos, a definir en `tasks.md`/implementación — no es una decisión de negocio, es un parámetro operativo). Cada corrida consulta qué capacidades están "debidas" ahora según `programacion_ejecucion` y `capacidades_ejecucion`, verifica `private.conexion_en_curso` antes de cada una, y llama a `iniciar_ejecucion_worker(conexion_id, clave, 'programada')` por cada una que corresponda.

## 4. Dónde documentar esto (Principio VII)

**Decision**: actualizar el contrato original, no solo crear uno nuevo.

**Evidencia real**: `specs/016-ciclo-ejecuciones-workers/contracts/ciclo-ejecuciones.md` ya documenta los 3 orígenes y su comportamiento de outbox — es el lugar donde alguien va a buscar esta información en el futuro. Esta spec **actualiza** ese contrato (agrega la fila de `'programada'` generando orden) en vez de dejarlo desactualizado con un contrato nuevo que lo contradiga en otro archivo.
