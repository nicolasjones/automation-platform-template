# Research: Contexto y permisos de organización para IA

## Decisión 1: sin persistencia nueva — la organización efectiva es una validación en memoria, no un dato auditado

**Decision**: esta entrega no agrega tablas ni columnas a Supabase. La validación vive enteramente en `packages/ia`, dentro de `prepararInvocacion`.

**Rationale**: se inspeccionaron todas las migraciones de `016-capacidad-ia-gobernada` (`20260920153631_capacidad_ia_gobernada.sql` y las posteriores de runtime/configuración/políticas/retención) buscando la función que inserta la fila inicial en `ia_interacciones`. No existe: `private.registrar_evento_interaccion_ia` exige que la fila ya exista (`if v_actual is null then raise exception 'Interacción IA inexistente'`), y no hay ningún otro `insert into public.ia_interacciones` en todo el repositorio fuera del fixture de un test pgTAP. La propia spec 016 documentó esto como fuera de su alcance ("la primera implementación de producto proveerá los recorridos E2E, pero no forma parte de esta spec del template") y ningún producto derivado construyó esa pieza todavía. Agregar una columna `organizacion_id` a una tabla sin ningún código que la escriba sería infraestructura sin caso de uso (constitución, Principio V) — literalmente no habría manera de poblarla hoy.

**Alternatives considered**: construir también la función que crea la fila de interacción, para poder agregar la columna de organización con sentido — rechazado, es un gap mucho más grande y preexistente (toda la persistencia de runtime), no corresponde mezclarlo con esta spec puntual; queda anotado para cuando se aborde esa pieza.

## Decisión 2: extender `prepararInvocacion`, no una función nueva separada

**Decision**: el chequeo de aislamiento se agrega como un paso más dentro de `prepararInvocacion` (`ejecutar.ts`), no como una función adicional que el consumidor tendría que acordarse de llamar.

**Rationale**: `prepararInvocacion` ya es el único funnel que todo consumidor atraviesa antes de invocar a un proveedor (valida política, presupuesto, sanitiza). Si el chequeo de organización viviera en una función aparte, un consumidor podría omitirlo por error y la garantía dejaría de ser real para "todo consumidor" — exactamente el problema que el ítem #10 del roadmap quiere cerrar (una garantía compartida, no un chequeo ad-hoc por consumidor).

**Alternatives considered**: una función `validarAislamientoOrganizacion` standalone, documentada como "obligatoria de llamar" — rechazada, depende de la disciplina de cada consumidor en vez de ser estructuralmente imposible de saltear.

## Decisión 3: parámetro opcional con default `{ organizacionId: null }`, no un campo nuevo obligatorio

**Decision**: `prepararInvocacion` gana un sexto parámetro opcional `contextoOrganizacion: { organizacionId: string | null } = { organizacionId: null }`. `ContratoConsumidor` gana un campo opcional `claveAislamientoOrganizacion?: string | null`.

**Rationale**: `ai-navigation-fallback`, el único consumidor real hoy, llama `prepararInvocacion` con los cinco parámetros existentes. Si el sexto fuera obligatorio, ese consumidor dejaría de compilar sin necesitar el chequeo (no maneja datos organizacionales, es agnóstico de dominio). Un parámetro opcional con default preserva compatibilidad binaria total — SC-002 lo exige explícitamente.

**Alternatives considered**: versionar `prepararInvocacion` como una función nueva (`prepararInvocacionConOrganizacion`) y dejar la vieja como estaba — rechazado, duplicaría la lógica de sanitización/presupuesto/política (ya se corrigió una duplicación parecida en `ai-navigation-fallback`, no tiene sentido reintroducirla acá).

## Decisión 4: recorrido recursivo igual al de `sanitizarDato`, sobre los datos de entrada crudos (antes de sanitizar)

**Decision**: la validación recorre `entrada` (el dato crudo, antes de `sanitizarDato`) buscando cualquier aparición de la clave de aislamiento declarada, en cualquier nivel de anidamiento (objetos y arrays), igual que ya hace `sanitizarDato`.

**Rationale**: si se validara DESPUÉS de sanitizar, un campo de organización que no estuviera en `datosPermitidos` ya habría sido eliminado por `sanitizarDato` antes de poder detectarlo — el chequeo se volvería inútil justo para el caso donde más importa (datos que no debían estar ahí en absoluto). Validar sobre el dato crudo, antes de filtrar, es la única forma de que el rechazo sea significativo.

**Alternatives considered**: validar solo sobre el resultado ya sanitizado — rechazada por el motivo anterior.
