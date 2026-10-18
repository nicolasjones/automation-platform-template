# Feature Specification: Lectura del chat companion con descubrimiento de fuentes y filtros

**Feature Branch**: `20261018-104239-chat-lectura-filtros`

**Created**: 2026-10-18

**Status**: Draft

**Alcance de entrega**: `supabase` (tablas y RPCs del mecanismo + Edge Function). No agrega UI: el chat flotante y la pantalla de capacidades ya existen.

**Input**: User description: "Paridad del mecanismo de lectura del chat companion con el producto derivado, y filtros por rango, orden y limite en el tool de lectura. El producto derivado (estudio-contable-automation) implemento y verifico en vivo la lectura de fuentes de negocio del chat despues del port-back de `chat-companion-mechanism` 1.0.0 (spec `20261017-153259-chat-ia-consulta-datos`, registrada como evidencia de `governed-ai-core` 1.0.7 y ahora divergente del template): descubre en runtime que fuentes puede leer el usuario (`chat_fuentes_disponibles`), resuelve vistas declaradas como `esquema.tabla`, inyecta el catalogo de vistas legibles en la descripcion del tool `leer` y en el system prompt, distingue tres desenlaces (fuente no disponible / sin filas / error de consulta) y no pierde la respuesta si el modelo filtra por una columna inexistente. Ademas, el mecanismo hoy solo soporta filtros por igualdad (`eq`), un solo ciclo de tool-calling y el tope de filas de PostgREST: `leer` no puede pedir un rango de fechas, orden ni un limite, ni totales de un periodo sin traer todas las filas. Esta spec trae esa paridad al template y completa el tool de lectura con filtros por rango, orden, limite y agregaciones, para que una fuente con mas filas que el tope pueda responder un total. Es plataforma pura: opera sobre `feature_id` del panel de funcionalidades y sobre vistas que cada producto registra; el template no gana ninguna vista de negocio."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El modelo sabe exactamente qué puede consultar (Priority: P1)

Un usuario pregunta algo que sí está en una fuente registrada de su organización. El chat consulta la lista de fuentes legibles para ese usuario en la capa de datos, se la pasa al modelo como catálogo (en la descripción de la herramienta y en la instrucción de sistema) y el modelo usa el nombre exacto de la vista registrada, sin inventarlo ni negar un acceso que sí tiene.

**Why this priority**: es el bloqueo real del template hoy. La herramienta de lectura pide un nombre de vista que el modelo no tiene forma de conocer: la descripción es estática y no hay descubrimiento, así que el chat solo puede negar o alucinar el nombre. Sin esto, las historias 2 y 3 no tienen sobre qué operar.

**Independent Test**: con dos funcionalidades registradas (una legible y habilitada para la organización, otra no legible) y una consulta que requiere la primera, el chat invoca la lectura con el nombre exacto de la vista registrada y responde con filas reales; ante una pregunta que requiere la segunda, responde que no tiene acceso a esos datos.

**Acceptance Scenarios**:

1. **Given** una organización con una funcionalidad registrada, con lectura habilitada a nivel plataforma y habilitada para la organización, **When** el usuario pregunta algo de esos datos, **Then** el catálogo que recibe el modelo incluye esa vista con su descripción y el chat responde con datos reales.
2. **Given** una organización sin ninguna fuente legible, **When** el usuario pregunta un dato, **Then** el chat responde que no tiene acceso, enumerando en lenguaje claro que no hay fuentes consultables (no un "no tengo acceso" genérico).
3. **Given** una organización con una fuente legible, **When** el usuario pregunta algo que no sale de ninguna fuente, **Then** el chat dice claramente qué sí puede consultar y ofrece lo más cercano, en vez de negar en bloque.
4. **Given** un usuario de otra organización que no tiene la funcionalidad habilitada, **When** pregunta lo mismo, **Then** la vista no aparece en su catálogo y la lectura de esa vista le devuelve fuente no disponible.

---

### User Story 2 - Pedir un rango de un período y no perder la consulta por el tope de filas (Priority: P2)

Un usuario pide los datos de un período ("de julio", "entre el 1 y el 31", "los últimos 20"). El modelo puede filtrar por rango sobre una columna, ordenar el resultado y acotar cuántas filas recibe, de modo que la respuesta no depende de que la fuente tenga menos filas que el tope de la capa de datos, y no se pierde la consulta entera si un filtro apunta a una columna inexistente.

**Why this priority**: hoy el único filtro posible es igualdad. Una pregunta por período, por orden o por "los últimos N" no tiene forma de expresarse, y una fuente con más filas que el tope devuelve una respuesta truncada sin que nadie lo sepa.

**Independent Test**: contra una fuente de prueba con más filas que el tope de la capa de datos, pedir un rango de fechas con orden y límite y verificar que las filas devueltas son del rango pedido, están ordenadas y respetan el límite; pedir un rango con filtro por una columna inexistente y verificar que la consulta no se pierde.

**Acceptance Scenarios**:

1. **Given** una fuente legible con movimientos de varios meses, **When** el modelo pide el rango de un mes, **Then** la consulta devuelve solo las filas de ese rango.
2. **Given** la misma fuente, **When** el modelo pide los últimos N ordenados por fecha descendente, **Then** la respuesta trae exactamente esas filas, en ese orden.
3. **Given** un filtro sobre una columna que no existe en la fuente, **When** el modelo la consulta, **Then** la respuesta no se pierde por completo: el chat reintenta sin ese filtro (o devuelve un error contenido y explicable) y nunca responde con datos de otra organización.
4. **Given** un límite mayor al tope de la capa de datos, **When** el modelo lo pide, **Then** la consulta devuelve hasta el tope y el chat no presenta el resultado como completo.

---

### User Story 3 - Pedir un total sin traer todas las filas (Priority: P2)

Un usuario pregunta "cuánto" de un período. El modelo pide una agregación (suma, cantidad, mínimo, máximo, promedio) sobre una columna y con los filtros del período, y el chat responde el número, aunque la fuente tenga más filas que el tope de la capa de datos.

**Why this priority**: es la forma más frecuente de preguntar en este producto (totales de IVA, totales de libro mayor) y la única que no se puede resolver con detalle paginado sin multiplicar las llamadas al modelo.

**Independent Test**: contra una fuente de prueba con más filas que el tope y valores conocidos, pedir la suma y la cantidad de un período y comparar el número con el cálculo hecho sobre la fuente completa.

**Acceptance Scenarios**:

1. **Given** una fuente con más filas que el tope, **When** el modelo pide la suma de una columna para un período, **Then** la respuesta devuelve el total del período, coincidente con el cálculo directo.
2. **Given** un período sin filas, **When** el modelo pide una suma y la cantidad, **Then** la respuesta devuelve cero filas o un total nulo de forma explícita, no un error.
3. **Given** una fuente sin la columna pedida, **When** el modelo pide una agregación sobre ella, **Then** la respuesta no se pierde: el chat devuelve un error contenido y explicable.

---

### Edge Cases

- Fuente declarada en un esquema distinto de `public` (por ejemplo `dominio.libro_mayor_clasificado`): la lectura debe resolverla en ese esquema, no buscarla como tabla literal en `public`.
- Fuente con filas vacías para el filtro pedido: es "no hay resultados", distinto de "no tenés acceso" — el chat debe distinguirlo y decirlo.
- Función o vista registrada que no existe en la base (por ejemplo una fuente de un producto que aún no migró): la lectura falla contenida, sin exponer el error crudo ni romper la conversación.
- Límite negativo, cero o desmesurado: se normaliza o se rechaza con un error claro; nunca se traduce en una consulta sin tope.
- Rango con extremos invertidos (desde posterior a hasta): resultado vacío explícito, no error.
- Agregación sobre una fuente vacía: total nulo o cero explícito, no error.
- Dos organizaciones con la misma fuente habilitada: cada una ve solo sus filas, también en agregaciones y en rangos.
- Permiso de lectura revocado a nivel plataforma entre dos preguntas de la misma conversación: la segunda lectura responde fuente no disponible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE descubrir en runtime, con la sesión del usuario y en la capa de datos, el conjunto de fuentes que ESE usuario puede leer (funcionalidad legible a nivel plataforma y habilitada para su organización). El modelo nunca decide qué fuentes existen.
- **FR-002**: El catálogo de fuentes legibles DEBE llegarle al modelo por dos vías redundantes: la descripción de la herramienta de lectura (con el nombre exacto de la vista y su descripción) y la instrucción de sistema.
- **FR-003**: Cuando no hay ninguna fuente legible, o la pregunta no sale de ninguna, el sistema DEBE responder enumerando en lenguaje claro qué sí puede consultar (o que no hay fuentes), en vez de un "no tengo acceso" genérico.
- **FR-004**: El sistema DEBE distinguir y comunicar tres desenlaces distintos de una lectura: fuente no disponible (no hay permiso o la fuente no existe para esa organización), consulta sin filas (no hay resultados para ese filtro) y error de consulta (no se pudo consultar). No DEBE tratarlos como equivalentes.
- **FR-005**: El sistema DEBE poder leer fuentes declaradas como `esquema.tabla` en un esquema distinto de `public`, sin buscar el nombre completo como tabla literal.
- **FR-006**: Los filtros de una lectura DEBEN soportar, además de la igualdad ya existente: comparaciones por rango (mayor o igual y menor o igual, o equivalentes "entre") sobre una columna.
- **FR-007**: La lectura DEBE poder ordenar el resultado por una columna, ascendente o descendente.
- **FR-008**: La lectura DEBE poder acotar explícitamente cuántas filas devuelve, con un valor por defecto acotado y un tope máximo que nunca se excede; cuando el resultado se cortó por el tope, el sistema NO DEBE presentarlo como completo.
- **FR-009**: La lectura DEBE poder devolver agregaciones sobre una columna (suma, cantidad, mínimo, máximo, promedio) junto con los filtros de rango, sin traer las filas individuales.
- **FR-010**: Un filtro, orden o agregación sobre una columna inexistente NO DEBE hacer perder la respuesta completa: el sistema reintenta sin ese criterio o devuelve un error contenido y explicable, sin exponer errores crudos de la capa de datos.
- **FR-011**: La lectura DEBE seguir siendo de solo lectura y ejecutarse con la sesión del usuario (RLS / `security_invoker`), nunca con credenciales elevadas: el aislamiento por organización de las fuentes del producto no cambia, tampoco en rangos y agregaciones.
- **FR-012**: El sistema DEBE seguir siendo fail-closed: sin fuente registrada y permiso de lectura vigente, la lectura falla cerrado, aun si el modelo pide el nombre correcto.
- **FR-013**: Si el modelo no devuelve texto de respuesta, el sistema DEBE responder un mensaje que enumere las fuentes consultables en lenguaje claro, en vez de dejar la conversación sin salida.
- **FR-014**: El mecanismo DEBE exponer, para cada fuente, qué columnas se pueden usar en filtros, orden y agregaciones, y esa información DEBE llegarle al modelo, de modo que no tenga que adivinar nombres de columna.
- **FR-015**: Incorporar una fuente nueva DEBE seguir siendo una operación de datos (registrar la funcionalidad y su vista), sin editar el código del chat.
- **FR-016**: El system prompt del chat DEBE seguir siendo configurable por producto, sin identidad de producto hardcodeada en el mecanismo.
- **FR-017**: El registro de fuentes NO DEBE permitir dos fuentes activas con el mismo nombre de vista para la misma funcionalidad (unicidad por funcionalidad y vista).

### Key Entities *(include if feature involves data)*

- **Funcionalidad registrada**: capacidad del panel de funcionalidades existente del template; el chat opera siempre sobre su `feature_id`.
- **Fuente consultable**: vista o relación de negocio registrada para una funcionalidad, con su nombre (con esquema opcional), descripción y metadatos de qué columnas se pueden filtrar, ordenar y agregar.
- **Capacidad de chat**: por funcionalidad, si el chat puede leer y/o ejecutar; la lectura recorta por organización habilitada y por permiso del usuario.
- **Catálogo legible**: conjunto de fuentes que el usuario puede leer, resuelto en la capa de datos e inyectado al modelo.
- **Consulta de lectura**: pedido del modelo sobre una fuente: filtros (igualdad, rango), orden, límite y agregaciones opcionales.
- **Desenlace de lectura**: fuente no disponible, sin filas o error de consulta — tres resultados distintos para el usuario.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En las pruebas de la spec, el 100% de las lecturas exitosas usa el nombre exacto de una vista registrada en el catálogo (0 nombres inventados por el modelo).
- **SC-002**: Una consulta de totales de un período sobre una fuente con más filas que el tope de la capa de datos devuelve el valor correcto, verificado contra el cálculo directo sobre la fuente completa.
- **SC-003**: 0 respuestas con datos de otra organización, incluidas las consultas con rango, orden y agregación.
- **SC-004**: 0 consultas perdidas por un filtro sobre una columna inexistente (hoy: la consulta completa falla).
- **SC-005**: 100% de las preguntas fuera de permiso reciben un aviso explícito, con la enumeración de lo que sí se puede consultar.
- **SC-006**: Un producto derivado actualiza el mecanismo con `git merge upstream/main` sin reescribir la lógica de lectura (una sola implementación del descubrimiento y de los filtros, no dos).

## Assumptions

- El chat companion (`chat-companion-mechanism` 1.0.1) y la capacidad de IA gobernada (`governed-ai-core` 1.8.0) ya están en el template; esta spec los extiende, no los reemplaza.
- El producto derivado ya construyó y verificó en vivo la parte de descubrimiento, resolución de esquema, catálogo y los tres desenlaces: se porta como paridad, no se rediseña.
- El tope de filas de la capa de datos (PostgREST `max_rows`) sigue existiendo y no se cambia; el mecanismo se adapta a él con límite explícito y agregaciones.
- El aislamiento real de datos vive en la RLS de la vista registrada por cada producto; el mecanismo no agrega un segundo allowlist de columnas sobre las filas leídas.
- La pantalla de administración de capacidades y el chat flotante ya existen: esta spec no agrega UI.
- Fuera de alcance: la ejecución de acciones (ya cubierta y sin cambios por esta spec), el servidor MCP, la búsqueda documental, la persistencia de costo y latencia por interacción (gap preexistente documentado en la spec del template) y cualquier vista de negocio concreta.

## Dependencies

- `chat-companion-mechanism` (tablas, RPCs, RLS y Edge Function del chat) y `governed-ai-core` (gobernanza de la invocación y gateway al proveedor), ya en el template.
- Producto derivado de origen: `estudio-contable-automation`, spec `20261017-153259-chat-ia-consulta-datos` (código verificado en vivo contra un proveedor real), más el uso concreto que motiva los totales: libro mayor y IVA del mismo producto.
