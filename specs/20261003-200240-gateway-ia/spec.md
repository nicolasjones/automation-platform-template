# Feature Specification: Invocación real de proveedor en la capacidad de IA gobernada

**Feature Branch**: `gateway-ia`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Cierra el ítem #9 del roadmap (Gateway IA) con el gap real encontrado al revisar packages/ia: la gobernanza de IA (autenticación/credenciales, límites de presupuesto, resolución de política y proveedor) ya está centralizada en prepararInvocacion y las funciones de proveedores/politicas, pero la llamada HTTP real al proveedor de IA (OpenAI/Anthropic/Gemini/etc.) queda inyectada por cada consumidor como una función propia — packages/ia-navegacion la recibe como adaptadorIa.invocarProveedor sin implementación compartida. packages/ia/src/proveedores/index.ts ya tiene, sin exportar, toda la lógica por adaptador para armar la llamada (encabezados de autenticación específicos de Anthropic/Gemini/OpenAI-compatible, vía la función interna encabezados()) — se usa hoy solo para descubrirModelos (listar modelos disponibles), nunca para invocar un modelo. Esta spec expone esa misma lógica como una función reutilizable de invocación real (no descubrimiento) en packages/ia, para que cualquier consumidor futuro (chat IA con Supabase, RAG, servidor MCP) la use en vez de reimplementar su propio fetch con sus propios headers por proveedor. Sigue siendo agnóstica de negocio: no sabe qué consumidor la llama ni qué hace con la respuesta — solo arma y ejecuta la llamada HTTP al proveedor correcto con las credenciales y el formato de headers correctos, dado un perfil de modelo ya resuelto. El consumidor sigue siendo responsable de interpretar la respuesta cruda del proveedor (cada proveedor tiene su propio formato) y de todo lo que packages/ia ya resuelve (contrato, política, presupuesto, sanitización, aislamiento de organización) — esta spec no cambia nada de eso, solo agrega la pieza de invocación que faltaba. Delivery scope: supabase (packages/ia es parte del monorepo, sin infra nueva)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un consumidor invoca un proveedor sin reimplementar su propio fetch (Priority: P1)

Quien construye una capacidad de IA nueva (chat con Supabase, RAG, servidor MCP) necesita invocar el modelo resuelto por la política activa, con las credenciales y el formato de headers correctos para ese proveedor — sin copiar la lógica de encabezados por adaptador que `ai-navigation-fallback` ya tuvo que escribir por su cuenta.

**Why this priority**: sin esto, cada consumidor nuevo reimplementa su propio cliente HTTP por proveedor — exactamente la duplicación que el ítem #9 del roadmap (Gateway IA) pide evitar, y el riesgo real de que dos implementaciones del mismo header de autenticación diverjan con el tiempo.

**Independent Test**: se llama la función nueva con un perfil de modelo resuelto y una entrada ya sanitizada, contra un `fetch` inyectado (mismo patrón que `descubrirModelos`), y se confirma que arma la URL, el método y los headers correctos por adaptador (Anthropic, Gemini, OpenAI-compatible), devolviendo la respuesta cruda del proveedor sin interpretarla.

**Acceptance Scenarios**:

1. **Given** un perfil de modelo de adaptador `anthropic` con una clave resuelta, **When** se invoca, **Then** la llamada usa el header `x-api-key` y `anthropic-version`, igual que ya hace `descubrirModelos` para ese adaptador.
2. **Given** un perfil de modelo de adaptador `gemini`, **When** se invoca, **Then** la llamada usa el header `x-goog-api-key`.
3. **Given** un perfil de modelo de cualquier otro adaptador soportado por el catálogo (OpenAI-compatible), **When** se invoca, **Then** la llamada usa `Authorization: Bearer <clave>`.
4. **Given** una respuesta HTTP no exitosa del proveedor, **When** se invoca, **Then** la función lanza un error identificable (mismo patrón que `descubrirModelos` con `DESCUBRIMIENTO_MODELOS_IA_FALLO_<status>`), sin intentar interpretar el cuerpo de error como una respuesta válida.

---

### User Story 2 - La lógica de headers por adaptador tiene una sola fuente de verdad (Priority: P2)

Quien mantiene `packages/ia` no quiere dos lugares (descubrimiento de modelos e invocación real) con su propia copia de qué header usa cada proveedor.

**Why this priority**: duplicar esa lógica es exactamente el tipo de divergencia que esta spec existe para prevenir — si se agrega un proveedor nuevo al catálogo, alguien se olvidaría de actualizar uno de los dos lugares.

**Independent Test**: inspección del código — la función de invocación real y `descubrirModelos` comparten la misma función de armado de headers por adaptador, no dos copias.

**Acceptance Scenarios**:

1. **Given** el código de `packages/ia/src/proveedores/`, **When** se revisa, **Then** existe una única función que decide los headers por adaptador, usada tanto por el descubrimiento de modelos como por la invocación real.

### Edge Cases

- Un adaptador del catálogo que todavía no tiene una rama explícita en el armado de headers debe caer en el mismo comportamiento por defecto que ya usa `descubrirModelos` (OpenAI-compatible), no fallar en silencio.
- La función de invocación no debe interpretar, transformar ni envolver el cuerpo de la respuesta exitosa — eso sigue siendo responsabilidad exclusiva del consumidor, porque cada proveedor devuelve un formato distinto y packages/ia no debe acoplarse a ninguno en particular.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `packages/ia` DEBE exponer una función nueva que arme y ejecute una llamada HTTP real de invocación (no de descubrimiento) a un proveedor de IA, dado un perfil de modelo resuelto, una clave de credencial resuelta y una entrada ya preparada.
- **FR-002**: La función nueva DEBE reutilizar la misma lógica de armado de headers por adaptador que ya usa `descubrirModelos`, sin duplicarla.
- **FR-003**: La función nueva NO DEBE interpretar, validar contra esquema, ni transformar el cuerpo de la respuesta del proveedor — devuelve la respuesta cruda (o lanza un error identificable si la llamada no fue exitosa) y el consumidor decide qué hacer con ella.
- **FR-004**: La función nueva DEBE aceptar el mecanismo de `fetch` inyectado por quien la llama (mismo patrón que `descubrirModelos`), para mantener `packages/ia` libre de acceso a red por sí mismo y testeable sin red real.
- **FR-005**: Ningún consumidor existente (`ai-navigation-fallback`) DEBE cambiar su comportamiento por este cambio — sigue siendo válido que un consumidor provea su propia función de invocación si elige no usar la nueva (la función se agrega como pieza reutilizable, no como obligación).

### Key Entities

- Ninguna entidad de datos nueva — reutiliza `PerfilModelo` y los tipos de proveedor ya existentes en `packages/ia`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un consumidor nuevo puede invocar un proveedor real sin escribir su propia lógica de headers por adaptador — la importa de `packages/ia`.
- **SC-002**: La lógica de headers por adaptador existe en un único lugar en el código, verificable por inspección.
- **SC-003**: Los 17 tests de `ai-navigation-fallback` y los tests existentes de `packages/ia` siguen pasando sin modificación — este cambio es aditivo.

## Assumptions

- Esta spec no construye un consumidor nuevo (chat IA, RAG, MCP) — solo la pieza de invocación reutilizable que esos consumidores futuros van a necesitar. Adoptarla en un consumidor concreto es una spec separada, cuando ese consumidor exista.
- "Gateway IA" (ítem #9 del roadmap) no se resuelve por composición completa como el ítem #19: la gobernanza (auth/límites/configuración de proveedor) ya estaba centralizada antes de esta spec, pero faltaba esta pieza de invocación compartida — después de esta spec, el ítem queda sustancialmente cerrado en el sentido de "ninguna lógica de proveedor se reimplementa por consumidor", aunque no exista un único proceso de red que intermedie todas las llamadas (cada consumidor sigue ejecutando su propia llamada HTTP, solo que con la misma función compartida).
