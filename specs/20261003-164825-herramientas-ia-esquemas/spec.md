# Feature Specification: Validación real de esquemas de entrada y salida para herramientas de IA

**Feature Branch**: `herramientas-ia-esquemas`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Extender capacidad-ia-gobernada (packages/ia) para que los esquemas de entrada y salida que ya declara cada contrato de consumidor (esquemaEntrada/esquemaSalida) se validen de verdad contra los datos reales, antes de invocar al proveedor y antes de que el consumidor use la respuesta. Hoy esos campos existen en el tipo y en la tabla desde la spec 016 pero ningún código los interpreta: validarSalida solo comprueba que la respuesta sea un objeto, no la valida contra ningún esquema, y ni siquiera está conectada a prepararInvocacion. Esto cierra la parte de 'Herramientas IA' (ítem #15 del roadmap) que no depende de ningún otro ítem: 'funciones explícitas que el modelo puede usar, con schema de entrada, schema de salida ... y validación de entradas/salidas' — cada contrato de consumidor ya ES una función explícita (un `consumidor_codigo` con su propio esquema); lo que falta es que ese esquema se haga cumplir."

**Delivery scope**: workers

## Alcance

Esta entrega hace cumplir, de verdad, los esquemas que `ContratoConsumidor` ya declaraba desde `016-capacidad-ia-gobernada`: valida los datos de entrada contra `esquemaEntrada` dentro de `prepararInvocacion` (el único funnel que todo consumidor ya atraviesa), y hace que `validarSalida` valide la respuesta del proveedor contra `esquemaSalida` en vez de solo comprobar que sea un objeto. No crea un registro de "herramientas" nuevo ni un concepto de "función" distinto del contrato de consumidor ya existente: cada `consumidor_codigo` ya es, estructuralmente, una función explícita con su propio esquema — lo único que faltaba era interpretarlo.

## Clarifications

### Session 2026-10-03

- Q: ¿Esta entrega agrega un registro nuevo de "herramientas" o "funciones" distinto de `ContratoConsumidor`? → A: No. El roadmap describe "funciones explícitas... con schema de entrada, schema de salida, permisos y validación" — eso ya es exactamente la forma de `ContratoConsumidor` (`codigo`, `esquemaEntrada`, `esquemaSalida`, `datosPermitidos`). Crear un concepto paralelo duplicaría lo que ya existe sin necesidad.
- Q: ¿Qué validador de JSON Schema se usa? → A: `ajv`, la librería de facto para JSON Schema en Node/TypeScript, MIT — no existe hoy ninguna dependencia de validación de esquemas en el monorepo, y escribir un validador de JSON Schema propio sería reinventar una especificación compleja en vez de usar una ya probada.
- Q: ¿Qué pasa con el consumidor real existente (`ai-navigation-fallback`), cuyos fixtures de test usan `esquemaEntrada`/`esquemaSalida: {}`? → A: `{}` es un esquema JSON Schema válido que acepta cualquier valor — sigue pasando sin cambios, sin necesidad de tocar ese paquete.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Rechazar una entrada que no cumple el esquema declarado (Priority: P1)

Un contrato de consumidor declara `esquemaEntrada` como un JSON Schema real (no solo `{}`). Al invocar, si los datos de entrada no cumplen ese esquema, el núcleo rechaza la invocación antes de sanitizar los datos o de llamar al proveedor.

**Why this priority**: sin esto, un esquema declarado es decorativo — cualquier forma de datos pasa igual, y el "contrato" de una herramienta deja de ser una garantía real.

**Independent Test**: se invoca `prepararInvocacion` con un contrato cuyo `esquemaEntrada` exige un campo obligatorio de un tipo concreto, y datos de entrada que no lo cumplen (falta el campo, o tiene el tipo equivocado); se confirma que lanza antes de sanitizar.

**Acceptance Scenarios**:

1. **Given** un `esquemaEntrada` que exige un campo `texto: string`, **When** los datos de entrada cumplen ese esquema, **Then** la invocación se prepara con normalidad.
2. **Given** el mismo esquema, **When** los datos de entrada no lo cumplen (falta el campo o tiene otro tipo), **Then** la invocación se rechaza antes de sanitizar o invocar al proveedor.
3. **Given** un `esquemaEntrada` igual a `{}` (como el de `ai-navigation-fallback` hoy), **When** se invoca con cualquier dato, **Then** no se rechaza nada — comportamiento idéntico al de antes de esta entrega.

---

### User Story 2 - Rechazar una respuesta del proveedor que no cumple el esquema declarado (Priority: P1)

Un consumidor recibe la respuesta cruda del proveedor y la valida con `validarSalida` contra el `esquemaSalida` de su contrato, antes de usarla para producir cualquier efecto.

**Why this priority**: el proveedor de IA es una fuente externa no confiable en cuanto a forma — una respuesta mal formada no debe llegar a producir un efecto de negocio solo porque "parece" un objeto.

**Independent Test**: se llama `validarSalida` con una respuesta que no es un objeto (ya cubierto hoy) y con una que sí es un objeto pero no cumple el esquema declarado (caso nuevo); ambas deben lanzar.

**Acceptance Scenarios**:

1. **Given** un `esquemaSalida` que exige un campo `resultado: string`, **When** la respuesta del proveedor lo cumple, **Then** `validarSalida` no lanza.
2. **Given** el mismo esquema, **When** la respuesta no lo cumple (tipo equivocado o campo faltante), **Then** `validarSalida` lanza.
3. **Given** una respuesta que ni siquiera es un objeto, **When** se valida, **Then** lanza `RESPUESTA_IA_INVALIDA` — comportamiento idéntico al de antes de esta entrega.
4. **Given** un `esquemaSalida` igual a `{}`, **When** se valida cualquier objeto, **Then** no lanza por esquema — comportamiento idéntico al de antes.

### Edge Cases

- Un esquema inválido en sí mismo (JSON Schema mal formado) debe producir un error claro al compilarlo, no una aceptación silenciosa de cualquier dato.
- `validarSalida` sin segundo argumento (como la llama el único test existente hoy) sigue funcionando: el esquema por defecto es `{}` (acepta cualquier objeto), preservando el comportamiento actual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El núcleo DEBE validar los datos de entrada contra el `esquemaEntrada` del contrato del consumidor, dentro de `prepararInvocacion`, antes de sanitizar los datos o invocar al proveedor.
- **FR-002**: `validarSalida` DEBE validar la respuesta contra un `esquemaSalida` recibido como parámetro, además de confirmar que sea un objeto no-array; DEBE seguir lanzando `RESPUESTA_IA_INVALIDA` cuando el valor no es un objeto, independientemente del esquema.
- **FR-003**: Un `esquemaEntrada` o `esquemaSalida` igual a `{}` NO DEBE rechazar ningún dato — compatibilidad total con contratos existentes que no declaran restricciones reales.
- **FR-004**: `validarSalida` DEBE aceptar no recibir un `esquemaSalida` explícito, usando `{}` por defecto, para no romper llamadas existentes.
- **FR-005**: Esta entrega NO DEBE crear ninguna entidad, tabla o concepto nuevo de "herramienta" o "función" distinto de `ContratoConsumidor`; el esquema que ya declara cada contrato ES la validación de esa herramienta.

### Key Entities

- Ninguna nueva — se reutiliza `ContratoConsumidor` (`esquemaEntrada`, `esquemaSalida`) ya existente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las invocaciones cuyos datos de entrada no cumplen el `esquemaEntrada` declarado se rechaza antes de invocar al proveedor.
- **SC-002**: El 100% de las respuestas que no cumplen el `esquemaSalida` declarado son detectadas por `validarSalida`.
- **SC-003**: El 100% de los contratos con esquemas `{}` (sin restricción real) se comporta exactamente igual que antes de esta entrega.
- **SC-004**: `ai-navigation-fallback`, el único consumidor real hoy, sigue pasando sus 17 tests sin ninguna modificación.

## Assumptions

- Los esquemas se expresan en JSON Schema (ya es lo que se guarda hoy en `ia_contratos_consumidor.esquema_entrada`/`esquema_salida`, tipo `jsonb`, sin otra interpretación documentada).
- Ningún consumidor existente depende de que `esquemaEntrada`/`esquemaSalida` sean ignorados — son campos obligatorios desde la spec 016 pero nunca se completaron con intención de que se ignoraran; esta entrega simplemente los hace cumplir.
