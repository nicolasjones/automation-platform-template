# Feature Specification: Costo estimado y arnés de evaluación para IA

**Feature Branch**: `trazas-costos-evaluaciones-ia`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Cierra el ítem #13 del roadmap (Trazas, costos y evaluaciones) con lo mínimo real: un cálculo de costo estimado a partir de tokens usados y tarifa del perfil, y un arnés que corre casos de evaluación (entrada, salida esperada) contra una función ejecutora y reporta aprobado/rechazado por caso — sin agregar ninguna tabla ni columna nueva. Las trazas (quién, cuándo, qué estado) ya existen: EventoInteraccion.detalle ya es un Record<string, unknown> genérico donde un consumidor puede guardar el costo calculado sin que packages/ia necesite saberlo."

**Delivery scope**: workers

## Alcance

Agrega dos funciones puras nuevas a `packages/ia`: `calcularCostoEstimado` (aritmética simple sobre tokens y tarifa) y `ejecutarCasosEvaluacion` (corre una lista de casos contra una función ejecutora y compara resultado esperado vs. obtenido). No agrega persistencia: el costo calculado es responsabilidad del consumidor guardarlo donde corresponda (p. ej. en `detalle` de un evento de interacción, que ya es un `Record<string, unknown>` sin esquema fijo). No agrega un proveedor de precios ni descubre tarifas automáticamente — el consumidor provee la tarifa que ya conoce de su propio proveedor.

## Clarifications

### Session 2026-10-03

- Q: ¿De dónde saca el costo por token cada proveedor? → A: Fuera de alcance. No existe hoy ninguna fuente de tarifas en la plataforma (se verificó: `ia_modelos_descubiertos`/`ia_perfiles_modelo` no tienen ningún campo de precio) y agregar un catálogo de precios por proveedor sin un consumidor real que lo necesite sería infraestructura especulativa. El consumidor pasa la tarifa como parámetro, de donde la tenga (configuración propia, tabla propia, lo que sea).
- Q: ¿De dónde saca los tokens usados? → A: Fuera de alcance. La respuesta del proveedor es opaca para `packages/ia` (la interpreta cada consumidor con su propio adaptador); extraer tokens de una respuesta es específico de cada proveedor. El consumidor pasa los tokens ya extraídos.
- Q: ¿Esta entrega persiste el costo o el resultado de una evaluación en alguna tabla? → A: No. Reutiliza el contenedor genérico que ya existe (`EventoInteraccion.detalle`) sin ningún cambio de esquema; si en el futuro se necesita consultar costos agregados de forma estructurada, es una decisión aparte cuando exista esa necesidad concreta.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Calcular el costo estimado de una invocación (Priority: P1)

Un consumidor, tras recibir tokens de entrada/salida de su proveedor y conocer la tarifa de su perfil, calcula el costo estimado de una invocación con una función compartida en vez de reimplementar la aritmética en cada consumidor.

**Why this priority**: sin una función compartida, cada consumidor que quiera registrar costo reinventa el mismo cálculo, con el riesgo de que cada uno lo haga distinto (confundir por-mil con por-millón, etc.).

**Independent Test**: se llama `calcularCostoEstimado` con tokens y tarifas conocidas y se compara el resultado contra un cálculo manual.

**Acceptance Scenarios**:

1. **Given** una tarifa de costo por cada mil tokens de entrada y de salida, **When** se calcula el costo con una cantidad conocida de tokens de cada tipo, **Then** el resultado es `(tokensEntrada / 1000 * costoEntrada) + (tokensSalida / 1000 * costoSalida)`.
2. **Given** cero tokens de un tipo, **When** se calcula, **Then** esa parte no contribuye al costo total.

---

### User Story 2 - Correr casos de evaluación contra una función ejecutora (Priority: P1)

Un consumidor define una lista de casos (entrada, salida esperada) para una capacidad de IA y los corre contra su propia función ejecutora, obteniendo un reporte de qué casos aprobaron y cuáles no — para detectar que un cambio de modelo o de prompt no empeoró comportamientos ya validados.

**Why this priority**: sin un arnés compartido, "evaluar un cambio de modelo o prompt" queda como una promesa sin mecanismo — cada consumidor improvisaría su propio script de comparación.

**Independent Test**: se definen casos con una función ejecutora fija (fixture) que para algunos casos devuelve la salida esperada y para otros no; se confirma que el reporte marca cada caso correctamente.

**Acceptance Scenarios**:

1. **Given** una lista de casos con entrada y salida esperada, **When** la función ejecutora devuelve exactamente la salida esperada para un caso, **Then** ese caso se reporta aprobado.
2. **Given** la misma lista, **When** la función ejecutora devuelve algo distinto para otro caso, **Then** ese caso se reporta rechazado, con la salida obtenida junto a la esperada para poder comparar.
3. **Given** un comparador personalizado (no la igualdad por defecto), **When** se pasa como parámetro, **Then** el arnés usa ese comparador en vez de la igualdad por defecto.
4. **Given** una función ejecutora que lanza una excepción para un caso, **When** se corre el arnés, **Then** ese caso se reporta rechazado (no se detiene el resto de los casos).

### Edge Cases

- Una lista de casos vacía devuelve un reporte vacío, sin error.
- El comparador por defecto compara por igualdad estructural simple (serialización), suficiente para los datos JSON que ya maneja el resto de `packages/ia`; un consumidor con una noción más rica de "igual" pasa su propio comparador (Historia 2, Escenario 3).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE ofrecer una función que calcule el costo estimado de una invocación a partir de tokens de entrada, tokens de salida y una tarifa por cada mil tokens de cada tipo.
- **FR-002**: El sistema DEBE ofrecer una función que corra una lista de casos de evaluación (entrada, salida esperada) contra una función ejecutora provista por el consumidor y reporte, por caso, si la salida obtenida coincide con la esperada.
- **FR-003**: El arnés de evaluación DEBE aceptar un comparador personalizado opcional; sin él, DEBE usar una comparación por igualdad estructural simple.
- **FR-004**: Un caso cuya función ejecutora lanza una excepción DEBE reportarse como rechazado, sin interrumpir la ejecución de los demás casos.
- **FR-005**: Ninguna de las dos funciones DEBE escribir en Supabase ni requerir una tabla o columna nueva — el consumidor decide si y dónde persiste el resultado.

### Key Entities

- **Tarifa**: costo por cada mil tokens de entrada y de salida, provisto por el consumidor (no una entidad de plataforma).
- **Caso de evaluación**: nombre, entrada y salida esperada, provistos por el consumidor para una capacidad concreta.
- **Resultado de evaluación**: nombre del caso, si aprobó, salida obtenida y salida esperada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El costo calculado coincide exactamente con el cálculo manual esperado en todos los casos de prueba (incluidos cero tokens de un tipo).
- **SC-002**: El 100% de los casos de evaluación se reporta con su veredicto correcto (aprobado/rechazado), incluidos los casos donde la función ejecutora lanza una excepción.
- **SC-003**: Ningún consumidor existente (`ai-navigation-fallback`) requiere ningún cambio — estas son funciones nuevas e independientes, no una extensión de `prepararInvocacion` ni de ninguna función ya en uso.

## Assumptions

- Las tarifas y los tokens usados son responsabilidad exclusiva del consumidor; esta entrega no los descubre ni los persiste.
- Si en el futuro aparece la necesidad concreta de consultar costos agregados de forma estructurada (p. ej. un dashboard de costo por organización), es una entrega aparte sobre una necesidad real, no anticipada acá.
