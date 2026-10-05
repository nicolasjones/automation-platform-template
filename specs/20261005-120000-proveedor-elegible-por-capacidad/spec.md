# Feature Specification: Proveedor elegible por capacidad

**Feature Branch**: `proveedor-elegible-por-capacidad`

**Created**: 2026-10-05

**Status**: Draft

**Input**: Port de plataforma pedido por un producto derivado
(`nicolasjones/estudio-contable-automation`,
`specs/20261004-124600-proveedor-elegible-por-capacidad/research.md` R4):
"Para una capacidad dada que puede resolverse con más de un proveedor
externo, elegir cuál se usa — por organización y/o por cliente puntual —
sin lógica de negocio de ningún producto concreto." El caso real que lo
motiva (automatización propia vs. un proveedor pago de terceros para una
gestión impositiva) vive en el producto; acá se generaliza a
"capacidad x proveedor" sin ninguna mención de ese dominio.

**Delivery scope**: `supabase`

## Alcance

Un mecanismo para que, en cualquier **capacidad** que pueda resolverse con
más de un **proveedor** (ambos identificados por `sistemas_externos`, spec
`20260930-165358-catalogo-sistemas-externos`), una organización elija:

- un **default por organización** (lo que usan todos sus clientes), y
- una **excepción por cliente** (este cliente usa otro proveedor).

Resolución: excepción del cliente → default de la organización → default
del catálogo. El catálogo (qué capacidades existen y qué proveedores
puede tener cada una) lo carga cada producto derivado por migración —
este template no trae ninguna fila de negocio, solo el mecanismo.

No incluye: UI para administrar el catálogo (capacidad x proveedor es
siempre una migración), ni ningún componente de Refine (el panel que la
consuma es de cada producto, ver `docs/adoptar-kit-panel-operable.md`),
ni comparar resultados entre proveedores ni fallback automático ante una
falla (ver Edge Cases).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Elección por organización (Priority: P1)

Como organización, elijo qué proveedor usa por defecto cada capacidad que
tiene más de uno, para que todos mis clientes usen ese proveedor sin
configurarlos uno por uno.

**Independent Test**: con una capacidad de catálogo con dos proveedores,
cambiar el default de la organización y verificar que la función de
resolución devuelve el nuevo proveedor para un cliente sin excepción, y
que el cambio queda auditado.

**Acceptance Scenarios**:

1. **Given** una organización sin elección, **When** se resuelve el
   proveedor de una capacidad para cualquier cliente, **Then** es el
   default del catálogo.
2. **Given** una organización con una conexión activa al sistema externo
   que un proveedor requiere, **When** la organización lo elige, **Then**
   si ese proveedor envía la credencial del cliente a un tercero, se exige
   aceptación explícita antes de confirmar; al confirmar, la elección
   queda registrada con quién, cuándo y esa aceptación.
3. **Given** una organización sin esa conexión, **When** intenta elegir
   ese proveedor, **Then** se rechaza indicando que falta la conexión.

---

### User Story 2 - Excepción por cliente (Priority: P2)

Como organización, para un cliente puntual elijo un proveedor distinto del
default, y puedo ver de dónde sale cada resolución (propio del cliente o
heredado).

**Independent Test**: con default de organización en el proveedor B, poner
a un cliente en el proveedor A, verificar la resolución para ese cliente y
para otro sin excepción; quitar la excepción y verificar que vuelve a
heredar.

**Acceptance Scenarios**:

1. **Given** default de organización B, **When** se pone al cliente X en A,
   **Then** X resuelve A y el resto de los clientes sigue resolviendo B.
2. **Given** esa excepción, **When** se quita, **Then** X vuelve a heredar
   el default de la organización.
3. **Given** que la conexión que un proveedor requiere se borra o queda
   inválida, **When** se resuelve ese proveedor para un cliente, **Then**
   la resolución lo informa como "no disponible" (motivo explícito) y
   **nunca** cambia sola a otro proveedor.

### Edge Cases

- Capacidad con un único proveedor en el catálogo: no debe listarse como
  "elegible" (nada que elegir).
- Un proveedor que se retira del catálogo (pasa a inactivo) para una
  capacidad: las elecciones y excepciones que lo usaban dejan de ser
  válidas, la resolución cae al default del catálogo, y el retiro queda
  auditado con actor nulo (decisión del producto, no de un administrador).
- Cliente borrado: se borran sus excepciones; los eventos de auditoría
  sobreviven con `cliente_id` nulo.
- Organización distinta: nunca puede ver ni cambiar elecciones de otra.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE mantener un catálogo de capacidades con sus
  proveedores posibles, cuál es el default del catálogo, si el proveedor
  requiere una conexión de la organización a un sistema externo y si envía
  credenciales del cliente a ese proveedor.
- **FR-002**: Cada organización DEBE poder elegir, por capacidad, un
  proveedor por defecto entre los del catálogo activo.
- **FR-003**: Para cada cliente y capacidad, DEBE poder elegirse un
  proveedor que reemplace al default, y quitar esa excepción.
- **FR-004**: El sistema DEBE resolver el proveedor efectivo para
  (organización, cliente, capacidad) con precedencia cliente →
  organización → catálogo, indicando de qué nivel salió y si está
  disponible.
- **FR-005**: Elegir un proveedor que requiere una conexión de la
  organización DEBE rechazarse si no existe esa conexión. Si la conexión
  desaparece o queda inválida después, la resolución DEBE informar "no
  disponible" y NO DEBE sustituir el proveedor.
- **FR-006**: Elegir un proveedor que envía la credencial del cliente a un
  tercero DEBE exigir una aceptación explícita, registrada.
- **FR-007**: Toda elección, excepción y retiro de catálogo DEBE quedar
  auditado con actor (nulo si lo origina el sistema), momento, valor
  anterior y nuevo.
- **FR-008**: Solo quien administra la organización DEBE poder cambiar
  elecciones; cualquier miembro DEBE poder ver las vigentes.
- **FR-009**: La resolución DEBE poder consultarla el rol de orquestación
  (Kestra) y los workers de la organización, sin acceso a datos de otras
  organizaciones.

### Key Entities

- **Capacidad con proveedores** (catálogo): capacidad lógica, proveedores
  posibles, default, requisitos.
- **Elección de organización**: organización + capacidad → proveedor.
- **Excepción de cliente**: cliente + capacidad → proveedor.
- **Evento**: auditoría de toda alta/cambio/baja.

## Success Criteria *(mandatory)*

- **SC-001**: Cambiar el proveedor de todos los clientes de una
  organización es una sola operación, independiente de la cantidad de
  clientes.
- **SC-002**: El 100% de las resoluciones coincide con la precedencia
  cliente → organización → catálogo (pgTAP con todas las combinaciones).
- **SC-003**: 0 casos de cambio automático de proveedor ante una falla.
- **SC-004**: Resolución < 10 ms (PK/índices, sin tabla sin filtrar).

## Origen y adopción

Esta spec generaliza la pieza [PLATAFORMA] de
`nicolasjones/estudio-contable-automation`,
`specs/20261004-124600-proveedor-elegible-por-capacidad/`. El port-back
hacia ese repo documenta la adopción en su propio `template-adoption.json`
y `docs/wiki/sistemas/sincronizacion-template.md`; este template no
registra consumidores.

## Assumptions

- El catálogo (capacidad x proveedor) lo carga cada producto derivado por
  migración; este template no trae ninguna fila de negocio.
- El costo o límite de uso de un proveedor no se mide ni se limita acá.
- La elección es por capacidad completa, no por sección de dato dentro de
  una capacidad.
