# Feature Specification: Aprobación humana antes de completar una interacción de IA

**Feature Branch**: `aprobacion-humana-ia`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Cierra el ítem #16 del roadmap (Aprobación humana): hoy una interacción con respuesta validada se completa sola (completarInteraccion transiciona directo invocando -> respuesta_validada -> completada). El roadmap pide separar una recomendación de una acción efectiva: la IA deja una propuesta visible, una persona la aprueba/ajusta/rechaza, y recién entonces se produce el efecto. Extender la máquina de estados de InteraccionEnCurso con un estado esperando_aprobacion y dos funciones (aprobarInteraccion, rechazarInteraccion), gateadas por un flag opcional del contrato del consumidor. Quién tiene permiso para aprobar sigue siendo responsabilidad de Supabase/RLS de cada producto, igual que ya pasa con revision_humana — packages/ia modela el estado, no la autorización."

**Delivery scope**: workers

## Alcance

Extiende la máquina de estados de `InteraccionEnCurso` (`packages/ia/src/interacciones.ts`) con un estado nuevo, `esperando_aprobacion`, y dos funciones nuevas (`aprobarInteraccion`, `rechazarInteraccion`). Un contrato de consumidor declara, opcionalmente, que requiere aprobación humana; cuando la declara, una respuesta validada no se completa sola — queda esperando hasta que alguien la apruebe o la rechace explícitamente. No decide quién puede aprobar (eso es RLS/permisos de cada producto, igual que hoy decide quién resuelve una `revision_humana`) ni ejecuta ningún efecto de negocio — sigue siendo responsabilidad del consumidor, igual que el resto de esta capacidad.

## Clarifications

### Session 2026-10-03

- Q: ¿Quién puede aprobar o rechazar? → A: Fuera de alcance de `packages/ia`. Mismo patrón que `revision_humana`, que hoy es "visible y resoluble sólo por superadmin" vía RLS y RPC de cada producto — esta capacidad no agrega su propio control de permisos, lo modela como un estado y deja la autorización real a quien lo adopte.
- Q: ¿Esta entrega agrega la tabla o RPC real para que un producto pueda aprobar desde Refine? → A: No. Igual que con `ia_interacciones`, no existe hoy ninguna función que inserte esa fila (ver spec de `contexto-permisos-ia`, Decisión 1) — esta entrega extiende la máquina de estados en memoria de `packages/ia`; conectarla a una tabla y una pantalla real es una adopción de producto futura, cuando exista un consumidor concreto con un efecto real que aprobar.
- Q: ¿Qué pasa si un consumidor no declara que requiere aprobación? → A: Nada cambia — `completarInteraccion` se comporta exactamente igual que hoy (transición directa a `completada`). Esto es estrictamente opt-in.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pausar antes de completar cuando el contrato lo exige (Priority: P1)

Un contrato declara que requiere aprobación humana. Cuando una interacción de ese consumidor obtiene una respuesta validada, en vez de completarse sola queda en estado de espera.

**Why this priority**: sin esto no hay forma de distinguir, en la máquina de estados, una respuesta que ya puede producir su efecto de una que todavía necesita que alguien la revise — el roadmap pide exactamente esa separación.

**Independent Test**: se completa una interacción con `completarInteraccion(interaccion, { requiereAprobacionHumana: true })` y se confirma que el estado resultante es `esperando_aprobacion`, no `completada`.

**Acceptance Scenarios**:

1. **Given** una interacción en estado `invocando` y un contrato que requiere aprobación, **When** se completa, **Then** el estado resultante es `esperando_aprobacion`, no `completada`.
2. **Given** la misma interacción, **When** un contrato NO requiere aprobación (el caso de hoy), **Then** el estado resultante sigue siendo `completada` directamente — comportamiento idéntico al actual.

---

### User Story 2 - Aprobar o rechazar una interacción en espera (Priority: P1)

Una interacción en `esperando_aprobacion` se resuelve explícitamente: aprobada pasa a `completada`; rechazada pasa a `rechazada`. Cualquier otro estado de origen es un error de transición.

**Why this priority**: sin una forma explícita de resolver la espera, el estado nuevo sería un callejón sin salida.

**Independent Test**: se llama `aprobarInteraccion`/`rechazarInteraccion` sobre una interacción en `esperando_aprobacion` y se confirma el estado final; se confirma que llamarlas sobre una interacción en cualquier otro estado lanza.

**Acceptance Scenarios**:

1. **Given** una interacción en `esperando_aprobacion`, **When** se aprueba, **Then** pasa a `completada` y el evento registrado conserva el detalle de la aprobación (p. ej. quién aprobó, si el consumidor lo provee).
2. **Given** la misma interacción, **When** se rechaza en vez de aprobarse, **Then** pasa a `rechazada` con su propio detalle.
3. **Given** una interacción que NO está en `esperando_aprobacion` (p. ej. ya `completada`, o todavía `invocando`), **When** se intenta aprobar o rechazar, **Then** lanza `TRANSICION_IA_INVALIDA` — mismo error que ya usan las demás transiciones inválidas de esta máquina de estados.

### Edge Cases

- Aprobar o rechazar dos veces la misma interacción: la segunda llamada encuentra el estado ya resuelto (`completada` o `rechazada`) y lanza `TRANSICION_IA_INVALIDA`, igual que cualquier otra transición fuera de lugar.
- El `detalle` que acompaña a la aprobación/rechazo es responsabilidad del consumidor (p. ej. quién aprobó) — `packages/ia` no exige ninguna forma particular, igual que el resto de los eventos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `EstadoInteraccion` DEBE incluir un estado nuevo, `esperando_aprobacion`.
- **FR-002**: `completarInteraccion` DEBE aceptar una indicación opcional de que el consumidor requiere aprobación humana; cuando se indica, DEBE transicionar a `esperando_aprobacion` en vez de `completada`. Sin esa indicación, el comportamiento DEBE ser idéntico al actual (compatibilidad total).
- **FR-003**: El sistema DEBE ofrecer una función que transicione una interacción de `esperando_aprobacion` a `completada`, y otra que la transicione a `rechazada`; ambas DEBEN lanzar `TRANSICION_IA_INVALIDA` si la interacción no está en `esperando_aprobacion`.
- **FR-004**: Ninguna de las funciones nuevas DEBE decidir ni verificar quién tiene permiso para aprobar o rechazar — esa autorización es responsabilidad del consumidor y de RLS, fuera de esta capacidad.
- **FR-005**: Esta entrega NO DEBE agregar ninguna tabla, columna o RPC en Supabase.

### Key Entities

- Ninguna nueva — extiende `InteraccionEnCurso`/`EstadoInteraccion` ya existentes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las interacciones de un contrato que no requiere aprobación se completa exactamente igual que antes de esta entrega.
- **SC-002**: El 100% de las interacciones de un contrato que requiere aprobación queda en `esperando_aprobacion` hasta que se la apruebe o rechace explícitamente.
- **SC-003**: El 100% de los intentos de aprobar/rechazar una interacción que no está en `esperando_aprobacion` lanza un error, sin excepción.
- **SC-004**: `ai-navigation-fallback` sigue pasando sus 17 tests sin ninguna modificación (no declara requerir aprobación).

## Assumptions

- Qué efecto de negocio concreto necesita aprobación (enviar un mensaje, escribir un registro, llamar un servicio externo) lo decide cada consumidor en su propia spec de adopción, no esta capacidad genérica.
- La conexión a una tabla y una pantalla real de aprobación en Refine es trabajo futuro, cuando exista un consumidor concreto — mismo criterio que ya se aplicó en `contexto-permisos-ia` para la persistencia de interacciones.
