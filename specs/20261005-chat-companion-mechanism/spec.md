# Feature Specification: Chat companion genérico

**Feature Branch**: `20261005-chat-companion-mechanism`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Port-back de un mecanismo ya construido y verificado en vivo en un producto derivado: un chat conversacional flotante, accesible desde toda la aplicación, que puede leer datos de cualquier funcionalidad que el producto tenga registrada en el panel de funcionalidades existente, y opcionalmente proponer ejecutar una acción sobre ella — nunca la ejecuta directo, siempre queda pendiente de confirmación explícita del usuario. A nivel plataforma (no por organización), un superadmin declara para cada funcionalidad conectable si el chat puede LEER esos datos y/o EJECUTAR acciones sobre ellos (dos capacidades independientes). Usa governed-ai-core existente para la gobernanza de la invocación (prepararInvocacion, ContratoConsumidor, sanitizarDato) y su gateway (invocarProveedorIa) para la llamada HTTP real al proveedor de IA. El producto de origen descubrió, probando en vivo contra un proveedor real, 6 bugs reales en esta cadena (ya corregidos acá): Content-Type faltante en el gateway (corregido en PR #12, independiente de esta spec), objeto de política incompleto en prepararInvocacion, intentos inicial mal puesto, RLS que bloqueaba al propio chat leyendo su propia configuración, falta de wrappers public.* para RPCs invisibles a PostgREST, y sanitización de resultados de lectura con el allowlist equivocado (el de la entrada, no el de filas arbitrarias). El system prompt es configurable, sin identidad de producto hardcodeada. Delivery scope: supabase (tablas, RPCs, políticas RLS, Edge Function) y apps/web (componente flotante + pantalla de administración de capacidades)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El chat lee datos de una funcionalidad habilitada (Priority: P1)

Un usuario de una organización le pregunta al chat sobre datos de una funcionalidad que su organización tiene habilitada y que la plataforma marcó como legible por el chat. El chat responde con datos reales, obtenidos de la vista registrada para esa funcionalidad — nunca inventa un dato.

**Why this priority**: es el caso base; sin esto no hay chat companion, solo una interfaz vacía.

**Independent Test**: con una funcionalidad de prueba registrada (una vista mínima) y marcada lectura=true a nivel plataforma, y la funcionalidad habilitada para la organización del usuario, el chat responde citando filas reales de esa vista.

**Acceptance Scenarios**:

1. **Given** una funcionalidad con lectura habilitada a nivel plataforma y habilitada para la organización, **When** el usuario pregunta algo que requiere esos datos, **Then** el chat invoca la herramienta de lectura y responde con datos reales de la vista registrada.
2. **Given** una funcionalidad sin lectura habilitada a nivel plataforma (aunque esté habilitada para la organización), **When** el usuario pregunta por esos datos, **Then** el chat responde que no tiene acceso, sin inventar nada.
3. **Given** dos organizaciones distintas con la misma funcionalidad habilitada, **When** cada una usa el chat, **Then** cada una ve únicamente los datos de su propia organización (aislamiento, nunca cruzado).

---

### User Story 2 - El chat propone ejecutar una acción, nunca la ejecuta directo (Priority: P2)

Un usuario le pide al chat que dispare una acción sobre una funcionalidad marcada como ejecutable a nivel plataforma. El chat genera una propuesta pendiente de confirmación explícita — la ejecución real requiere además que el usuario tenga permiso de escritura.

**Independent Test**: con una funcionalidad marcada ejecucion=true y una acción de prueba registrada, pedirle al chat que la dispare genera un mensaje con estado `propuesta`, no una ejecución inmediata.

**Acceptance Scenarios**:

1. **Given** una funcionalidad con ejecución habilitada, **When** el usuario pide una acción registrada, **Then** el chat genera una propuesta (`estado = propuesta`) sin ejecutar nada todavía.
2. **Given** la misma propuesta, **When** un usuario sin permiso de escritura intenta confirmarla, **Then** la confirmación se rechaza.

---

### User Story 3 - Un superadmin declara lectura/ejecución por funcionalidad (Priority: P2)

A nivel plataforma, un superadmin ve una tabla con una fila por funcionalidad conectable al chat y dos toggles independientes (Lectura, Ejecución).

**Independent Test**: cambiar el toggle de lectura de una funcionalidad y confirmar que el chat deja de poder leerla inmediatamente después, sin reiniciar nada.

## Requirements *(mandatory)*

- **FR-001**: El sistema MUST permitir declarar, por funcionalidad y a nivel plataforma, si el chat puede leer y/o ejecutar sobre ella — como dos capacidades independientes.
- **FR-002**: El chat MUST operar únicamente sobre funcionalidades que la organización del usuario tiene habilitadas Y que la plataforma marcó como legibles/ejecutables.
- **FR-003**: El chat MUST aislar estrictamente por organización — nunca debe poder ver ni ejecutar nada fuera de la organización activa del usuario.
- **FR-004**: Ejecutar una acción MUST requerir una propuesta explícita, nunca ejecución directa desde el chat.
- **FR-005**: Confirmar una propuesta de ejecución MUST requerir, además de la capacidad de ejecución habilitada, que el usuario tenga permiso de escritura.
- **FR-006**: El system prompt del chat MUST ser configurable por el producto adoptante, sin identidad de producto hardcodeada en el mecanismo.

## Success Criteria *(mandatory)*

- **SC-001**: Una lectura real contra una vista registrada responde con datos reales, verificable con un proveedor de IA real (no solo un mock).
- **SC-002**: Una propuesta de ejecución queda registrada con estado `propuesta` y nunca ejecuta la acción subyacente sin confirmación explícita.
- **SC-003**: Dos organizaciones distintas con la misma funcionalidad habilitada nunca ven datos de la otra.
