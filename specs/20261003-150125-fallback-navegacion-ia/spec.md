# Feature Specification: Fallback de navegación asistido por IA

**Feature Branch**: `fallback-navegacion-ia-generico`

**Created**: 2026-10-03

**Status**: Draft

**Input**: User description: "Una capacidad genérica reutilizable, sin lógica de negocio ni nombres de sistemas externos, para que cualquier worker de navegador (Playwright) de un producto derivado recupere un paso de navegación bloqueado usando IA a través del núcleo ya existente de capacidad-ia-gobernada (packages/ia). El consumidor declara pasos de navegación recuperables con su alcance/dominio autorizado, una lista explícita de acciones de navegador permitidas que la IA puede proponer, y un verificador determinista propio que confirma que la acción resolvió el paso antes de continuar. El mecanismo opera siempre dentro de la misma sesión/contexto ya autenticado del consumidor; nunca reautentica, nunca abre sesión nueva, nunca sale del dominio declarado. Tras una recuperación verificada, el worker reanuda desde un checkpoint idempotente sin repetir efectos ya confirmados. Casos no recuperables detienen el mecanismo y devuelven el control al consumidor, reusando la revisión humana que ya provee capacidad-ia-gobernada. Los reintentos de infraestructura del orquestador nunca cuentan como intentos de este mecanismo. La adopción para un caso de negocio concreto es una spec de producto separada, fuera de este alcance."

**Delivery scope**: workers | kestra

## Alcance

Esta entrega aporta una capa genérica intermedia entre `capacidad-ia-gobernada` (`016-capacidad-ia-gobernada`, implementada en `packages/ia`) y cualquier worker de navegador de un producto derivado: un mecanismo para recuperar un paso de navegación bloqueado proponiendo, vía IA, una acción dentro de un vocabulario explícito que el propio consumidor declaró, verificándola localmente antes de continuar. No crea proveedores, claves, modelos, políticas globales, auditoría ni revisión humana propias — todo eso ya existe en `packages/ia` y esta capa lo reutiliza sin duplicarlo. No conoce ningún sistema externo, dominio de negocio ni producto concreto; la adopción para un caso real es una spec de producto separada.

## Clarifications

### Session 2026-10-03

- Q: ¿Quién declara el vocabulario de acciones permitidas y los verificadores — el núcleo o el consumidor? → A: El consumidor, por paso recuperable; el núcleo nunca ofrece acciones por defecto ni verificadores genéricos, porque ambos dependen de la estructura de cada sitio.
- Q: ¿Qué pasa si el consumidor no declaró un paso como recuperable? → A: El mecanismo nunca se invoca; el worker sigue su propio manejo de error existente. Esta capacidad no detecta bloqueos, solo los resuelve cuando el consumidor decide invocarla.
- Q: ¿El presupuesto de intentos/tiempo es propio de esta capacidad o el de `capacidad-ia-gobernada`? → A: Es el mismo presupuesto de la política activa del consumidor en `packages/ia`; esta capa no define un límite adicional ni lo duplica, solo lo consume.
- Q: ¿Qué pasa si el consumidor invoca el mecanismo sin tener una política activa configurada en `capacidad-ia-gobernada`? → A: Es el mismo caso que cualquier otro fallo no recuperable: el mecanismo se detiene antes de proponer o ejecutar cualquier acción y devuelve el control al consumidor con ese motivo, sin crear una ruta de error distinta a la ya cubierta por FR-009.
- Q: ¿Una invocación puede reintentar una segunda acción propuesta por IA después de que el verificador rechace la primera, dentro del mismo presupuesto? → A: No. `packages/ia` ya define ese comportamiento para toda la capacidad de IA gobernada: un rechazo de verificador o de contrato termina la interacción de inmediato, sin fallback ("Un incumplimiento de contrato o verificador se rechaza sin fallback", `packages/ia/README.md`). Esta capa no puede ofrecer un comportamiento distinto al del núcleo que reutiliza. El presupuesto de intentos/tiempo de la política sigue existiendo, pero gobierna únicamente la resiliencia técnica entre modelo principal y de fallback dentro de una misma invocación, no una segunda propuesta de acción tras un rechazo de verificador.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Recuperar un paso de navegación bloqueado (Priority: P1)

Un worker de navegador invoca el mecanismo común cuando su camino determinista se bloquea en un paso que declaró recuperable, con su alcance de dominio, sus acciones permitidas y su verificador. El mecanismo propone una acción del vocabulario declarado, la ejecuta dentro de la misma sesión y verifica el resultado antes de devolver el control.

**Why this priority**: sin esta recuperación, cualquier cambio menor de interfaz en un sitio externo interrumpe la automatización completa y obliga a reiniciar sesión o intervención manual.

**Independent Test**: un consumidor fixture declara un paso recuperable con dos acciones permitidas y un verificador que detecta un elemento esperado; se simula el bloqueo y se confirma que el mecanismo elige una acción del vocabulario declarado, la ejecuta en la misma `Page`/`BrowserContext` recibida, y solo devuelve éxito cuando el verificador lo confirma.

**Acceptance Scenarios**:

1. **Given** un paso declarado recuperable con acciones permitidas y verificador, **When** el camino determinista del consumidor falla, **Then** el mecanismo propone una acción exclusivamente del vocabulario declarado y la ejecuta en la sesión ya autenticada del consumidor.
2. **Given** una acción ejecutada, **When** el verificador del consumidor confirma el resultado esperado, **Then** el mecanismo devuelve control al consumidor con éxito y sin reiniciar sesión.
3. **Given** una acción ejecutada, **When** el verificador del consumidor NO confirma el resultado esperado, **Then** el mecanismo no asume éxito, detiene esa invocación de forma terminal y devuelve el control al consumidor sin proponer una segunda acción dentro de la misma invocación.

---

### User Story 2 - Reanudar sin duplicar efectos (Priority: P1)

Tras una recuperación verificada, el worker continúa su extracción desde un checkpoint idempotente, sin repetir una descarga, importación o escritura que ya haya sido confirmada antes del bloqueo.

**Why this priority**: una recuperación que duplica efectos es peor que no recuperar — genera datos incorrectos de forma silenciosa.

**Independent Test**: se simula un bloqueo posterior a un efecto ya confirmado (por ejemplo, una descarga ya registrada); se verifica que, tras la recuperación, el mecanismo no vuelve a disparar ese efecto y el consumidor retoma desde el checkpoint declarado.

**Acceptance Scenarios**:

1. **Given** un checkpoint idempotente declarado antes del paso bloqueado, **When** la recuperación se verifica con éxito, **Then** el consumidor reanuda desde ese checkpoint sin repetir el efecto ya confirmado.
2. **Given** una recuperación que requiere más de un intento, **When** cada intento ejecuta una acción, **Then** ninguna acción intermedia dispara un efecto de negocio fuera del paso declarado recuperable.

---

### User Story 3 - Detener un caso no recuperable (Priority: P1)

Cuando el bloqueo no es seguro de resolver con el mecanismo común — sesión inválida, autenticación adicional exigida por el sitio, dominio fuera de lo declarado, resultado incierto, o presupuesto de intentos/tiempo agotado — el mecanismo se detiene y devuelve el control al consumidor sin intentar nada fuera de lo autorizado.

**Why this priority**: adoptar este mecanismo no debe convertir una falla de navegación en una acción externa no verificable ni en un intento de evadir un control de seguridad del sitio.

**Independent Test**: se fuerzan, por separado, un dominio no declarado, una sesión marcada como inválida por el propio consumidor, y un verificador que nunca confirma éxito; en los tres casos el mecanismo se detiene antes de ejecutar o de agotar el presupuesto sin verificación, y conserva el motivo original para el manejo de error del consumidor.

**Acceptance Scenarios**:

1. **Given** una acción candidata que requeriría salir del dominio declarado por el consumidor, **When** el mecanismo la evalúa, **Then** la rechaza sin ejecutarla y detiene la recuperación.
2. **Given** un presupuesto de intentos o tiempo agotado sin verificación exitosa, **When** se alcanza el límite, **Then** el mecanismo se detiene y deriva al camino de revisión humana que ya provee `capacidad-ia-gobernada`, sin crear un canal de escalamiento propio.
3. **Given** un reintento de infraestructura del orquestador sobre la misma tarea, **When** ocurre, **Then** no se contabiliza como un intento de este mecanismo.

### Edge Cases

- Un consumidor puede declarar un paso recuperable cuyo verificador depende de una ventana o pestaña emergente del navegador; el mecanismo no asume que el resultado vive en la página original.
- Si el consumidor no declaró ninguna acción permitida para un paso, el mecanismo no tiene vocabulario para proponer y debe detenerse de inmediato, sin invocar a la IA.
- Un verificador que lanza una excepción se trata igual que un verificador que no confirma éxito: la invocación termina sin éxito, de forma terminal, igual que un rechazo de contrato.
- Dos invocaciones concurrentes del mecanismo sobre la misma sesión/contexto de navegador no están soportadas por esta capacidad; la concurrencia de ejecución es responsabilidad del consumidor, igual que en el resto de `capacidad-ia-gobernada`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir que un consumidor declare un paso de navegación como recuperable, junto con su alcance/dominio autorizado, su vocabulario de acciones permitidas y su verificador determinista propio.
- **FR-002**: El mecanismo DEBE invocarse únicamente cuando el consumidor lo solicita explícitamente tras un fallo de su propio camino determinista; nunca debe detectar bloqueos por sí mismo.
- **FR-003**: Toda acción propuesta por la IA DEBE pertenecer al vocabulario de acciones permitidas declarado por el consumidor para ese paso; una acción fuera de ese vocabulario DEBE rechazarse antes de ejecutarse.
- **FR-004**: El mecanismo DEBE ejecutar la acción propuesta dentro de la misma sesión y contexto de navegador ya autenticado que recibió del consumidor; no DEBE reautenticar, no DEBE abrir una sesión nueva, y no DEBE navegar fuera del dominio declarado por el consumidor para ese paso.
- **FR-005**: El mecanismo NO DEBE considerar exitosa una recuperación sin que el verificador determinista del consumidor confirme el resultado esperado; una verificación fallida o que lanza una excepción DEBE terminar esa invocación sin éxito de forma inmediata, sin proponer una segunda acción dentro de la misma invocación.
- **FR-006**: Tras una recuperación verificada, el consumidor DEBE poder reanudar desde un checkpoint idempotente declarado por él mismo, sin que el mecanismo repita efectos de negocio ya confirmados.
- **FR-007**: El mecanismo DEBE reutilizar exclusivamente el presupuesto de intentos y tiempo de la política activa del consumidor en `capacidad-ia-gobernada` para la resiliencia técnica entre modelo principal y de fallback dentro de una misma invocación; no DEBE definir, acumular ni exponer un presupuesto propio independiente, y no DEBE usar ese presupuesto para ofrecer una segunda acción tras un rechazo de verificador o de contrato.
- **FR-008**: Un reintento de infraestructura del orquestador sobre la misma tarea NO DEBE contabilizarse como un intento de este mecanismo.
- **FR-009**: Ante sesión inválida, autenticación adicional exigida por el sitio, dominio fuera de lo declarado, resultado incierto, presupuesto agotado o ausencia de una política activa en `capacidad-ia-gobernada` para ese consumidor, el mecanismo DEBE detenerse y devolver el control al consumidor, incluyendo el motivo, para que use su propio manejo de error y la revisión humana ya provista por `capacidad-ia-gobernada`; no DEBE crear un canal de escalamiento ni de auditoría paralelo.
- **FR-010**: El mecanismo DEBE emitir únicamente los eventos sanitizados que ya provee `capacidad-ia-gobernada`; no DEBE agregar un canal de observabilidad propio ni registrar valores de negocio, selectores o contenido de la página.
- **FR-011**: El mecanismo NO DEBE conocer ni referenciar ningún sistema externo, dominio de negocio o producto concreto; toda su superficie DEBE expresarse en términos de pasos, acciones, verificadores y checkpoints declarados por el consumidor.

### Key Entities

- **Paso recuperable**: declaración de un consumidor que vincula un bloqueo posible de su camino determinista con un alcance/dominio autorizado, un vocabulario de acciones permitidas, un verificador propio y un checkpoint de reanudación.
- **Acción permitida**: operación de navegador explícita y acotada (dentro del vocabulario declarado por el consumidor) que la IA puede proponer para un paso recuperable; nunca código ni URL arbitraria.
- **Verificador**: función determinista aportada por el consumidor que confirma, sin intervención de IA, si una acción ejecutada resolvió el paso bloqueado.
- **Checkpoint de reanudación**: punto idempotente declarado por el consumidor desde el que puede continuar tras una recuperación verificada, sin duplicar efectos ya confirmados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100% de las acciones ejecutadas por el mecanismo pertenece al vocabulario de acciones permitidas declarado por el consumidor para ese paso; ninguna acción fuera de ese vocabulario llega a ejecutarse.
- **SC-002**: El 100% de las recuperaciones que el mecanismo reporta como exitosas fue confirmada por el verificador propio del consumidor.
- **SC-003**: El 100% de las reanudaciones tras una recuperación verificada continúa desde el checkpoint declarado sin repetir un efecto ya confirmado.
- **SC-004**: El 100% de los casos de dominio no autorizado, sesión inválida, autenticación adicional o presupuesto agotado termina sin ejecutar una acción fuera de lo declarado y sin crear un canal de escalamiento distinto al ya existente en `capacidad-ia-gobernada`.
- **SC-005**: Un consumidor nuevo puede adoptar el mecanismo declarando sus pasos recuperables, acciones y verificadores, sin implementar presupuesto, auditoría ni revisión humana propios.

## Assumptions

- `capacidad-ia-gobernada` (`016-capacidad-ia-gobernada`, `packages/ia`) ya está disponible y configurada con al menos un proveedor y una política activa; esta capacidad no la reemplaza ni la reconfigura.
- El consumidor es responsable de la concurrencia y el ciclo de vida de su propia sesión/contexto de navegador; este mecanismo no gestiona sesiones, solo actúa dentro de la que recibe.
- La adopción de este mecanismo por un producto derivado para un caso de negocio concreto (declarar los pasos recuperables, acciones y verificadores reales de un sitio específico) requiere su propia spec de producto, fuera de este alcance.
- El vocabulario de acciones permitidas y los verificadores son siempre específicos de cada consumidor; esta capacidad no provee acciones ni verificadores por defecto.
