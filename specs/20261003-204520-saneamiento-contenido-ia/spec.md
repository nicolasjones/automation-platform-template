# Feature Specification: Saneamiento de contenido no confiable para IA

**Feature Branch**: `saneamiento-contenido-ia`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Cierra el ítem #24 del roadmap con un disparador real ya existente, no especulativo: ai-navigation-fallback (packages/ia-navegacion) lee contenido de una página web externa que el worker está intentando recuperar — ese contenido no lo escribió quien hace la consulta, lo controla el sitio externo — y lo manda tal cual, vía entradaSanitizada, a la IA para que proponga una acción. sanitizarDato (packages/ia/src/sanitizar.ts) hoy solo filtra qué campos están permitidos y redacta por nombre de clave (password/secret/token/etc); no hace nada para marcar contenido como no confiable antes de mandarlo al modelo. Esto es un vector real de inyección de prompt: una página maliciosa podría incluir texto diseñado para que la IA ignore su tarea real (proponer una acción del vocabulario cerrado) y proponga otra cosa. Investigado el estado del arte 2026: la defensa recomendada no es una etiqueta de texto fija (un atacante puede incluirla en su propio contenido y falsificar el límite) sino un delimitador con un nonce aleatorio por invocación, imposible de adivinar de antemano, más una instrucción de sistema explícita que indica que lo delimitado es dato, no una orden. packages/ia gana una función para marcar contenido no confiable con ese patrón; ContratoConsumidor declara opcionalmente qué claves de datosPermitidos son contenido no confiable (vs. instrucciones propias del consumidor), y prepararInvocacion aplica el marcado automáticamente a esas claves antes de sanitizar — así ningún consumidor se olvida de aplicarlo a mano. Se registra cuándo se activó la defensa (si el contrato declaró claves no confiables) como parte de lo que ya se audita. Delivery scope: supabase (dentro del monorepo, sin infra nueva)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El consumidor declara qué datos son contenido no confiable, sin marcarlos a mano (Priority: P1)

Quien declara un `ContratoConsumidor` sabe qué campos de su entrada vienen de una fuente externa no controlada (una página web, un documento subido, un email) y cuáles son instrucciones propias del consumidor. Al declarar esos campos, `prepararInvocacion` los envuelve automáticamente con el delimitador de nonce antes de que lleguen al proveedor — sin que el consumidor tenga que acordarse de aplicar el marcado en cada llamada.

**Why this priority**: sin esto, el marcado depende de que cada consumidor lo implemente a mano cada vez — exactamente el tipo de olvido que ya causó el gap real en `ai-navigation-fallback` (ningún consumidor existente lo hace hoy).

**Independent Test**: se declara un `ContratoConsumidor` con una clave marcada como no confiable, se llama `prepararInvocacion` con esa clave conteniendo texto arbitrario, y se confirma que el valor resultante queda envuelto con el delimitador y el nonce, mientras que las claves no declaradas como no confiables quedan igual que antes (sin cambio de comportamiento, FR-006).

**Acceptance Scenarios**:

1. **Given** un contrato que declara una clave de `datosPermitidos` como no confiable, **When** se llama `prepararInvocacion` con esa clave conteniendo texto cualquiera, **Then** el valor resultante queda envuelto entre delimitadores que incluyen un nonce aleatorio distinto en cada invocación.
2. **Given** el mismo contrato, **When** se llama `prepararInvocacion` dos veces con el mismo contenido, **Then** el nonce usado en cada envoltorio es distinto entre ambas llamadas (no es adivinable de antemano).
3. **Given** un contrato que no declara ninguna clave no confiable, **When** se llama `prepararInvocacion`, **Then** el comportamiento es idéntico al actual — nada se envuelve (FR-006).

---

### User Story 2 - Queda registro de cuándo se activó la defensa (Priority: P2)

Quien audita una interacción de IA puede ver si esa invocación procesó contenido no confiable, sin tener que inferirlo del contrato.

**Why this priority**: la auditoría existente (`ia_eventos_interaccion`) ya registra estado y detalle sanitizado de cada interacción; sin esta señal, no hay forma de saber desde el registro si una invocación concreta estuvo expuesta a contenido externo.

**Independent Test**: con una clave no confiable declarada en el contrato, se consulta la señal de activación (una función separada de `prepararInvocacion`, que no cambia la firma de retorno que ya usan los consumidores existentes) y se confirma que devuelve la lista de claves que efectivamente se activaron, lista para que el consumidor la incluya en el detalle que ya audita, sin que `packages/ia` escriba nada en la base por su cuenta.

**Acceptance Scenarios**:

1. **Given** una invocación que marcó contenido no confiable, **When** el consumidor consulta la señal de activación con el mismo contrato y la misma entrada, **Then** obtiene explícitamente cuáles claves se activaron, disponible para que la registre si quiere — sin tener que inspeccionar el resultado ya sanitizado de `prepararInvocacion` para inferirlo.

### Edge Cases

- Una clave declarada no confiable cuyo valor no es un string (es un objeto, número, booleano, null) no se envuelve con el delimitador de texto — el marcado es de texto, no de estructura; queda sin tocar, igual que hoy.
- Una clave declarada no confiable que no está presente en la entrada no rompe nada — simplemente no hay nada que envolver.
- El delimitador y el nonce se arman ANTES de aplicar `sanitizarDato` (que filtra claves) — si la clave no confiable no está en `datosPermitidos`, ya se filtra como hoy y nunca llega a envolverse (evita un marcado inútil sobre un dato que de todas formas se descarta).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `packages/ia` DEBE exponer una función que envuelva un texto con un delimitador que incluya un nonce aleatorio distinto en cada invocación, de forma que el delimitador no sea adivinable ni falsificable por el propio contenido envuelto, más una instrucción de sistema explícita que indique que lo delimitado es dato, no una orden — pegada al propio texto, no como mensaje de sistema aparte, porque `packages/ia` no arma el prompt final (esa responsabilidad sigue siendo del consumidor).
- **FR-002**: `ContratoConsumidor` DEBE poder declarar, de forma opcional, cuáles de sus `datosPermitidos` son contenido no confiable (vs. instrucciones propias del consumidor).
- **FR-003**: `prepararInvocacion` DEBE aplicar el marcado automáticamente a las claves declaradas no confiables, después de sanitizar por campos permitidos y antes de devolver la entrada preparada — sin que el consumidor tenga que llamar la función de marcado a mano.
- **FR-004**: El marcado DEBE aplicarse solo a valores de tipo texto; valores de otro tipo en una clave declarada no confiable quedan sin modificar (Edge Case).
- **FR-005**: `packages/ia` DEBE exponer una forma de que el consumidor obtenga una señal explícita de si se activó el marcado (una función separada, consultable con el mismo contrato y entrada — no necesariamente parte del resultado de `prepararInvocacion`, para no alterar su firma y poner en riesgo FR-006), de forma que el consumidor la incluya en lo que ya audita sin que `packages/ia` escriba nada en la base por su cuenta.
- **FR-006**: Un contrato que no declara ninguna clave no confiable NO DEBE cambiar su comportamiento actual — este cambio es aditivo y opt-in, ningún consumidor existente (`ai-navigation-fallback`) cambia su resultado.

### Key Entities

- Ninguna entidad de datos nueva — extiende `ContratoConsumidor` (ya existente) con un campo opcional; no hay tabla ni migración.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un consumidor que declara contenido no confiable no puede olvidarse de marcarlo — queda envuelto automáticamente, verificado por test.
- **SC-002**: El nonce usado en el delimitador es distinto en cada invocación, verificado por test (dos llamadas con el mismo contenido producen envoltorios distintos).
- **SC-003**: Los 17 tests de `ai-navigation-fallback` y los tests existentes de `packages/ia` siguen pasando sin modificación — este cambio es aditivo y opt-in (FR-006).

## Assumptions

- Esta spec no adopta el marcado en `ai-navigation-fallback` todavía — ese consumidor seguiría sin declarar ninguna clave no confiable (sigue el mismo comportamiento de hoy) hasta que una spec de producto concreta decida cuál de los campos que lee de la página es, de verdad, contenido no confiable y lo declare en su contrato. Esta spec solo construye el mecanismo reutilizable.
- El delimitador de texto es una mitigación, no una garantía: como confirma la investigación del estado del arte 2026, un modelo puede ser convencido de ignorar el delimitador vía lenguaje natural persuasivo. La defensa arquitectónica más fuerte (un modelo sin privilegios que procese primero el contenido no confiable) queda fuera de alcance — es un cambio mucho mayor sin un caso de uso real todavía que lo justifique.
