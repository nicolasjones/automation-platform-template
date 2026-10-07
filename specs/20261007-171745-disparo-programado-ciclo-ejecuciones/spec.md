# Feature Specification: Disparo programado en el ciclo de ejecuciones

**Feature Branch**: `tmpl-programacion-automatizaciones`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Generalizar el ciclo de ejecuciones de workers (capacidad de plataforma worker-execution-cycle) para soportar disparo programado (recurrente) además del disparo manual que ya existe hoy, sin tocar ninguno de los flows de ejecución de producto ni el contrato de `iniciar_ejecucion_worker`."

## Clarifications

### Session 2026-10-07

- Q: ¿Quién puede crear/editar/quitar una programación de una capacidad? → A: Administrador de la organización, mismo patrón genérico ya existente del template (`private.es_administrador_de`) — no se deja abierto a que cada producto derivado decida su propia capa de permisos.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Programar una capacidad para que corra sola (Priority: P1)

Quien opera un producto derivado de este template configura, para una capacidad de ejecución ya existente, una frecuencia recurrente (diaria, semanal o mensual), una hora y un rango de fechas. A partir de ese momento, esa capacidad se ejecuta sola cuando corresponde, sin que nadie tenga que disparar manualmente ni ajustar un cron fuera del sistema.

**Why this priority**: Es la razón de ser de esta spec — hoy el ciclo de ejecuciones (`iniciar_ejecucion_worker`) solo admite disparo manual; no existe ningún camino de programación recurrente genérico que un producto derivado pueda construir sobre él.

**Independent Test**: Programar una sola capacidad con una frecuencia diaria a una hora próxima y confirmar, sin tocar nada más del ciclo de ejecuciones, que se dispara sola llamando al mismo punto de entrada que ya usa el disparo manual.

**Acceptance Scenarios**:

1. **Given** una capacidad de ejecución sin programación, **When** se crea una programación con frecuencia/hora/desde, **Then** queda guardada y activa.
2. **Given** una capacidad programada, **When** llega la hora/día que corresponde según su frecuencia, **Then** se dispara una ejecución nueva con el mismo mecanismo que ya usa `iniciar_ejecucion_worker` para el disparo manual — nunca un camino de ejecución paralelo.
3. **Given** una capacidad programada, **When** se quita la programación, **Then** deja de dispararse sola; el disparo manual sigue funcionando igual que siempre.

---

### User Story 2 - Evitar que dos automatizaciones de la misma conexión corran a la vez (Priority: P1)

El sistema nunca permite que dos ejecuciones de la misma conexión (mismo sistema externo, misma credencial) estén en curso al mismo tiempo, sin importar si una se disparó manualmente, otra por programación, y otra por un disparo en lote desde cualquier pantalla de cualquier producto derivado.

**Why this priority**: Es un requisito de corrección, no de preferencia — ya existe evidencia real de sistemas externos con sesión única (una segunda sesión expulsa a la primera) donde dos automatizaciones distintas de la misma conexión ejecutándose a la vez rompe la sesión de ambas. El mecanismo actual (`YA_EN_CURSO`) ya evita que la MISMA capacidad corra dos veces, pero no evita que DOS capacidades distintas de la misma conexión corran juntas — ese es exactamente el gap que el disparo programado (US1) puede empezar a exponer si no se cierra primero.

**Independent Test**: Disparar dos capacidades distintas de la misma conexión casi al mismo tiempo (por cualquier combinación de origen manual/programado) y confirmar que la segunda queda bloqueada hasta que la primera termina.

**Acceptance Scenarios**:

1. **Given** dos capacidades distintas de la misma conexión, ninguna en curso, **When** se intenta iniciar ambas casi al mismo tiempo, **Then** solo una queda `en_curso`; la otra se rechaza con un motivo claro, sin quedar encolada de forma invisible.
2. **Given** una ejecución en curso de una conexión que superó su tiempo máximo esperado, **When** se intenta iniciar otra capacidad de esa misma conexión, **Then** la anterior deja de considerarse vigente (mismo criterio de timeout que ya existe hoy) y la nueva puede iniciar — nunca un bloqueo permanente por una ejecución colgada.

---

### Edge Cases

- ¿Qué pasa si se quita una programación en el instante en que el disparo programado ya la había decidido? La ejecución en curso no se cancela a mitad de camino, pero no debe generarse una ejecución nueva después de quitada.
- ¿Qué pasa si una capacidad programada se deshabilita (`capacidades_ejecucion.habilitada = false`)? El disparo programado nunca debe iniciar una ejecución de una capacidad deshabilitada, igual que ya respeta esa regla el disparo manual.
- ¿Qué pasa si dos conexiones distintas de la misma organización y el mismo sistema externo tienen programaciones que coinciden en hora? Deben poder ejecutarse en paralelo entre sí — la restricción de concurrencia es por conexión, nunca por sistema externo en abstracto (una organización puede tener más de una conexión al mismo sistema).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir asociar, a lo sumo, una programación activa por capacidad de ejecución (frecuencia diaria/semanal/mensual, día correspondiente, hora, fecha desde, fecha hasta o "hasta hoy" sin fin) — nunca una lista de programaciones simultáneas para la misma capacidad.
- **FR-002**: El sistema MUST disparar automáticamente una capacidad programada cuando corresponda según su frecuencia/hora/desde/hasta, sin intervención manual.
- **FR-003**: El disparo automático MUST reutilizar exactamente el mismo punto de entrada que ya usa el disparo manual (`iniciar_ejecucion_worker`) — MUST NOT introducir un segundo camino de inicio de ejecución.
- **FR-004**: El sistema MUST dejar de disparar automáticamente una programación cuya fecha "hasta" ya pasó, sin borrarla — queda visible/consultable como vencida hasta que alguien la quite o le configure una fecha nueva.
- **FR-005**: El sistema MUST impedir que dos capacidades de la misma conexión tengan una ejecución en curso al mismo tiempo, sin importar el origen del disparo (manual, programado, o cualquier disparo en lote de un producto derivado) — MUST generalizar la regla ya existente de "misma capacidad" a "misma conexión".
- **FR-006**: El sistema MUST dejar de considerar "en curso" una ejecución que superó el tiempo máximo esperado de su capacidad, reutilizando el mismo criterio de vigencia con timeout ya existente — MUST NOT introducir un mecanismo de expiración distinto.
- **FR-007**: El sistema MUST permitir que un producto derivado agregue una capacidad de ejecución nueva (sistema o automatización nueva) sin que el mecanismo de disparo programado ni la regla de concurrencia por conexión requieran ningún cambio de código específico para esa capacidad nueva.
- **FR-008**: El sistema MUST registrar cada ejecución disparada automáticamente con el mismo detalle de auditoría (origen, actor, estado, timestamps, motivo de error) que ya registra el disparo manual — el origen debe quedar identificable como "programada", distinto de "manual".
- **FR-009**: Esta capacidad MUST NOT modificar el contrato de `iniciar_ejecucion_worker` ni los flows de ejecución de producto existentes (plantillas genérica/dedicada ni sus derivados) — toda la generalización ocurre en una tabla y un flow nuevos, aditivos.
- **FR-010**: El sistema MUST restringir a administradores de la organización la creación, edición y baja de programaciones — mismo criterio genérico ya existente del template (`private.es_administrador_de`), sin dejarlo como una decisión de cada producto derivado (Clarifications).

### Key Entities

- **Programación**: asociada a una capacidad de ejecución existente — frecuencia, día correspondiente, hora, fecha desde, fecha hasta (o "hasta hoy"). A lo sumo una por capacidad.
- **Conexión**: ya existente (`public.conexiones`) — unidad real de "no correr dos cosas a la vez" (una organización puede tener más de una conexión al mismo sistema externo; cada conexión es independiente para efectos de concurrencia).
- **Ejecución**: ya existente (`public.ejecuciones_worker`) — el origen "programada" se suma como un valor más, sin cambiar su forma.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una capacidad programada se ejecuta sin intervención manual dentro de una ventana razonable desde la hora configurada (ver Assumptions), el 100% de las veces que corresponde según su frecuencia.
- **SC-002**: Nunca se observan dos ejecuciones simultáneas de la misma conexión, sin importar la combinación de orígenes de disparo (manual, programado, en lote) que coincida en el tiempo.
- **SC-003**: Un producto derivado puede agregar una capacidad de ejecución nueva y programarla sin que el mecanismo genérico (tabla, flow despachador, regla de concurrencia) requiera ningún cambio de código.
- **SC-004**: El disparo manual existente sigue funcionando exactamente igual que antes de esta spec — ningún producto derivado necesita cambiar su integración actual con `iniciar_ejecucion_worker`.

## Assumptions

- Se asume una ventana de hasta 15 minutos entre la hora programada y el disparo real como razonable para SC-001 (latencia normal de un disparador periódico), salvo que se requiera una precisión distinta.
- Se asume que la unidad de concurrencia correcta es la conexión (`conexion_id`), no un nombre de sistema externo en texto libre — evidencia: `public.conexiones` ya permite más de una conexión al mismo `sistema_externo` por organización, y cada una representa una sesión/credencial independiente.
- Se asume que ningún producto derivado necesita, para esta spec, una UI — la UI (si corresponde) es responsabilidad de cada producto derivado sobre esta capacidad genérica.
- Confirmado contra el esquema real (`supabase/migrations/20260920000000_ciclo_ejecuciones_workers.sql:47,268`): `'programada'` ya es un valor válido de `ejecuciones_worker.origen` y de `iniciar_ejecucion_worker`'s `p_origen` — el despachador programado puede llamarlo hoy mismo sin ningún cambio de esquema ni de esa función. No es una suposición, es el estado real del código.
