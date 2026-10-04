# Feature Specification: UI reutilizable de estado/aprobación de IA y corrección de esperando_aprobacion en la base

**Feature Branch**: `ui-ia-aprobacion-pendiente`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Cierra el ítem #20 del roadmap (UI de IA) con lo mínimo real: extraer de la pantalla ya existente apps/web/src/pages/ia/interacciones.tsx dos piezas reutilizables (una insignia de estado, las acciones de resolución) y corregir ahí mismo un bug real encontrado al revisarla: el estado esperando_aprobacion que agregamos en la spec aprobacion-humana-ia (packages/ia, nivel TypeScript) nunca llegó a la base — el check constraint de ia_interacciones.estado y la tabla de transiciones válidas de registrar_evento_interaccion_ia siguen sin conocerlo. Sin ese fix, ninguna interacción podría llegar nunca a ese estado en la base ni resolverse desde ahí."

**Delivery scope**: refine | supabase

## Alcance

Dos partes, relacionadas pero distintas:

1. **Corrección de base** (bug, no feature nueva): agregar `esperando_aprobacion` al check constraint de `ia_interacciones.estado` y a la tabla de transiciones válidas de `private.registrar_evento_interaccion_ia`, para que una interacción pueda llegar a ese estado y resolverse desde ahí — igual que ya puede desde `revision_humana`. Migración aditiva.
2. **UI reutilizable** (#20 del roadmap): extraer de `apps/web/src/pages/ia/interacciones.tsx` una insignia de estado (mapea cualquier `EstadoInteraccion` a una etiqueta y color) y las acciones de resolución (completar/rechazar/cancelar vía `resolver_revision_ia`) como componentes reutilizables, siguiendo los patrones compartidos de carga/vacío/error que ya exige el Principio VI de la constitución (`EstadoCargaPagina`, `EstadoVacio`, `EstadoError` de `apps/web/src/components/estados/`) — la pantalla actual no los usa (retorna `null` mientras carga, no tiene estado vacío). Las acciones de resolución pasan a estar disponibles tanto para `revision_humana` como para `esperando_aprobacion`, sin duplicar el código de los botones.

## Clarifications

### Session 2026-10-03

- Q: ¿`resolver_revision_ia` necesita cambios? → A: No. Ya es genérico (acepta cualquier `p_interaccion_id` y un estado final en `completada`/`rechazada`/`cancelada`); delega la validez de la transición a `registrar_evento_interaccion_ia`. Una vez que esa función conoce `esperando_aprobacion`, `resolver_revision_ia` funciona sin tocarla.
- Q: ¿Esta entrega agrega la función que crea la fila inicial de `ia_interacciones` (el gap preexistente de runtime)? → A: No, sigue fuera de alcance — ver `contexto-permisos-ia` y `aprobacion-humana-ia`. Esta entrega corrige la tabla de transiciones para cuando esa pieza exista, no la construye.
- Q: ¿Las piezas de UI son específicas de esta pantalla o reutilizables por cualquier pantalla futura que muestre una interacción de IA? → A: Reutilizables — ese es el punto del ítem #20. Viven junto a los demás componentes compartidos del panel (`apps/web/src/components/`), no dentro de `pages/ia/`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resolver una interacción en esperando_aprobacion desde la base (Priority: P1)

Una interacción que llegó a `esperando_aprobacion` puede resolverse a `completada` o `rechazada` mediante la misma función ya usada para `revision_humana`.

**Why this priority**: sin este fix, el estado que agrega `aprobacion-humana-ia` es inalcanzable en la base — la máquina de estados de TypeScript y la de la base quedarían permanentemente desincronizadas.

**Independent Test**: pgTAP — se inserta una interacción fixture en `respuesta_validada`, se la transiciona a `esperando_aprobacion` vía `registrar_evento_interaccion_ia`, y se la resuelve a `completada` vía `resolver_revision_ia`; ambos pasos deben tener éxito.

**Acceptance Scenarios**:

1. **Given** una interacción en `respuesta_validada`, **When** se registra el evento `esperando_aprobacion`, **Then** la transición es válida y el estado de la interacción queda en `esperando_aprobacion`.
2. **Given** una interacción en `esperando_aprobacion`, **When** el superadmin la resuelve a `completada` o `rechazada` vía `resolver_revision_ia`, **Then** la transición es válida.
3. **Given** las transiciones ya válidas hoy (`revision_humana` → `completada`/`rechazada`/`cancelada`, etc.), **When** se corre el pgTAP existente, **Then** siguen pasando sin cambios — la corrección es puramente aditiva.

---

### User Story 2 - Insignia de estado reutilizable (Priority: P2)

Cualquier pantalla que muestre una interacción de IA usa el mismo componente para traducir su `EstadoInteraccion` a una etiqueta y color consistentes, en vez de reimplementar el mapeo.

**Why this priority**: sin esto, cada pantalla futura que muestre interacciones (o el chat IA, o el panel de aprobaciones) reinventaría su propio mapeo de estado a texto — exactamente lo que el ítem #20 pide evitar.

**Independent Test**: se renderiza el componente con cada valor posible de `EstadoInteraccion` y se confirma que cada uno produce una etiqueta en castellano y un color coherente con el patrón de `severity` ya usado por `EstadosPagina` (info/success/error/warning).

**Acceptance Scenarios**:

1. **Given** un estado terminal exitoso (`completada`), **When** se renderiza, **Then** usa un color de éxito.
2. **Given** un estado terminal no exitoso (`rechazada`, `fallida_tecnica`, `cancelada`), **When** se renderiza, **Then** usa un color de error/advertencia.
3. **Given** un estado que requiere acción humana (`esperando_aprobacion`, `revision_humana`), **When** se renderiza, **Then** usa un color distintivo de advertencia, no igual al de éxito ni al de error terminal.
4. **Given** un estado en curso (`iniciada`, `preparando`, `invocando`), **When** se renderiza, **Then** usa un indicador de progreso, no un color estático.

---

### User Story 3 - Acciones de resolución reutilizables, para ambos estados pendientes de revisión (Priority: P2)

El mismo componente de acciones (completar/rechazar/cancelar) sirve tanto para una interacción en `revision_humana` como en `esperando_aprobacion`, sin duplicar botones ni lógica de llamada a `resolver_revision_ia`.

**Why this priority**: son la misma operación (un superadmin resuelve una interacción pendiente); duplicarla por estado sería la misma clase de problema que el componente de insignia evita.

**Independent Test**: se renderiza el componente de acciones para una interacción en cada uno de los dos estados y se confirma que ambos ofrecen las mismas tres acciones, llamando a `resolver_revision_ia` con el mismo `interaccionId`.

**Acceptance Scenarios**:

1. **Given** una interacción en `revision_humana` o en `esperando_aprobacion`, **When** se renderizan las acciones, **Then** se ofrecen exactamente las mismas tres opciones (completar, rechazar, cancelar).
2. **Given** una interacción en cualquier otro estado, **When** se renderizan las acciones, **Then** no se muestra ninguna — no hay nada que resolver.

### Edge Cases

- La pantalla `interacciones.tsx`, al adoptar `EstadoCargaPagina`/`EstadoVacio`, debe seguir funcionando igual para el superadmin y seguir bloqueando a quien no lo es (sin cambios de permisos).
- Un error de red al resolver una interacción debe mostrarse con el patrón de error compartido, no con un `Alert` inline nuevo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `ia_interacciones.estado` DEBE aceptar `esperando_aprobacion` como valor válido.
- **FR-002**: `private.registrar_evento_interaccion_ia` DEBE aceptar la transición `respuesta_validada` → `esperando_aprobacion`, y `esperando_aprobacion` → `completada`/`rechazada`/`cancelada` — simétrico a como ya trata `revision_humana`.
- **FR-003**: Ninguna transición válida hoy DEBE dejar de ser válida — la migración es aditiva.
- **FR-004**: DEBE existir un componente reutilizable que traduzca cualquier `EstadoInteraccion` a una presentación visual consistente (etiqueta + color o progreso), ubicado junto a los demás componentes compartidos del panel.
- **FR-005**: DEBE existir un componente reutilizable de acciones de resolución (completar/rechazar/cancelar) que funcione igual para `revision_humana` y para `esperando_aprobacion`, y que no se muestre para ningún otro estado.
- **FR-006**: `apps/web/src/pages/ia/interacciones.tsx` DEBE adoptar los patrones compartidos de carga y vacío (`EstadoCargaPagina`, `EstadoVacio`) en vez de su manejo ad-hoc actual (retornar `null`, sin estado vacío).

### Key Entities

- Ninguna nueva — reutiliza `EstadoInteraccion` (`packages/ia`) y la tabla `ia_interacciones` ya existentes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las transiciones pgTAP existentes sigue pasando sin modificación.
- **SC-002**: Una interacción fixture puede recorrer `respuesta_validada` → `esperando_aprobacion` → `completada` (o `rechazada`) en la base, verificado por pgTAP.
- **SC-003**: El componente de insignia de estado cubre los 10 valores de `EstadoInteraccion` sin un caso por defecto silencioso.
- **SC-004**: `interacciones.tsx` usa los mismos componentes de carga/vacío que el resto del panel — cero `Alert` o `return null` ad-hoc para esos dos casos.

## Assumptions

- El componente de acciones sigue restringido a superadmin — mismo control de acceso que ya aplica `useIsSuperadmin` en la pantalla actual; esta entrega no cambia permisos.
- La función que crea la fila inicial de `ia_interacciones` sigue sin existir (gap preexistente); esta entrega solo corrige la tabla de transiciones para cuando esa pieza se construya.
