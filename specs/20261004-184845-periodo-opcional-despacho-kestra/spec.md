# Feature Specification: Despachador por outbox con detalle opcional en Kestra

**Feature Branch**: `periodo-opcional-despacho-kestra`

**Created**: 2026-10-04

**Status**: Draft

**Delivery scope**: kestra

**Input**: Pedido de port-back desde el producto derivado (Nexo Contable): "Período opcional en `despacho-outbox` / `despacho-capacidad` (Kestra). Una capacidad sin período rompía el render del despacho. El producto lo resolvió volviéndolo opcional. Agregá además la fragilidad que se documentó ahí: el Kestra local sin `ENV_KESTRA_ORQUESTACION_DB_USERNAME` rompe el despacho si se publica un flow."

**Hallazgo previo que acota esta spec**: el template no tiene `despacho-outbox.yml` ni `despacho-capacidad.yml`. Solo tiene el contrato del outbox (spec 019, `contracts/despacho-outbox.md`) y las plantillas `plantilla-generico.yml`/`plantilla-dedicado.yml`, que describen en un comentario cómo reclamar órdenes. El par de flows que reclama y deriva por capacidad lo construyó el producto, y el defecto nació ahí. Para que el arreglo exista en el template, tiene que existir antes el despachador genérico; "período" es un campo del negocio del producto (Libro Mayor, IVA), así que acá se generaliza como "campos opcionales del `detalle` de la orden".

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Una orden sin campos opcionales en su detalle se despacha igual (Priority: P1)

Quien agrega una capacidad nueva a un producto derivado la registra, la habilita y la dispara a mano. Si esa capacidad no usa los campos opcionales que otras capacidades sí usan (en el producto origen, el período), su orden llega con `detalle = {}`. Hoy el despachador intenta leer esos campos sin valor por defecto, el render falla y la orden nunca se despacha: queda reclamada hasta que vence el lease.

**Why this priority**: es el defecto real. En el producto, "Traer clientes" (una capacidad sin período) falló así en su primera corrida real.

**Independent Test**: con el stack local de Kestra y la base, iniciar una ejecución manual de una capacidad de prueba con `detalle = {}` y otra con detalle completo; las dos órdenes se reclaman, llegan al subflow de su capacidad con los campos ausentes vacíos y se confirman.

**Acceptance Scenarios**:

1. **Given** una orden cuyo `detalle` no tiene un campo opcional, **When** el despachador la reclama, **Then** la deriva al subflow de su capacidad con ese campo vacío y no falla el render.
2. **Given** una orden con el campo presente, **When** se despacha, **Then** el subflow recibe el valor tal cual.
3. **Given** una orden de una capacidad sin flow asociado, **When** se despacha, **Then** la orden se libera con el motivo sanitizado `CAPACIDAD_SIN_FLOW` y Supabase decide reintento o agotamiento (mismo comportamiento que cualquier falla).

---

### User Story 2 - El template trae el despachador genérico listo para copiar (Priority: P1)

Quien adopta el ciclo de ejecuciones en un producto derivado encuentra en el template el par de flows que reclama órdenes del outbox, las deriva por clave de capacidad y las confirma o libera, en vez de escribirlo desde cero a partir de un comentario.

**Why this priority**: sin el despachador en el template, el arreglo de US1 no tiene dónde vivir, y el próximo producto repetiría el mismo defecto.

**Independent Test**: publicar los dos flows en un Kestra local limpio y despachar una orden de la capacidad de ejemplo de punta a punta (reclamo → derivación → confirmación).

**Acceptance Scenarios**:

1. **Given** el template recién clonado, **When** se publican los flows del despachador, **Then** Kestra los acepta sin error (incluida la regla de inputs con default, ver FR-004).
2. **Given** una falla del subflow de la capacidad, **When** termina el despacho, **Then** la orden se libera con motivo sanitizado; nunca queda reclamada sin resolver.

---

### User Story 3 - Un flow que usa una variable de entorno no declarada no llega a publicarse (Priority: P2)

Quien publica un flow que lee `{{ envs.<nombre> }}` necesita saber, antes de publicarlo, si el Kestra de destino tiene esa variable. En el producto, publicar un `despacho-outbox` que leía `envs.kestra_orquestacion_db_username` en un Kestra local cuyo contenedor no tenía `ENV_KESTRA_ORQUESTACION_DB_USERNAME` hizo fallar el despacho cada minuto durante 11 minutos sin reclamar ninguna orden.

**Why this priority**: es una fragilidad operativa, no un defecto del flujo de datos. Reduce el riesgo de US1/US2 al operar el despachador, pero no lo bloquea.

**Independent Test**: agregar a un flow de prueba una referencia a `envs.variable_inexistente` y correr la verificación estática: falla nombrando el flow y la variable. Con la variable declarada en `infra/kestra/compose.yaml`, pasa.

**Acceptance Scenarios**:

1. **Given** un flow del repo que referencia `envs.X`, **When** `infra/kestra/compose.yaml` no declara `ENV_X` (con o sin valor por defecto), **Then** la verificación estática falla.
2. **Given** la herramienta de publicación de flows del template, **When** se le pide publicar un flow con una referencia `envs.X` no declarada, **Then** se niega antes de llamar a la API de Kestra.
3. **Given** un Kestra local cuyo contenedor se creó antes de declarar una variable nueva, **When** el operador sigue la guía, **Then** sabe que tiene que recrear el contenedor (`pnpm dev:kestra` con recreación) antes de publicar.

### Edge Cases

- **Kestra 1.3.35 responde HTTP 422 a un input con `defaults` y `required: false`.** Con default, el input tiene que ser `required: true` (el default se aplica siempre). Lo encontró el producto al publicar el arreglo (commit `4e26180`).
- Un campo opcional con valor `null` explícito en el `detalle` se trata igual que ausente.
- El despachador no conoce los campos de negocio: solo propaga el `detalle` y los campos que el contrato declara opcionales. Cada producto declara los suyos (en el producto origen, `periodo_desde`/`periodo_hasta`).
- La verificación estática de variables mira el repo, no el contenedor en ejecución: no detecta un contenedor viejo. Esa parte queda cubierta por la guía operativa (US3, escenario 3).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El template DEBE incluir un flow despachador que reclame órdenes del outbox con `private.reclamar_despachos_ejecucion` y derive cada una a un flow por orden, sin HTTP desde Postgres y sin secretos de producto (contrato de la spec 019).
- **FR-002**: El template DEBE incluir un flow por orden que derive por `clave_capacidad` al subflow de esa capacidad, confirme la orden si el subflow termina bien y la libere con motivo sanitizado si falla, incluido el caso de capacidad sin flow (`CAPACIDAD_SIN_FLOW`).
- **FR-003**: El despachador DEBE tolerar órdenes cuyo `detalle` no tenga campos opcionales: cada lectura de un campo del `detalle` DEBE tener un valor por defecto vacío.
- **FR-004**: Todo input de flow con `defaults` DEBE declararse `required: true` (regla de Kestra 1.3.35).
- **FR-005**: Una verificación estática DEBE fallar si algún flow del repo lee un campo de `detalle` sin valor por defecto o declara un input con `defaults` y `required: false`.
- **FR-006**: Una verificación estática DEBE fallar si algún flow del repo referencia `envs.<nombre>` sin que `infra/kestra/compose.yaml` declare `ENV_<NOMBRE>`, y la publicación de flows del template DEBE aplicar la misma verificación antes de publicar.
- **FR-007**: El contrato del despacho por outbox y la guía de adopción DEBEN documentar los campos opcionales del `detalle`, la regla de FR-004 y la recreación del contenedor de Kestra al sumar una variable de entorno.
- **FR-008**: Los flows nuevos DEBEN seguir las convenciones de los flows existentes del template (credenciales JDBC del rol `kestra_orquestacion`, labels de capa, lease máximo de 3600 s).

### Key Entities

- **Orden de despacho**: fila reclamada del outbox (`despacho_id`, `ejecucion_id`, `organizacion_id`, `conexion_id`, `clave_capacidad`, `detalle`, `intento`, `vence_en`). Sin cambios de esquema.
- **Campos opcionales del detalle**: claves del `detalle` que algunas capacidades usan y otras no; siempre llegan al subflow, vacías si faltan.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una orden con `detalle = {}` se confirma en el primer reclamo, sin quedar reclamada hasta el vencimiento del lease.
- **SC-002**: Los dos flows nuevos se publican sin error en el Kestra local del template (versión fijada en `infra/kestra/compose.yaml`).
- **SC-003**: Las verificaciones estáticas fallan con un caso inyectado de cada tipo (campo sin default, input con default y `required: false`, variable de entorno no declarada) y pasan con el árbol del template.
- **SC-004**: Un producto derivado que ya tiene su propio despachador puede adoptar la capacidad conservando sus `cases` de negocio, sin cambiar el contrato con sus subflows.

## Assumptions

- El usuario JDBC del pooler de Supabase Cloud (`<rol>.<project_ref>`, commit `92bf38a` del producto) es otra capacidad y otro port-back: esta spec mantiene el usuario `kestra_orquestacion` literal, igual que el resto de los flows del template. La verificación de FR-006 es general y cubre ese caso cuando se porte.
- La capacidad de ejemplo del despachador es un `case` de demostración contra un worker de fixture, sin lógica de negocio.
