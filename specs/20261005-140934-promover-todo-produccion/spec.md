# Feature Specification: Promover todo a producción (botón único)

**Feature Branch**: `20261005-140934-boton-unico-prd`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Un solo workflow_dispatch ('Promover todo a producción') que dispare de una las promociones a producción de todos los mecanismos de plataforma que ya tienen split staging→producción (migraciones de Supabase, deploy de infraestructura VPS, publicación de flows de Kestra, y Refine/Vercel), con la regla de que cualquier mecanismo futuro con su propio split staging→producción se suma ahí."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Promover todo con una sola acción (Priority: P1)

Quien opera la plataforma (hoy, el coordinador humano del producto) quiere dar un único OK para que todos los mecanismos ya validados en staging pasen a producción, en vez de tener que disparar y confirmar cada mecanismo por separado.

**Why this priority**: Es el problema que originó esta spec — el bug `gate-migraciones-stg-prd` dejó 3 botones sueltos (migraciones, infraestructura VPS, flows de Kestra) más un cuarto mecanismo (Refine) sin ningún botón. Sin esto, cada promoción a producción sigue siendo una decisión y una acción separada, con más superficie para que una se dispare sin pensar (la causa real del incidente original).

**Independent Test**: Disparar el workflow único contra un commit cuyo staging corrió exitosamente en los 4 mecanismos, y confirmar que los 4 se promueven sin intervención adicional, cada uno verificando su propio staging antes de tocar sus secretos de producción.

**Acceptance Scenarios**:

1. **Given** que el último `staging` de los tres mecanismos basados en GitHub Actions (migraciones de Supabase, infraestructura VPS, flows de Kestra) corrió exitosamente para el commit actual de `main`, **When** se dispara el workflow único, **Then** los tres se promueven a producción sin que haga falta disparar cada uno por separado.
2. **Given** que el frontend (Refine) tiene cambios ya visibles en su entorno de staging persistente, **When** se dispara el workflow único, **Then** esos mismos cambios quedan publicados en el dominio de producción del frontend.
3. **Given** que uno de los cuatro mecanismos NO tiene un staging exitoso para el commit actual, **When** se dispara el workflow único, **Then** ese mecanismo puntual falla y no se promueve, mientras los demás mecanismos (si su staging sí es válido) se promueven igual — una falla aislada no bloquea a los demás.

---

### User Story 2 - Un mecanismo nuevo se suma sin reinventar nada (Priority: P2)

Quien diseña un mecanismo nuevo de plataforma con su propio ciclo staging→producción (un flow nuevo, un worker nuevo, un dashboard de Superset con su propio ciclo de publicación) necesita poder sumarlo al botón único siguiendo un patrón ya establecido, sin que ese mecanismo quede operando como una acción aislada por fuera del punto central de aprobación.

**Why this priority**: Sin esta regla, el botón único se degrada con el tiempo — cada mecanismo nuevo que no se sume vuelve a abrir la misma superficie de riesgo que esta spec cierra. Es la condición que hace que la solución sea permanente y no solo una corrección puntual de los 4 mecanismos de hoy.

**Independent Test**: Tomar un mecanismo hipotético nuevo con su propio split staging→producción y verificar, contra la documentación del contrato, que agregar su promoción al workflow único es un paso explícito y describible sin ambigüedad — no una decisión de diseño abierta cada vez.

**Acceptance Scenarios**:

1. **Given** un mecanismo nuevo de plataforma con su propio job de producción ya gateado por staging, **When** se documenta su adopción siguiendo el contrato de esta spec, **Then** su promoción queda disponible dentro del mismo disparo único, sin crear un `workflow_dispatch` independiente para su propia promoción a producción.

---

### Edge Cases

- ¿Qué pasa si se dispara el botón único y uno de los cuatro mecanismos nunca tuvo su staging corrido (ni exitoso ni fallido) para el commit actual? → Debe fallar igual que hoy fallan los mecanismos individuales (ver bug `gate-migraciones-stg-prd`), sin promover ese mecanismo puntual.
- ¿Qué pasa si el usuario quiere promover solo uno de los cuatro mecanismos, no todos? → Los workflows individuales existentes siguen disponibles y disparables por separado (esta spec no los elimina ni los oculta); el botón único es una conveniencia adicional, no el único camino.
- ¿Qué pasa con la aprobación humana en sí (quién puede disparar el botón)? → Sigue siendo la misma convención de operación que ya aplica a los mecanismos individuales: ningún agente lo dispara sin confirmación explícita del usuario humano en el momento. Esta spec no introduce ni reemplaza ningún control técnico de GitHub para esto (ver Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST ofrecer un único punto de disparo manual ("Promover todo a producción") que, en una sola invocación, promueva a producción los mecanismos de migraciones de Supabase, deploy de infraestructura VPS (Kestra, Superset, Nango) y publicación de flows de Kestra, siempre que cada uno tenga su staging correspondiente ya validado. **Entregado para estos 3 mecanismos** (verificado en vivo, 2026-10-05); el frontend (Refine) queda fuera de alcance — ver nota al final de esta sección.
- **FR-002**: El sistema MUST seguir exigiendo, para cada uno de los mecanismos basados en GitHub Actions, que su propio `staging` haya corrido exitosamente para el commit que se va a promover — el botón único no debe debilitar ni saltear la verificación ya existente (bug `gate-migraciones-stg-prd`).
- **FR-003**: ~~El sistema MUST introducir, para el frontend (Refine), un entorno de staging persistente equivalente al que ya tienen los demás mecanismos~~ — **no entregado, limitación de plan conocida y aceptada**. El plan Hobby/personal de Vercel no permite que la "Production Branch" sea distinta de la rama de integración del repo (`main`), ni por API ni por UI (confirmado en vivo); separar eso sin pagar Vercel Pro requeriría reestructurar a qué rama mergea todo el repo, no solo Refine. Decisión del usuario (2026-10-05): no se paga por ahora, se documenta como limitación conocida, no bloqueante. Ver `contracts/promover-todo-a-produccion.md` → "Refine/Vercel: limitación conocida".
- **FR-004**: ~~El sistema MUST tratar la promoción del frontend como una acción explícita~~ — no entregado, mismo motivo que FR-003.
- **FR-005**: El sistema MUST seguir permitiendo disparar cada uno de los mecanismos por separado, para los casos en que no se quiera promover todo junto.
- **FR-006**: La falla de la verificación de staging en uno de los mecanismos NO MUST bloquear la promoción de los demás mecanismos cuyo staging sí sea válido, al disparar el botón único.
- **FR-007**: El sistema MUST documentar, en el contrato compartido del mecanismo de gate, que cualquier mecanismo de plataforma nuevo que introduzca su propio split staging→producción tiene que sumar su promoción al punto de disparo único — no queda habilitado agregar un mecanismo nuevo con su propio `workflow_dispatch` de producción aislado, por fuera de este punto central.
- **FR-008**: El sistema MUST seguir dependiendo de una decisión humana explícita para disparar cualquier promoción a producción (vía el botón único o individualmente) — esta spec no introduce ni depende de ningún control automático de aprobación de terceros (ver Assumptions sobre GitHub required reviewers).

### Key Entities

- **Mecanismo de producción**: cualquier capacidad de plataforma que tenga un ciclo diferenciado staging→producción (hoy: migraciones de Supabase, deploy de infraestructura VPS, publicación de flows de Kestra, frontend Refine). Cada uno sabe verificar, por sí mismo, si su staging es válido para promoverse.
- **Punto de disparo único**: la acción manual nueva que agrupa la promoción de todos los mecanismos de producción vigentes en un solo acto deliberado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Promover todos los mecanismos vigentes a producción pasa de requerir 4 acciones manuales separadas a requerir 1 sola.
- **SC-002**: ~~El frontend (Refine) deja de desplegar a producción automáticamente~~ — **no logrado, limitación de plan de Vercel conocida y aceptada** (ver FR-003/FR-004). `main` sigue desplegando Refine a producción automáticamente en cada push, igual que antes de esta spec.
- **SC-003**: Ante un commit cuyo staging falló o nunca corrió en alguno de los cuatro mecanismos, el punto de disparo único no promueve ese mecanismo puntual a producción, sin necesitar intervención humana adicional para detectarlo.
- **SC-004**: Un mecanismo de plataforma nuevo, futuro, con su propio ciclo staging→producción, puede sumarse al punto de disparo único siguiendo un procedimiento documentado, sin requerir rediseñar el punto de disparo único existente.

## Assumptions

- GitHub "required reviewers" (aprobación nativa de GitHub, distinta de quien dispara la acción) queda fuera de alcance: ya se evaluó y no está disponible sin migrar los repos a una Organization con plan de pago — decisión de negocio aparte, no resuelta en esta spec.
- La decisión de "quién puede dar el OK humano" sigue siendo una convención de operación (hoy: solo el usuario dueño del producto, nunca un agente sin su confirmación explícita), no algo que esta spec fuerce con un control técnico — se documenta, no se automatiza.
- El mecanismo de staging (automático, en cada push a la rama de integración) de los cuatro sistemas NO cambia — esta spec solo toca la promoción a producción.
- El entorno de staging persistente nuevo para Refine reutiliza infraestructura ya existente (la URL estable por rama que Vercel ya genera), sin requerir aprovisionar nada adicional.
