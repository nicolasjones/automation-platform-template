# Research: Invocación real de proveedor en la capacidad de IA gobernada

## Decisión 1: el endpoint de invocación no es `endpointModelos` — hace falta uno nuevo por adaptador

**Decision**: el catálogo (`proveedores/catalogo.ts`) gana una función `endpointInvocacion(proveedor: ProveedorCatalogo, modeloId)` (no un campo string fijo, porque Gemini necesita el `modeloId` interpolado en la URL, y no alcanza con el `adaptador` solo — ver más abajo) que devuelve la URL real de inferencia por adaptador:

- `openai` / `openai-compatible`: `<base>/chat/completions` (mismo host base que `endpointModelos`, quitando `/models`).
- `anthropic`: `<base>/messages` (mismo host base, quitando `/models`).
- `gemini`: `<base>/models/<modeloId>:generateContent` (el modelo va en el path, no en el cuerpo).
- `baidu`: no se admite invocación en esta spec (ver Alternativas).

**Rationale**: `endpointModelos` lista modelos disponibles; invocar un modelo real es un endpoint distinto en los cinco proveedores, descubierto recién al escribir la función (no estaba en el catálogo porque hasta ahora nada invocaba un proveedor de verdad, solo descubría modelos).

**Alternatives considered**: pedirle al consumidor la URL completa — rechazado, es exactamente la duplicación que esta spec existe para evitar (cada consumidor tendría que saber la convención de URL de cada proveedor). Cubrir los cinco adaptadores incluyendo `baidu` — se deja `baidu` fuera de esta spec (lanza `PROVEEDOR_IA_SIN_ENDPOINT_INVOCACION`): su convención de URL de inferencia (Qianfan) no se pudo confirmar con la misma certeza que los otros cuatro sin una cuenta real, y ningún consumidor hoy lo necesita — agregarlo sin verificar sería adivinar.

**Verificado contra documentación real** (no asumido): `POST https://api.anthropic.com/v1/messages` confirmado contra la documentación pública de Anthropic; `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` (modelo en el path) confirmado contra la documentación pública de Google AI — ambos coinciden con lo usado acá.

**Corrección real encontrada al escribir el test (no al plan)**: la firma original de esta decisión tomaba `adaptador` solo; `openai-compatible` agrupa proveedores con hosts distintos (x.ai, DeepSeek, Alibaba Qwen, Zhipu GLM, Moonshot Kimi) — el adaptador define el *patrón* de URL (`/chat/completions`), pero el host sale de `proveedor.endpointModelos` de cada entrada del catálogo, no de una constante por adaptador. La función recibe el `ProveedorCatalogo` completo, no solo su campo `adaptador`.

## Decisión 2: la función es solo transporte — no normaliza el cuerpo de la petición ni de la respuesta

**Decision**: `invocarProveedorIa(perfil, clave, cuerpo, fetchProveedor)` arma URL + headers + método (siempre `POST`) por adaptador, envía `cuerpo` tal cual como lo da el consumidor (`JSON.stringify`), y devuelve la respuesta cruda del proveedor sin tocarla (o lanza un error si no fue exitosa).

**Rationale**: cada proveedor espera un *cuerpo* de petición con forma distinta (mensajes de OpenAI/Anthropic no son iguales a `contents` de Gemini) y devuelve una *respuesta* con forma distinta. Normalizar eso sería una capa de traducción completa entre proveedores — mucho más grande que el gap real encontrado (que era de transporte: headers y URL, no de formato de payload) y sin un consumidor real todavía que determine qué forma normalizada tendría sentido. Construir esa traducción hoy sería especulativo (Principio V de la constitución del template).

**Alternatives considered**: normalizar a un formato tipo OpenAI (patrón común en SDKs de terceros) — rechazado por ahora: ningún consumidor real lo pide todavía (ai-navigation-fallback no invoca proveedores reales, construye su propia función `invocarProveedor` inyectada); cuando exista un consumidor real que lo necesite, esa normalización es su propia spec.

## Decisión 3: headers compartidos entre descubrimiento e invocación, una sola función

**Decision**: la función `encabezados(adaptador, clave)` que ya existe (privada) en `proveedores/index.ts` se reutiliza tal cual para la invocación real, sin duplicarla. Se exporta si hace falta usarla desde el nuevo archivo, o se mueve a un módulo compartido si crear una dependencia circular lo exige.

**Rationale**: es exactamente la lógica que esta spec existe para no duplicar (FR-002); ya está probada indirectamente por los tests de `descubrirModelos`.

**Alternatives considered**: ninguna — duplicarla sería el bug que esta spec corrige.

## Decisión 4: `fetch` inyectado, mismo patrón que `descubrirModelos`

**Decision**: la función nueva recibe el mecanismo de `fetch` como parámetro (tipo `FetchInvocacion`, análogo a `FetchModelos`), no importa `fetch` global.

**Rationale**: mantiene `packages/ia` sin acceso a red por sí mismo (ya es el patrón establecido) y testeable sin red real, igual que `descubrirModelos.test.ts` ya hace.

**Alternatives considered**: ninguna — es el patrón ya establecido, cambiarlo sin motivo sería inconsistente.
