# Feature Specification: CI/CD staging → producción para migraciones, VPS, flows y dashboards

**Feature Branch**: `20261003-105444-cicd-staging-produccion`

**Created**: 2026-10-03

**Status**: Draft

**Actualización (decisión del coordinador, ver `tasks.md` T027)**: el gate de staging→producción originalmente descrito en este documento (GitHub Environment de producción con "required reviewers") no se puede configurar sin un plan de pago de GitHub (Team/Enterprise) para un repositorio privado — confirmado contra la API real. Alternativa sin costo adoptada: `production` se dispara manualmente vía `workflow_dispatch` desde la pestaña Actions, en vez de una aprobación de reviewer sobre un job pausado por `needs`. Donde este documento dice "aprobación de un revisor" o "pausado esperando aprobación", leer "disparo manual deliberado vía workflow_dispatch" — el resto de la intención (producción no se mueve sola) se mantiene. Detalle en `research.md` §6 y `contracts/workflow-gate.md`.

**Input**: User description: "CI/CD completo staging → producción para los componentes del stack de esta plantilla que hoy son manuales: migraciones de Supabase contra proyectos cloud por entorno, deploy de infraestructura del VPS (Kestra, Superset, proxy reverso) vía el script `scripts/deploy-vps.mjs` ampliado, publicación de flows del orquestador vía `infra/kestra/desplegar-flow.mjs`, y un wrapper genérico de import de dashboards de Superset. Handoff desde el assessment en `.specify/assessments/cicd-staging-produccion/decision.md` (verdict: go, Opción A confirmada por el coordinador)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Migrar bases de datos cloud sin pasos manuales (Priority: P1)

Como operador de la plantilla, cuando subo un cambio que agrega una migración a `supabase/migrations`, quiero que se aplique automáticamente contra el proyecto Supabase cloud de staging, y que promoverla a producción sea un único disparo manual deliberado desde Actions — sin tener que ejecutar comandos a mano contra ninguno de los dos proyectos.

**Why this priority**: Es el componente manual más riesgoso hoy (no existe ningún workflow) y el que más directamente puede dejar un entorno desincronizado si se olvida un paso. Es además el más fácil de verificar de forma aislada.

**Independent Test**: Se puede probar agregando una migración nueva y verificando que el pipeline la aplique contra staging sin intervención, y que producción no se toque hasta disparar manualmente el workflow. No depende de que las otras historias estén implementadas.

**Acceptance Scenarios**:

1. **Given** una rama con una migración nueva en `supabase/migrations`, **When** se sube (push/merge) a la rama que dispara el pipeline, **Then** la migración se aplica automáticamente contra el proyecto Supabase cloud de staging sin intervención manual.
2. **Given** que la migración ya se aplicó correctamente contra staging, **When** se revisa la pestaña de Actions de GitHub, **Then** el workflow ofrece "Run workflow" (`workflow_dispatch`) como la única forma de disparar el paso de producción — no corre solo.
3. **Given** que alguien dispara manualmente el workflow desde la pestaña de Actions, **When** elige correrlo, **Then** el job de producción se ejecuta y aplica la misma migración contra el proyecto Supabase cloud de producción.
4. **Given** que la migración falla al aplicarse contra staging, **When** el job de staging termina en error, **Then** el job de producción de ese push no se ejecuta solo (igual que antes) — pero un disparo manual posterior vía `workflow_dispatch` sigue siendo posible, sin que el YAML lo bloquee.

---

### User Story 2 - Desplegar infraestructura del VPS sin SSH manual (Priority: P2)

Como operador de la plantilla, cuando subo un cambio que toca la configuración de Kestra, Superset o el proxy reverso, quiero que se despliegue automáticamente contra el entorno de staging del VPS, y que promoverlo a producción sea un disparo manual deliberado desde Actions — sin copiar archivos por SSH ni ejecutar el script de deploy a mano.

**Why this priority**: Es el segundo componente manual más costoso (requiere acceso SSH directo al VPS) y el que motivó explícitamente mover las credenciales a secrets de GitHub Actions.

**Independent Test**: Se puede probar modificando un archivo bajo `infra/` y verificando que el pipeline ejecute el deploy contra el entorno de staging del VPS automáticamente, leyendo credenciales sin requerir un archivo `.env` local en el VPS, y que producción solo se despliegue al disparar manualmente el workflow.

**Acceptance Scenarios**:

1. **Given** un cambio en `infra/<producto>/` (Kestra, Superset o proxy reverso), **When** se sube a la rama que dispara el pipeline, **Then** el deploy se ejecuta automáticamente contra el entorno de staging del VPS sin que nadie necesite conectarse por SSH.
2. **Given** que el deploy a staging del VPS terminó correctamente, **When** se revisa la pestaña de Actions, **Then** el paso de producción solo está disponible como "Run workflow" (`workflow_dispatch`), nunca automático.
3. **Given** que alguien dispara manualmente el paso de producción, **When** elige correrlo desde la pestaña de Actions, **Then** el mismo deploy se ejecuta contra el entorno de producción del VPS usando las credenciales del entorno de producción, no las de staging.
4. **Given** que las credenciales de despliegue (base de datos, SSH del VPS, orquestador) ya están configuradas como secrets por entorno, **When** el pipeline corre, **Then** ningún paso necesita leer un archivo `.env.<entorno>` desde el filesystem del VPS para completarse.

---

### User Story 3 - Publicar flows del orquestador dentro del mismo pipeline (Priority: P3)

Como operador de la plantilla, cuando subo un cambio a un flow de Kestra, quiero que se publique automáticamente contra el Kestra de staging, y que llegue a producción con el mismo gate de disparo manual que el resto de la infraestructura — sin correr el script de publicación a mano.

**Why this priority**: Ya existe un script (`infra/kestra/desplegar-flow.mjs`) que lee credenciales de variables de entorno, por lo que es la pieza más cercana a estar lista — conectarla al mismo gate es menor esfuerzo que las dos anteriores, pero depende conceptualmente de que el mecanismo de gate ya esté resuelto (Historia 2).

**Independent Test**: Se puede probar modificando un flow bajo `infra/kestra/flows/` y verificando que se publique automáticamente contra el Kestra de staging, y que producción solo se publique al disparar manualmente el workflow.

**Acceptance Scenarios**:

1. **Given** un cambio en un flow bajo `infra/kestra/flows/`, **When** se sube a la rama que dispara el pipeline, **Then** el flow se publica automáticamente contra el Kestra de staging.
2. **Given** que la publicación a staging fue exitosa, **When** se revisa la pestaña de Actions, **Then** la publicación a producción solo está disponible como disparo manual (`workflow_dispatch`), igual que el resto de los mecanismos de esta spec.
3. **Given** que alguien dispara manualmente el paso de producción, **When** elige correrlo, **Then** el mismo flow se publica contra el Kestra de producción usando las credenciales del entorno de producción.

---

### User Story 4 - Dejar listo el mecanismo de import de dashboards de Superset (Priority: P4)

Como operador de la plantilla, quiero un mecanismo genérico (invocable por línea de comandos o API) para importar archivos YAML de dashboards de Superset contra un entorno dado, parametrizado, para que cuando el producto en paralelo exporte su primer dashboard a YAML, conectarlo al pipeline de staging/producción sea trivial.

**Why this priority**: Es la pieza con menor urgencia inmediata (no hay ningún dashboard real que importar hoy), pero el coordinador confirmó incluirla ya para no tener que retomarla después. Es independiente de las otras tres: no participa del pipeline automático de push hasta que haya un YAML real que importar.

**Independent Test**: Se puede probar invocando el mecanismo manualmente contra un YAML de prueba y un entorno de staging, y verificando que lo importe sin necesitar saber de antemano cuáles dashboards existen.

**Acceptance Scenarios**:

1. **Given** un archivo YAML de dashboard de Superset válido, **When** se invoca el mecanismo de import especificando el entorno de destino, **Then** el dashboard queda importado en la instancia de Superset de ese entorno.
2. **Given** que no existe ningún archivo YAML de dashboard todavía en el repositorio, **When** se revisa el pipeline de staging/producción, **Then** ningún paso automático intenta importar dashboards (el mecanismo existe pero no está conectado a ningún disparo automático).
3. **Given** un entorno de destino inválido o no configurado, **When** se invoca el mecanismo, **Then** falla con un mensaje claro en vez de aplicar el import contra un entorno incorrecto.

---

### Edge Cases

- ¿Qué pasa cuando un push toca `supabase/migrations` pero no hay ninguna migración nueva desde la última corrida? El job debe completarse sin error (no hay nada que aplicar), no fallar por "nada que hacer".
- ¿Qué pasa si alguien dispara `workflow_dispatch` y decide no volver a correrlo? No hay nada que limpiar — a diferencia de un reviewer rechazando un job pausado, un `workflow_dispatch` nunca disparado simplemente no deja ningún job pendiente.
- ¿Qué pasa si el deploy a staging del VPS tiene éxito parcial (algunos servicios de `infra/<producto>/` se levantan y otros no)? El job de staging debe reportarse como fallido en su totalidad. Como ya no hay `needs` bloqueando producción, un disparo manual de `workflow_dispatch` sobre ese commit sigue siendo técnicamente posible — queda en quien lo dispara verificar el estado de staging antes de hacerlo (ver `contracts/workflow-gate.md` → Edge cases).
- ¿Qué pasa si se intenta aplicar una migración marcada como destructiva (borra una columna o tabla) sin un camino de reversión documentado? Debe rechazarse antes de llegar a producción, consistente con la regla ya vigente en `CLAUDE.md` sobre migraciones aditivas o con reversión explícita.
- ¿Qué pasa si las credenciales de un entorno (p. ej. producción) no están configuradas como secret cuando el job de ese entorno se dispara? El job debe fallar con un error claro que identifique qué credencial falta, no fallar de forma ambigua a mitad de ejecución.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE aplicar automáticamente, sin intervención manual, las migraciones nuevas de `supabase/migrations` contra el proyecto Supabase cloud de staging cuando se suben a la rama que dispara el pipeline.
- **FR-002**: El sistema DEBE requerir un disparo manual y deliberado (`workflow_dispatch` desde la pestaña Actions) para aplicar esas mismas migraciones contra el proyecto Supabase cloud de producción — nunca automático en un push. (Revisado: alternativa sin costo a required reviewers, ver nota de actualización arriba.)
- **FR-003**: El paso de producción (migraciones, deploy de infraestructura o publicación de flows) NO DEBE dispararse automáticamente junto con staging — solo por acción manual separada. Que ese disparo manual se haga antes o después de verificar que staging terminó bien es responsabilidad de quien lo dispara, no una garantía automática del sistema (ver `contracts/workflow-gate.md` → Edge cases).
- **FR-004**: El sistema DEBE desplegar automáticamente, sin acceso SSH manual, los cambios de infraestructura del VPS (Kestra, Superset, proxy reverso) contra el entorno de staging cuando se suben cambios bajo `infra/`.
- **FR-005**: El sistema DEBE requerir un disparo manual y deliberado (`workflow_dispatch`) para desplegar esos mismos cambios contra el entorno de producción del VPS — nunca automático en un push.
- **FR-006**: El mecanismo de despliegue de infraestructura DEBE poder leer las credenciales necesarias (base de datos, SSH del VPS, orquestador) desde variables de entorno de CI, sin depender de un archivo `.env.<entorno>` presente en el filesystem del VPS.
- **FR-007**: Las credenciales de cada entorno (staging, producción) DEBEN almacenarse como secrets de GitHub Actions asociados al Environment de ese entorno, en vez de como archivos en el VPS.
- **FR-008**: El sistema DEBE publicar automáticamente los flows del orquestador modificados contra el Kestra de staging cuando se suben cambios bajo los flows versionados.
- **FR-009**: El sistema DEBE requerir un disparo manual y deliberado (`workflow_dispatch`) para publicar esos mismos flows contra el Kestra de producción — nunca automático en un push.
- **FR-010**: El sistema DEBE ofrecer un mecanismo genérico (invocable de forma independiente del pipeline automático) para importar un archivo YAML de dashboard de Superset contra un entorno de destino parametrizado, sin asumir de antemano cuáles dashboards existen.
- **FR-011**: El mecanismo de import de dashboards NO DEBE dispararse automáticamente en ningún push mientras no exista al menos un archivo YAML de dashboard versionado en el repositorio.
- **FR-012**: El sistema DEBE rechazar, antes de llegar a producción, cualquier migración que no sea aditiva y no incluya un camino de reversión documentado, consistente con la convención ya vigente del proyecto.
- **FR-013**: Cada uno de los tres mecanismos automatizados (migraciones, deploy de infraestructura, publicación de flows) DEBE ejecutarse en el runner self-hosted ya usado por el resto del CI del proyecto, no en runners alojados por GitHub.
- **FR-014**: El sistema NO DEBE disparar ninguno de estos mecanismos para cambios relacionados con la integración OAuth (tipo Nango) ni con el aprovisionamiento de nuevos servidores de organización o del reverse proxy en sí.
- **FR-015**: El sistema NO DEBE copiar datos reales de producción hacia el entorno de staging como parte de ninguno de estos mecanismos.

### Key Entities

- **Entorno**: staging o producción; determina contra qué proyecto Supabase, qué instancia del VPS, y qué secrets de GitHub Actions corre cada mecanismo.
- **Mecanismo de gate**: el par de jobs (staging automático por push → producción por disparo manual `workflow_dispatch`) que comparten los tres pipelines automatizados (migraciones, deploy de infraestructura, publicación de flows).
- **Credencial**: dato sensible (contraseña de base de datos, clave SSH del VPS, credencial del orquestador) que hoy vive en archivos `.env.<entorno>` del VPS y pasa a vivir como secret de GitHub Actions por entorno.
- **Migración**: cambio versionado en `supabase/migrations` que se aplica contra el proyecto Supabase cloud de un entorno dado.
- **Flow de orquestación**: definición versionada de un flow de Kestra que se publica contra la instancia de Kestra de un entorno dado.
- **Dashboard YAML**: archivo exportado de un dashboard de Superset, que el mecanismo de import (aún sin wiring automático) puede aplicar contra la instancia de Superset de un entorno dado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una migración nueva llega al proyecto Supabase de staging sin que ningún operador ejecute un comando manual, en el mismo push que la introduce.
- **SC-002**: Promover una migración, un despliegue de infraestructura o un flow de staging a producción requiere un único disparo manual (`workflow_dispatch`) en GitHub Actions, sin necesidad de acceso SSH al VPS en ningún paso.
- **SC-003**: Cero credenciales (base de datos, SSH del VPS, orquestador) necesarias para estos tres mecanismos siguen viviendo como archivo `.env.<entorno>` en el VPS al cerrar la spec.
- **SC-004**: Un operador puede importar un YAML de dashboard de prueba contra un entorno de staging usando el mecanismo genérico, sin que el mecanismo necesite conocer de antemano qué otros dashboards existen.
- **SC-005**: Ningún push a staging dispara por sí solo el paso de producción — producción siempre requiere la acción separada y deliberada de disparar `workflow_dispatch`.

## Assumptions

- Esta plantilla (automation-platform-template) no es dueña de ningún proyecto Supabase cloud real, ni de ningún VPS real de staging/producción — son recursos que cada producto derivado provee para sí mismo. En consecuencia, los tres mecanismos (migraciones, deploy de infraestructura, publicación de flows) deben ser genéricos y parametrizados por secrets/variables de entorno (igual que ya lo es `scripts/deploy-vps.mjs` por argumento de entorno, o `infra/kestra/desplegar-flow.mjs` por variables de entorno) — nunca deben asumir ni codificar un project-ref, host o credencial específico. Verificar contra un entorno real queda a cargo de cada producto que adopte la capacidad (igual patrón que `docs/adoptar-*.md`), no de esta spec.
- Si el runner self-hosted que ejecuta estos pipelines no tiene hoy conectividad de red hacia un VPS real, `/speckit-plan` investiga qué hace falta para probar el mecanismo de punta a punta durante la implementación (p. ej. contra un VPS/entorno de prueba), sin que esta spec deba resolver esa logística de antemano.
- ~~El GitHub Environment de producción con "required reviewers" ya puede configurarse sobre este repositorio sin depender de un plan de pago adicional de GitHub~~ — **Refutada durante la implementación** (ver `tasks.md` T027): esta asunción resultó falsa, verificada contra la API real (HTTP 422, plan Free no soporta required reviewers). El coordinador decidió la alternativa sin costo: `production` por `workflow_dispatch` manual en vez de required reviewers. Los Environments en sí (sin esa regla) sí funcionan en cualquier plan.
- El mecanismo de import de dashboards de Superset se valida con al menos un YAML de ejemplo/sintético durante la implementación, ya que ningún producto derivado exporta todavía un dashboard real.
- Los fixtures sintéticos para staging (si se llegan a sugerir) quedan como una recomendación documental de esta spec, no como un entregable con su propio mecanismo de generación.

## Open Questions Carried Forward

- Conectividad del runner self-hosted hacia un VPS real de staging/producción: no se resuelve en esta spec — `/speckit-plan` investiga cómo validar el mecanismo de deploy de infraestructura de punta a punta dado el entorno de CI disponible.
- Existencia de proyectos Supabase cloud de staging/producción: no aplica a esta plantilla (no es dueña de ningún proyecto real) — el mecanismo de CI de migraciones debe quedar parametrizado por secrets para que cada producto derivado lo apunte a sus propios proyectos, sin asumir ninguno concreto.
