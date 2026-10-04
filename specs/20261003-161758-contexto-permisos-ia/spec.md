# Feature Specification: Contexto y permisos de organización para IA

**Feature Branch**: `contexto-permisos-ia`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Extender capacidad-ia-gobernada (packages/ia) para que cada invocación declare la organización efectiva del consumidor, derivada del lado del servidor (nunca de un valor dentro de los datos de entrada ni del prompt), y para que el núcleo rechace una invocación cuando los datos de entrada contienen una referencia de organización distinta de la declarada. Esto cierra el ítem #10 del roadmap (Contexto y permisos IA): hoy ningún consumidor de capacidad-ia-gobernada tiene una garantía compartida de que los datos que llegan al proveedor correspondan solo a la organización correcta; cada consumidor tendría que inventar su propio chequeo ad-hoc."

**Delivery scope**: workers

## Alcance

Esta entrega extiende `016-capacidad-ia-gobernada` (`packages/ia`) con una validación de aislamiento por organización dentro de `prepararInvocacion`, el único funnel que ya atraviesa todo consumidor antes de invocar a un proveedor. No crea una tabla ni una columna nueva en Supabase: ya se investigó y **no existe hoy ninguna función que inserte una fila en `ia_interacciones`** (solo existen funciones para resolver política, registrar eventos sobre una interacción ya creada, y resolver revisión humana) — esa persistencia de runtime quedó explícitamente fuera del alcance de `016-capacidad-ia-gobernada` ("la primera implementación de producto proveerá los recorridos E2E, pero no forma parte de esta spec del template") y sigue sin construirse. Agregar una columna de organización a una tabla que ningún código escribe todavía sería infraestructura sin caso de uso (Principio V de la constitución); se difiere a cuando exista esa persistencia real.

## Clarifications

### Session 2026-10-03

- Q: ¿Esta entrega también debe construir la persistencia de `ia_interacciones` (la fila que hoy nadie crea)? → A: No. Es un gap real y distinto, preexistente a esta spec y a `016-capacidad-ia-gobernada`. Agregar una columna de organización a una tabla sin escritor sería infraestructura sin caso de uso. Esta spec se limita a la garantía que sí puede hacerse cumplir hoy, en el único punto que todo consumidor ya atraviesa: `prepararInvocacion`.
- Q: ¿Qué pasa con la identidad del actor (no solo la organización)? El roadmap dice "identidad, organización y alcance". → A: Fuera de alcance por el mismo motivo: la identidad del actor es un dato de auditoría que depende de la persistencia de interacciones (todavía no construida), no un dato que viaje dentro de los datos de entrada sanitizados y pueda ser falsificado por un consumidor descuidado — que es el riesgo concreto que esta spec cierra. Se deja como trabajo futuro, junto con la persistencia.
- Q: ¿Cómo declara un consumidor que su contrato maneja datos de más de una organización a la vez (por ejemplo, un reporte comparativo)? → A: No lo declara — fuera de alcance. Todo contrato que declare una clave de aislamiento asume una sola organización efectiva por invocación. Un consumidor que necesite comparar organizaciones no usa esta validación (no declara `claveAislamientoOrganizacion`) y es responsable de su propio aislamiento, igual que hoy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rechazar datos de otra organización antes de invocar al proveedor (Priority: P1)

Un consumidor declara en su contrato qué campo de sus datos de entrada identifica la organización a la que pertenecen. Al invocar, declara también la organización efectiva de la sesión que originó la solicitud. Si algún dato de entrada referencia una organización distinta, el núcleo rechaza la invocación antes de sanitizar o de llamar al proveedor.

**Why this priority**: sin esta garantía, un error en un consumidor (una consulta mal filtrada, un parámetro mezclado) podría enviar datos de la organización equivocada a un proveedor externo de IA — exactamente el tipo de fuga de aislamiento que el resto de la plataforma ya previene con RLS.

**Independent Test**: se invoca `prepararInvocacion` con un contrato que declara una clave de aislamiento, una organización efectiva, y datos de entrada que contienen esa misma clave con un valor distinto; se confirma que lanza antes de sanitizar y sin que el `adaptador` del test reciba ninguna llamada.

**Acceptance Scenarios**:

1. **Given** un contrato con clave de aislamiento declarada y una organización efectiva, **When** los datos de entrada no contienen ninguna referencia a otra organización, **Then** la invocación se prepara con normalidad.
2. **Given** el mismo contrato, **When** algún dato de entrada (en cualquier nivel de anidamiento) referencia una organización distinta de la efectiva, **Then** la invocación se rechaza antes de sanitizar los datos o de invocar al proveedor.
3. **Given** un contrato que no declara ninguna clave de aislamiento, **When** se invoca con cualquier dato de entrada, **Then** no se realiza ningún chequeo de organización — el comportamiento es idéntico al de antes de esta entrega.

---

### User Story 2 - La organización efectiva nunca viene de los datos de entrada (Priority: P1)

El núcleo nunca deriva la organización efectiva de la invocación a partir del contenido de los datos de entrada ni de ningún valor que el consumidor podría construir a partir de un prompt o de datos externos; la recibe como un parámetro explícito y separado, que el propio consumidor resolvió del lado del servidor (p. ej. de la misma fuente que ya usan las políticas RLS existentes).

**Why this priority**: si la organización efectiva pudiera influirse desde los datos de entrada, la validación de la Historia 1 sería circular y no protegería nada.

**Independent Test**: se confirma, por tipos y por un test que lo documenta explícitamente, que `prepararInvocacion` no lee ningún campo de `entrada` para determinar la organización efectiva — es exclusivamente el parámetro `contextoOrganizacion` el que la define.

**Acceptance Scenarios**:

1. **Given** datos de entrada que incluyen un campo que coincide con la clave de aislamiento y cuyo valor es igual a una organización distinta de la declarada como efectiva, **When** se invoca, **Then** se rechaza (Historia 1) — el valor dentro de los datos nunca se usa para redefinir cuál es la organización efectiva.

### Edge Cases

- Si el consumidor no pasa el parámetro de organización efectiva, se trata como "sin organización" (`null`) — igual que un consumidor que todavía no fue migrado a declarar organización.
- Una clave de aislamiento declarada que no aparece en ningún dato de entrada no produce ningún rechazo — la ausencia no es una violación, solo la presencia de un valor distinto lo es.
- La validación recorre estructuras anidadas (objetos dentro de objetos, arrays) de la misma manera que ya lo hace `sanitizarDato`, para no dejar un campo de organización escondido sin chequear.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Un contrato de consumidor DEBE poder declarar, opcionalmente, una clave de aislamiento por organización dentro de sus datos permitidos.
- **FR-002**: Toda invocación DEBE poder declarar explícitamente su organización efectiva (o su ausencia) mediante un parámetro separado de los datos de entrada.
- **FR-003**: El núcleo NO DEBE derivar la organización efectiva de ningún campo dentro de los datos de entrada; solo DEBE aceptarla por el parámetro dedicado.
- **FR-004**: Cuando un contrato declara una clave de aislamiento, el núcleo DEBE rechazar la invocación, antes de sanitizar los datos o invocar al proveedor, si algún dato de entrada (en cualquier nivel de anidamiento) contiene esa clave con un valor distinto de la organización efectiva declarada.
- **FR-005**: Cuando un contrato no declara ninguna clave de aislamiento, el núcleo NO DEBE realizar ningún chequeo de organización — el comportamiento DEBE ser idéntico al existente antes de esta entrega (compatibilidad con consumidores ya adoptados).
- **FR-006**: Esta entrega NO DEBE agregar persistencia nueva en Supabase; la organización efectiva de una invocación es, por ahora, un dato de validación en memoria, no un dato auditado — eso queda diferido a cuando exista una función que efectivamente cree la fila de interacción (gap preexistente, fuera de este alcance).

### Key Entities

- **Clave de aislamiento por organización**: nombre de campo, declarado opcionalmente por el contrato del consumidor, que identifica qué parte de los datos de entrada representa una organización.
- **Organización efectiva**: identificador de organización (o su ausencia) que el consumidor resolvió del lado del servidor para una invocación concreta; nunca se deriva de los datos de entrada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las invocaciones cuyo contrato declara una clave de aislamiento y cuyos datos de entrada referencian una organización distinta de la efectiva se rechaza antes de invocar al proveedor.
- **SC-002**: El 100% de las invocaciones de consumidores que no declaran clave de aislamiento se comporta exactamente igual que antes de esta entrega (sin falsos rechazos, sin cambio de firma obligatorio).
- **SC-003**: Un consumidor nuevo puede adoptar la validación declarando solo su clave de aislamiento y pasando su organización efectiva ya resuelta, sin implementar ningún chequeo propio.

## Assumptions

- La resolución de "cuál es la organización efectiva de la sesión actual" sigue siendo responsabilidad exclusiva del consumidor (p. ej. vía `private.organizacion_id()` u otra fuente RLS ya existente); esta capacidad no agrega una forma nueva de resolverla.
- La persistencia real de interacciones (quién creó la fila en `ia_interacciones`, con qué organización y actor) es un gap preexistente de runtime, no de esta spec ni de `016-capacidad-ia-gobernada`; cuando se construya, deberá decidir por separado si agrega las columnas de auditoría correspondientes.
- Ningún consumidor existente (`ai-navigation-fallback`) se ve afectado: no declara clave de aislamiento, así que su comportamiento no cambia.
