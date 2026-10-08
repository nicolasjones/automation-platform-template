# Feature Specification: Estado, contacto y borrado restringido de clientes

**Feature Branch**: `columnas-genericas-clientes`

**Created**: 2026-10-04

**Status**: Draft

**Delivery scope**: supabase | refine

**Input**: Pedido de port-back desde el producto derivado (Nexo Contable, spec `identidad-clientes-dominio`): "Columnas genéricas de `clientes`. Estado (activo/inactivo con baja lógica), contacto (email, teléfono), observaciones, `created_at`/`updated_at` fijados por la base y no por la API (hallazgo de authz del producto), y borrado restringido cuando hay datos asociados, mediante un mecanismo genérico de 'motivo no borrable' que cada producto extiende. El CUIT, la validación de CUIT, el origen por sistema y el catálogo de fuentes son de negocio y se quedan en el producto. El catálogo de fuentes es candidato condicional; evaluá si tiene una forma genérica y documentá la decisión."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Dar de baja un cliente sin perder su historia (Priority: P1)

Un administrador de la organización deja de trabajar con un cliente. Lo marca como inactivo: el cliente sigue existiendo con todos sus datos y vínculos, deja de aparecer en la lista por defecto y se puede reactivar.

**Why this priority**: hoy `clientes` no tiene estado ni se puede borrar (no hay grant de `DELETE`), así que la única forma de "sacar" un cliente es renombrarlo. Es la necesidad más básica de cualquier cartera.

**Independent Test**: como administrador, marcar un cliente como inactivo desde la pantalla; desaparece del listado por defecto, aparece con el filtro "Inactivos" y se reactiva. Un miembro sin permiso de escritura no puede cambiar el estado.

**Acceptance Scenarios**:

1. **Given** un cliente activo, **When** el administrador lo da de baja, **Then** queda `inactivo`, conserva todos sus datos y vínculos y deja de figurar en la vista por defecto.
2. **Given** un cliente inactivo, **When** el administrador lo reactiva, **Then** vuelve a `activo`.
3. **Given** un miembro sin permiso de escritura, **When** intenta cambiar el estado, **Then** la base lo rechaza (RLS), no solo la pantalla.
4. **Given** un valor de estado distinto de `activo`/`inactivo`, **When** se intenta guardar, **Then** la base lo rechaza.

---

### User Story 2 - Registrar contacto y observaciones del cliente (Priority: P2)

El administrador carga un email y un teléfono de contacto y observaciones libres del cliente, y los ve en la ficha.

**Why this priority**: datos mínimos de cualquier cartera; sin ellos, cada producto agrega las mismas columnas con nombres distintos.

**Independent Test**: editar un cliente, cargar email, teléfono y observaciones, guardar y verlos al volver a abrirlo. Un email sin `@` se rechaza; los textos vacíos o con solo espacios se guardan como vacíos.

**Acceptance Scenarios**:

1. **Given** el formulario de un cliente, **When** se cargan email, teléfono y observaciones válidos, **Then** se guardan y se muestran.
2. **Given** un email con formato inválido o textos que superan el largo máximo, **When** se intenta guardar, **Then** la base lo rechaza con un mensaje que la pantalla traduce.
3. **Given** un campo con solo espacios, **When** se guarda, **Then** queda vacío.

---

### User Story 3 - Fechas de alta y modificación que nadie puede falsear (Priority: P1)

Quien audita un cliente confía en que su fecha de alta y su última modificación las fijó la base, no quien envió la petición.

**Why this priority**: es un hallazgo real de la revisión de autorización del producto (commit `5590754`): una sesión de la API podía mandar `created_at` arbitrario en el alta. El template tiene el mismo hueco hoy en `clientes.created_at`.

**Independent Test**: como `authenticated`, insertar un cliente con `created_at` en el pasado y actualizar otro con `updated_at` arbitrario; las fechas guardadas son las del momento de la operación. Como `postgres` (restauración), el `created_at` enviado se conserva.

**Acceptance Scenarios**:

1. **Given** un alta desde la API con `created_at` explícito, **When** se guarda, **Then** `created_at` es la hora de la base.
2. **Given** una modificación desde la API con `created_at` o `updated_at` explícitos, **When** se guarda, **Then** `created_at` no cambia y `updated_at` es la hora de la base.
3. **Given** una restauración ejecutada por un rol de mantenimiento (no de la API), **When** inserta filas con su `created_at`, **Then** se conserva.

---

### User Story 4 - Borrar solo lo que no tiene datos asociados (Priority: P2)

Un administrador cargó un cliente por error. Si el cliente no tiene nada asociado, lo borra; si tiene datos, la pantalla no ofrece borrar y le indica que lo dé de baja.

**Why this priority**: completa el ciclo de vida sin abrir un `DELETE` genérico que podría arrastrar en cascada datos de otras tablas.

**Independent Test**: crear un cliente nuevo sin vínculos y borrarlo; crear otro, vincularle un identificador externo e intentar borrarlo: la base lo rechaza y la pantalla ofrece solo "Dar de baja".

**Acceptance Scenarios**:

1. **Given** un cliente sin ninguna fila que lo referencie, **When** el administrador lo borra, **Then** se elimina.
2. **Given** un cliente referenciado por cualquier tabla (de la plataforma o del producto), **When** se intenta borrar, **Then** la base lo rechaza con un motivo y el cliente no cambia.
3. **Given** un producto derivado con un motivo propio que no es una referencia (por ejemplo, "lo trajo un sistema externo"), **When** lo declara en su punto de extensión, **Then** ese motivo también impide el borrado, sin copiar ni redefinir la lógica del template.
4. **Given** un miembro sin permiso de escritura o un cliente de otra organización, **When** intenta borrar o preguntar si es borrable, **Then** la base lo rechaza sin revelar si el cliente existe en otra organización.

### Edge Cases

- Una tabla nueva que referencie `clientes` (de la plataforma o de un producto) bloquea el borrado sin que nadie tenga que registrarla.
- Las referencias con `on delete cascade` (por ejemplo, `clientes_identificadores_externos`) también bloquean: que exista una fila asociada es motivo suficiente, aunque la base pudiera borrarla en cascada.
- Dos operaciones concurrentes (borrar el cliente y asociarle una fila) no dejan una fila huérfana ni un borrado con datos asociados.
- Las filas existentes quedan `activo`, sin contacto ni observaciones, con `updated_at = created_at`.
- El catálogo de "fuentes de clientes" del producto queda fuera de alcance (ver research.md).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `clientes` DEBE tener un estado `activo`/`inactivo` (por defecto `activo`), validado por la base.
- **FR-002**: `clientes` DEBE tener email de contacto, teléfono de contacto y observaciones, opcionales, con largo máximo y formato mínimo de email validados por la base; los textos se guardan sin espacios sobrantes y vacío equivale a ausente.
- **FR-003**: `clientes` DEBE tener fecha de última modificación. La base DEBE fijar `updated_at` en toda alta y modificación, y `created_at` en toda alta hecha por un rol de la API; ninguna modificación puede cambiar `created_at`.
- **FR-004**: Cambiar estado, contacto y observaciones DEBE respetar las mismas reglas de RLS que el resto de la edición de clientes (solo quien puede escribir en su organización).
- **FR-005**: El borrado de un cliente DEBE hacerse solo por una operación de la base que verifique permiso, organización y ausencia de motivos; no DEBE otorgarse `DELETE` directo sobre `clientes` a los roles de la API.
- **FR-006**: DEBE existir una única función que devuelva el motivo por el que un cliente no se puede borrar (o ninguno). Por defecto DEBE detectar cualquier fila de cualquier tabla que referencie al cliente por clave foránea, sin listas fijas de tablas.
- **FR-007**: Los productos derivados DEBEN poder sumar motivos propios mediante un punto de extensión que el template define vacío, sin redefinir la función de FR-006.
- **FR-008**: DEBE existir una operación para que la pantalla pregunte si un cliente es borrable antes de ofrecer la acción.
- **FR-009**: La pantalla de clientes DEBE mostrar y editar estado, contacto y observaciones, filtrar por estado (activos por defecto) y ofrecer "Borrar" solo cuando el cliente es borrable; si no, "Dar de baja".
- **FR-010**: La migración DEBE ser aditiva (columnas nuevas con default o nulas) y documentar su reversión.
- **FR-011**: El CUIT, su validación, el origen por sistema y la protección de la razón social NO forman parte de esta spec: son reglas de negocio del producto derivado.

### Key Entities

- **Cliente** (existente): suma estado, email y teléfono de contacto, observaciones y fecha de última modificación.
- **Motivo de no borrado**: valor calculado (no almacenado) que explica por qué un cliente no se puede borrar; `datos_asociados` desde el template, más los que agregue cada producto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador da de baja y reactiva un cliente en menos de 3 acciones desde la lista.
- **SC-002**: 0 altas o modificaciones desde la API logran fijar `created_at` o `updated_at`, verificado por pgTAP.
- **SC-003**: Un cliente con al menos una fila asociada en cualquier tabla con FK a `clientes` no se puede borrar, verificado por pgTAP con una tabla de prueba creada solo para el test.
- **SC-004**: Un producto derivado suma un motivo propio sin modificar ninguna función ni migración del template, verificado por una prueba que redefine solo el punto de extensión.
- **SC-005**: Las pruebas existentes de aislamiento y de clientes siguen pasando.

## Assumptions

- El producto origen ya tiene estas columnas con los mismos nombres (`estado`, `email_contacto`, `telefono_contacto`, `observaciones`, `updated_at`), así que al adoptar la capacidad no necesita renombrar nada; solo reemplaza su función de motivos por el punto de extensión.
- Los nombres de columna siguen el castellano del resto del esquema del template.
- "Dar de baja" no oculta el cliente a otras tablas ni a los workers: es un estado que cada consumidor interpreta.
