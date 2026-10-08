# Feature Specification: Identificadores externos únicos por organización y entidades pendientes

**Feature Branch**: `identificadores-externos-por-organizacion`

**Created**: 2026-10-04

**Status**: Draft

**Delivery scope**: supabase

**Input**: Pedido de port-back desde el producto derivado (Nexo Contable, spec `identidad-clientes-dominio`, DEP-001): "`clientes_identificadores_externos`. Hoy la unicidad es global `(sistema, identificador_externo)`, no por organización: dos organizaciones colisionan y el error revela que el identificador existe en otra organización. Además, `cliente_id not null` impide representar una entidad pendiente. Especificá la unicidad por organización y evaluá si la tabla debe permitir pendientes o si conviene reemplazarla por un patrón genérico como el `dominio.empresas_sistema` del producto (organización, sistema, identificador → cliente opcional). Documentá la decisión con el criterio de plataforma frente a producto."

**Decisión** (detalle y alternativas en `research.md`): se corrige la tabla existente en lugar de reemplazarla. Gana `organizacion_id` propio, unicidad `(organizacion_id, sistema, identificador_externo)` y `cliente_id` opcional. Con eso, la tabla de plataforma pasa a ser el patrón genérico que el producto tuvo que construir aparte (organización, sistema, identificador → cliente opcional), y lo que queda en el producto es solo lo que depende de su negocio.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dos organizaciones usan el mismo identificador del mismo sistema sin chocar (Priority: P1)

Dos organizaciones atienden a la misma entidad en el mismo sistema externo (por ejemplo, la misma empresa en el mismo software de gestión), así que ven el mismo identificador. Cada una lo vincula a su propio cliente sin interferir con la otra y sin enterarse de que la otra existe.

**Why this priority**: es un defecto de aislamiento multi-tenant (Principio I de la constitución). Hoy la segunda organización recibe un error `23505` ("ya está vinculado a otro cliente") que además le revela que el identificador está en uso en otra organización.

**Independent Test**: con dos organizaciones, vincular el mismo par `(sistema, identificador)` a un cliente de cada una; las dos operaciones tienen éxito, y cada administrador ve solo su vínculo.

**Acceptance Scenarios**:

1. **Given** el par `(sistema, identificador)` vinculado en la organización A, **When** un administrador de la organización B lo vincula a un cliente suyo, **Then** se crea el vínculo en B sin error.
2. **Given** el mismo par vinculado a dos clientes de la misma organización, **When** se intenta el segundo vínculo, **Then** falla con `23505`, como hoy.
3. **Given** cualquier error de vinculación, **When** se devuelve al usuario, **Then** el mensaje solo puede referirse a datos de su propia organización.
4. **Given** vínculos existentes antes de la migración, **When** se aplica, **Then** se conservan todos y quedan asignados a la organización de su cliente.

---

### User Story 2 - Registrar una entidad externa antes de saber a qué cliente corresponde (Priority: P2)

Un proceso automático (un worker) encuentra en un sistema externo una entidad que todavía no se puede asociar a ningún cliente. La registra como pendiente; un administrador la asigna después a un cliente y, desde entonces, el mismo identificador resuelve solo en las corridas siguientes.

**Why this priority**: es el estado central que el producto origen necesitó y no pudo representar con esta tabla (`cliente_id not null`), por lo que construyó una tabla propia y dejó esta sin uso. Es P2 porque US1 corrige el defecto por sí sola.

**Independent Test**: registrar un identificador como pendiente con el rol técnico de una organización; el administrador lo ve en la lista de pendientes, lo asigna a un cliente y una segunda registración del mismo identificador devuelve ese cliente.

**Acceptance Scenarios**:

1. **Given** un identificador nunca visto en la organización, **When** el proceso lo registra, **Then** queda pendiente (sin cliente) y la operación devuelve "sin cliente".
2. **Given** un identificador ya registrado y asignado, **When** el proceso lo vuelve a registrar, **Then** devuelve el cliente asignado sin duplicar la fila.
3. **Given** un identificador pendiente, **When** el administrador lo asigna a un cliente de su organización, **Then** queda vinculado.
4. **Given** un identificador asignado, **When** el administrador lo desasigna, **Then** vuelve a pendiente; no se borra.
5. **Given** un proceso de la organización A, **When** intenta registrar o leer identificadores de la organización B, **Then** la base lo rechaza.

### Edge Cases

- Un vínculo nunca puede apuntar a un cliente de otra organización: la base lo garantiza por construcción, no por una verificación en la función.
- Dos registraciones simultáneas del mismo identificador en la misma organización producen una sola fila.
- Borrar un cliente deja de ser el único camino que elimina un vínculo: si el cliente se borra, sus vínculos se borran con él (comportamiento actual); los pendientes no tienen cliente y no se ven afectados.
- `vincular_identificador_externo` sobre un identificador pendiente de la misma organización lo asigna (no falla con "ya existe").
- La reversión a la unicidad global puede ser imposible si ya hay duplicados entre organizaciones; la reversión documentada lo contempla.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La unicidad de `(sistema, identificador_externo)` DEBE ser por organización.
- **FR-002**: Cada vínculo DEBE pertenecer a una organización explícita, y la base DEBE impedir que un vínculo con cliente apunte a un cliente de otra organización.
- **FR-003**: `cliente_id` DEBE ser opcional; un vínculo sin cliente es una entidad pendiente.
- **FR-004**: `vincular_identificador_externo` y `desvincular_identificador_externo` DEBEN conservar su firma y su contrato actual (idempotencia, permiso de administrador, no-op al desvincular algo inexistente), resolviendo los conflictos solo dentro de la organización.
- **FR-005**: DEBE existir una operación de registración para el rol técnico de una organización (worker) que cree el identificador como pendiente si no existe y devuelva el cliente asignado si existe, de forma idempotente y serializada por identificador.
- **FR-006**: DEBEN existir operaciones de administrador para asignar un pendiente a un cliente y para devolver un vínculo a pendiente.
- **FR-007**: La lectura DEBE estar aislada por organización con RLS; la escritura solo por las funciones de esta capacidad.
- **FR-008**: El vínculo PUEDE guardar un nombre visible de la entidad en el sistema externo (opcional) para que un administrador reconozca un pendiente.
- **FR-009**: La migración DEBE completar `organizacion_id` de los vínculos existentes desde su cliente y documentar su reversión, incluido el caso en que ya no sea posible.
- **FR-010**: Las pruebas pgTAP existentes de la capacidad DEBEN seguir pasando, salvo las que fijaban la unicidad global, que se reemplazan por la unicidad por organización.

### Key Entities

- **Identificador externo** (`clientes_identificadores_externos`, existente): organización, sistema, identificador en ese sistema, cliente (opcional), nombre visible (opcional), fecha de alta. Pendiente = sin cliente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dos organizaciones vinculan el mismo par `(sistema, identificador)` con éxito, verificado por pgTAP.
- **SC-002**: 0 mensajes de error de esta capacidad revelan datos de otra organización, verificado por pgTAP sobre los casos de conflicto.
- **SC-003**: Una entidad registrada como pendiente y luego asignada resuelve a su cliente en la siguiente registración, verificado por pgTAP.
- **SC-004**: El producto origen podría reemplazar la parte genérica de `dominio.empresas_sistema` (organización, sistema, identificador → cliente opcional) por esta tabla, conservando en su dominio solo lo que depende de su negocio; queda documentado como camino de adopción, no como obligación.

## Assumptions

- `sistema` sigue siendo texto libre, como decidió la spec original de esta tabla; atarlo al catálogo `sistemas_externos` es un cambio aparte.
- El rol técnico de una organización es el rol de Postgres del servidor que la atiende (`private.organizacion_del_rol_actual()`), el mismo criterio que ya usan las funciones de despacho.
- La capacidad `mapeo-identificadores-externos` sube de versión mayor, porque cambia el significado de `cliente_id` para quien la lee.
