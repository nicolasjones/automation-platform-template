# Feature Specification: Servidor MCP genérico

**Feature Branch**: `20261005-servidor-mcp-generico`

**Created**: 2026-10-05

**Status**: Implementado (port-back de un producto derivado)

**Input**: Port-back de un mecanismo ya construido y verificado en vivo en un
producto derivado (estudio-contable-automation, spec `mcp-servidor-ia`,
mergeada a su `main`). Auditoría de código confirmó que el mecanismo es
genérico de fábrica: no depende de ningún concepto del dominio de ese
producto. El único punto específico encontrado — el nombre del servidor MCP,
hardcodeado como literal — se generaliza a una variable de entorno en este
port-back.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un cliente externo de IA lee datos de una funcionalidad habilitada (Priority: P1)

Un superadmin declara, a nivel plataforma, que una funcionalidad conectable
puede ser leída vía MCP. Un cliente externo de IA (Claude, ChatGPT, cualquier
cliente MCP) se conecta con una credencial de organización y puede listar y
leer filas de esa funcionalidad, sin ver nunca datos de otra organización.

**Why this priority**: es el caso base — sin lectura no hay servidor MCP útil.

**Independent Test**: generar una credencial MCP para una organización,
conectar con un cliente MCP real, invocar la tool de lectura sobre una
funcionalidad habilitada, confirmar que solo devuelve filas de esa
organización.

**Acceptance Scenarios**:

1. **Given** una funcionalidad con lectura habilitada a nivel plataforma y
   habilitada para la organización, **When** el cliente MCP invoca la tool
   de lectura, **Then** recibe las filas reales, filtradas por organización
   en SQL (nunca en TypeScript).
2. **Given** una funcionalidad sin lectura habilitada a nivel plataforma,
   **When** el cliente MCP intenta leerla, **Then** recibe un error
   explícito, no una lista vacía ambigua.

### User Story 2 - Un cliente externo de IA propone ejecutar una acción (Priority: P2)

Mismo esquema que la lectura, pero para acciones registradas como
ejecutables: el servidor nunca ejecuta directo, siempre deja la ejecución
real sujeta a la gobernanza de aprobación ya existente en `governed-ai-core`.

**Acceptance Scenarios**:

1. **Given** una funcionalidad con ejecución habilitada, **When** el cliente
   MCP invoca la tool de ejecución, **Then** se crea una propuesta auditable,
   nunca una ejecución inmediata.

## Requirements *(mandatory)*

- **FR-001**: El servidor MCP DEBE usar el SDK oficial
  (`@modelcontextprotocol/sdk`) sin framework intermedio.
- **FR-002**: Toda lectura de datos DEBE resolverse en una función SQL
  `security definer` centralizada (`mcp_leer_fila`), nunca filtrando filas en
  TypeScript — ver `research.md` del producto de origen para el hallazgo real
  que motivó este requisito no negociable.
- **FR-003**: Lectura y ejecución son capacidades independientes,
  declaradas a nivel plataforma por funcionalidad conectada (no un único
  on/off).
- **FR-004**: El nombre del servidor MCP (identidad reportada al cliente) DEBE
  ser configurable vía variable de entorno (`MCP_SERVER_NAME`), nunca
  hardcodeado — este port-back generaliza ese único punto específico que
  tenía el producto de origen.
- **FR-005**: Las credenciales MCP se generan y revocan por organización,
  nunca compartidas entre organizaciones.

## Success Criteria *(mandatory)*

- **SC-001**: Un cliente MCP real (ej. `@modelcontextprotocol/inspector`)
  puede conectarse, listar tools y leer datos de una funcionalidad habilitada.
- **SC-002**: Los tests de `packages/mcp-server` y las migraciones de
  Supabase pasan en un producto derivado sin modificación de lógica, solo
  configuración (nombre del servidor, qué funcionalidades conecta).

## Assumptions

- El producto derivado ya tiene el panel de funcionalidades (`features`,
  `organizaciones_features`) y `governed-ai-core` adoptados — ambos son
  prerrequisito, no parte de esta spec.
