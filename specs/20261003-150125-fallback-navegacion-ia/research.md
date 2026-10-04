# Research: Fallback de navegación asistido por IA

## Decisión 1: paquete nuevo, no extensión de `packages/ia`

**Decision**: crear `packages/ia-navegacion` como paquete propio en el workspace, con `@platform/ia` como dependencia declarada (no un `peerDependency` ni código copiado).

**Rationale**: `packages/ia` es el núcleo de gobernanza (proveedores, políticas, presupuesto, interacción, purga) y ya está mergeado con su propio contrato (`016-capacidad-ia-gobernada`). El contrato de "paso recuperable / acción permitida / verificador / checkpoint" es un concepto distinto — navegación, no gobernanza de IA — y mezclarlo en el mismo paquete acoplaría dos razones de cambio diferentes. Mantenerlo separado también deja `packages/ia` libre para que cualquier otro consumidor (sin navegador) lo use sin cargar tipos de Playwright.

**Alternatives considered**: agregar un módulo `navegacion.ts` dentro de `packages/ia` — rechazado porque introduciría una dependencia de tipos de Playwright en un paquete que hoy es agnóstico de runtime; ponerlo directo en `workers/` — rechazado porque no hay todavía un worker consumidor real en este repo (la adopción de negocio es una spec de producto futura, fuera de este alcance) y una capacidad de plataforma reutilizable no debe nacer dentro de un worker concreto.

## Decisión 2: una acción propuesta, una verificación, sin reintento interno tras rechazo

**Decision**: cada invocación del mecanismo ejecuta como máximo una acción propuesta por IA y una verificación. Un verificador que no confirma éxito (o que lanza) termina esa invocación de inmediato devolviendo el control al consumidor; el mecanismo no vuelve a proponer una segunda acción dentro de la misma invocación.

**Rationale**: se verificó el código real de `packages/ia` (`interacciones.ts::registrarFallo`) y su documentación (`README.md`): un fallo de tipo `'contrato'` o `'verificador'` transiciona de inmediato a `'rechazada'` sin pasar por el camino de fallback — "Un incumplimiento de contrato o verificador se rechaza sin fallback". El presupuesto de intentos/tiempo de la política (`limiteIntentos`, `limiteSegundos`) gobierna únicamente la resiliencia técnica entre el perfil de modelo principal y el de fallback (`perfilParaFalloTecnico`) ante timeout, error técnico o respuesta inválida — nunca un segundo intento tras un rechazo de verificador. La spec original asumía lo contrario (múltiples acciones dentro del mismo presupuesto) y se corrigió durante este research para no construir un comportamiento que el núcleo ya mergeado no soporta y que, de todos modos, sería menos seguro (no limitar los intentos de la IA sobre una página real).

**Alternatives considered**: extender `packages/ia` para que un `'verificador'` también sea elegible para fallback — rechazado: cambiaría el comportamiento de un contrato ya mergeado y usado por otros consumidores potenciales, fuera del alcance de esta spec; mantener un contador de intentos propio en esta capa, llamando a `validarPresupuesto` en un loop externo con múltiples interacciones — rechazado porque reintroduce exactamente el comportamiento que el núcleo decidió no ofrecer, solo que por la puerta de atrás.

## Decisión 3: la capa es una función pura, sin persistencia ni tabla propia

**Decision**: `packages/ia-navegacion` no agrega ninguna migración de Supabase ni tabla propia. Toda persistencia de interacción, política y auditoría ya vive en `capacidad-ia-gobernada`; esta capa solo orquesta llamadas a `packages/ia` y al adaptador de navegador que el consumidor le pasa.

**Rationale**: consistente con el Principio V de la constitución (simplicidad operativa: no agregar infraestructura sin caso de uso) y con FR-010/FR-011 de la spec (no agrega canal de auditoría ni observabilidad propio). El `Delivery scope` de la spec es `workers | kestra`, no `supabase`.

**Alternatives considered**: ninguna evaluada seriamente — agregar persistencia propia contradiría directamente FR-010.

## Decisión 4: contrato de "acción permitida" como unión discriminada cerrada, no texto libre

**Decision**: el vocabulario de acciones permitidas se expresa como un conjunto fijo de formas de acción genéricas de navegador (p. ej. completar un campo, esperar un elemento, hacer clic en un elemento ya localizado por el consumidor, confirmar una descarga/operación en curso), cada una con sus propios campos tipados — no como una cadena de texto libre ni código ejecutable.

**Rationale**: FR-003 exige que toda acción propuesta por la IA pertenezca a un vocabulario explícito y se rechace si no pertenece. Una unión discriminada cerrada permite validar estructuralmente (sin necesidad de un sandbox de ejecución de código) que la propuesta de la IA es una de las formas permitidas antes de interpretarla, y permite que la sanitización de `packages/ia` (`sanitizarDato`) filtre por las claves declaradas en `datosPermitidos` del contrato del consumidor.

**Alternatives considered**: dejar que el consumidor registre funciones arbitrarias ejecutables como "acciones" — rechazado, equivale a ejecución de código arbitrario propuesto por IA, exactamente lo que FR-003 prohíbe.

## Decisión 5: gap de CI preexistente en `packages/ia`, corregido en el mismo cambio

**Decision**: los tests de `packages/ia` (`vitest run`) no están conectados a ningún script de la raíz del repo ni al workflow `validate.yml` — se descubrió que `pnpm test`, `pnpm build` y `pnpm lint` en la raíz solo apuntan a `@platform/web`. Este cambio agrega un script `test:ia` en la raíz que corre `pnpm --filter @platform/ia --filter @platform/ia-navegacion test`, lo encadena desde `pnpm test`, y agrega el paso correspondiente a `validate.yml`.

**Rationale**: sin esta corrección, los tests reales de esta nueva capacidad (y los ya existentes de `packages/ia`) nunca se ejecutarían en CI, violando la puerta de calidad de la constitución ("Toda entrega debe... pasar los tests"). Es una corrección mínima y necesaria para que esta misma entrega sea verificable, no una ampliación de alcance.

**Alternatives considered**: dejar el gap para una spec separada — rechazado, porque entonces esta propia entrega quedaría sin verificación real en CI, que es exactamente la garantía que la constitución exige para toda entrega.

## Decisión 6: `@platform/ia` necesitó `exports`/`main` — nunca se había importado como paquete

**Decision**: se agregó `"main": "./src/index.ts"` y `"exports": "./src/index.ts"` a `packages/ia/package.json`.

**Rationale**: al implementar, `vitest` falló con `Failed to resolve entry for package "@platform/ia"` — su `package.json` no declaraba ningún punto de entrada. Esto confirma que, hasta esta spec, nada fuera del propio paquete lo importaba por nombre (sus propios archivos se importan entre sí por ruta relativa). Como `build` corre con `--noEmit` (no genera `dist/`), el único punto de entrada posible hoy es el código fuente TypeScript; `vitest`/`vite-node` lo transforman en el momento, sin prebuild.

**Alternatives considered**: generar un `dist/` real con `tsc` (quitando `--noEmit`) — rechazado por ahora: cambia el contrato de build de un paquete ya mergeado (`packages/ia`) fuera del alcance de esta spec; si en el futuro se necesita publicar o consumir fuera del monorepo, se vuelve a evaluar.

## Decisión 7: el handshake de `iniciarInvocacion` es de dos pasos, y el fallback técnico requiere un loop

**Decision**: la secuencia correcta para abrir una invocación es `iniciarInteraccion()` → `iniciarInvocacion()` (iniciada → preparando) → `iniciarInvocacion()` de nuevo (preparando → invocando, recién ahí incrementa intentos y fija `perfilEfectivoId`). Un fallo técnico se maneja con un loop: `registrarFallo(interaccion, politica, 'tecnico')` devuelve una interacción con `estado: 'invocando'` y un `perfilEfectivoId` de fallback cuando hay presupuesto y perfil de fallback configurado; si devuelve `estado: 'revision_humana'`, no queda más fallback y la invocación termina.

**Rationale**: se descubrió al correr los tests por primera vez (`TRANSICION_IA_INVALIDA` al llamar `registrarFallo`/`completarInteraccion` con la interacción todavía en `'preparando'`, no `'invocando'`). Sin este loop, esta capa nunca habría aprovechado el perfil de fallback que la política ya permite — habría tratado cualquier fallo técnico como terminal en el primer intento, desaprovechando una garantía que `capacidad-ia-gobernada` ya ofrece.

**Alternatives considered**: ninguna — es el único uso correcto de la API existente; no hay una alternativa de diseño aquí, solo una lectura más cuidadosa del código ya mergeado.

## Decisión 8: el presupuesto se valida una sola vez, antes del primer intento — nunca dentro del loop de fallback

**Decision**: `prepararInvocacion` (que internamente llama `validarPresupuesto`) se invoca una sola vez, en la fase `'preparando'`, con `interaccion.intentos` todavía en 0 (antes de consumir el primer intento). El loop de reintento técnico (principal → fallback) **no** vuelve a llamar `validarPresupuesto`: la elegibilidad de cada reintento ya la decide `registrarFallo` internamente (`interaccion.intentos < politica.limiteIntentos`).

**Rationale**: la primera versión de esta capa validaba el presupuesto *dentro* del loop, con `interaccion.intentos` ya incrementado por `iniciarInvocacion`/`registrarFallo`. Eso rompía exactamente el fallback técnico que la Decisión 7 dice haber arreglado: con `limiteIntentos: 2`, tras el primer fallo técnico `registrarFallo` concede el fallback y deja `intentos = 2`; una segunda validación con `validarPresupuesto(2, 2, ...)` lanza de inmediato, antes de usar el perfil de fallback que recién se concedió. El bug lo encontró la revisión de spec (code-review) al notar que el único test de fallo técnico con fallback usaba `perfilFallbackId: null`, así que nunca ejercía el camino que rompía. Se agregó un test que configura `perfilFallbackId` real y fuerza un fallo técnico en el primer intento, confirmando que el segundo intento (con el perfil de fallback) se invoca y puede recuperar. También se agregó un reloj inyectable (`ahora: () => Date`, con default `() => new Date()`) como quinto parámetro — solo para pruebas — porque el presupuesto de **intentos** nunca puede agotarse en el chequeo previo (arranca en 0 y `limiteIntentos` mínimo es 1), así que la única forma real de probar `presupuesto_agotado` en ese punto es por tiempo, y `iniciadoEn` no es observable desde afuera sin inyectarlo.

**Alternatives considered**: revalidar el presupuesto completo en cada vuelta del loop de fallback — rechazado, es la causa del bug; dejar `presupuesto_agotado` como motivo inalcanzable y solo documentarlo como "defensivo" — rechazado porque un motivo declarado en el contrato que ningún test puede disparar es, en la práctica, código sin verificar (ver feedback del usuario: "todo tiene que estar probado sino no avanzás").

## Decisión 9: `sin_acciones_permitidas` y `accion_no_declarada` son motivos distintos

**Decision**: `sin_acciones_permitidas` se reserva exclusivamente para cuando el consumidor declaró el paso sin ningún vocabulario (`paso.accionesPermitidas.length === 0`) — el mecanismo nunca llega a invocar al proveedor. Cuando el proveedor sí fue invocado pero propuso algo fuera del vocabulario declarado (o, para `completar_campo`, un valor fuera de `valorPermitido`), el motivo es `accion_no_declarada`.

**Rationale**: la primera versión usaba `sin_acciones_permitidas` para ambos casos. La revisión de spec lo marcó como conflación: `data-model.md` documentaba un único significado y `tasks.md` (T012) ya reconocía la ambigüedad con "o equivalente", señal de que nunca se resolvió. Distinguir ambos motivos importa para quien consume el resultado: uno significa "nunca se intentó", el otro "se intentó y se rechazó la propuesta".

**Alternatives considered**: ninguna — era un nombre insuficiente, no una decisión de diseño con alternativas reales.

## Decisión 10: `AccionPropuesta` separado de `AccionPermitida`

**Decision**: `AccionPermitida` (lo que el consumidor declara como posible) y `AccionPropuesta` (lo que la IA realmente propone y lo que se ejecuta) son tipos distintos. Para `completar_campo`, `AccionPermitida` lleva `valorPermitido?: string[]` (el conjunto acotado); `AccionPropuesta` lleva `valor: string` (el valor concreto elegido).

**Rationale**: la primera versión devolvía la declaración del consumidor (`accionPermitida()`) como la acción a ejecutar, descartando cualquier valor que la IA hubiera propuesto realmente — `completar_campo` nunca podía llevar un valor, lo cual lo hace inútil para su propósito (completar un campo con *algo*). La revisión de spec lo señaló notando que solo `click_en_elemento` tenía cobertura real de test.

**Alternatives considered**: agregar `valor` directamente a `AccionPermitida` y dejar que sea opcional tanto para la declaración como para la propuesta — rechazado, mezclaría "lo que se permite" con "lo que se eligió" en un solo campo opcional, perdiendo la validación explícita de que el valor propuesto esté dentro de `valorPermitido`.
