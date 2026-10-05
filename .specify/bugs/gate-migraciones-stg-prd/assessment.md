# Bug Assessment: `production` no exige que `staging` haya corrido/validado antes

- **Slug**: gate-migraciones-stg-prd
- **Created**: 2026-10-05
- **Source**: pasted text (reporte del usuario en sesión de coordinación, repo derivado `estudio-contable-automation`)
- **Verdict**: valid
- **Severity**: high

## Report (verbatim o resumido)

El usuario notó que 3 funcionalidades de IA recién creadas (`chat-ia`, `mcp-servidor-ia`, `rag-busqueda-documental`) tenían sus migraciones de Supabase aplicadas en el proyecto **producción** del repo derivado `estudio-contable-automation`, y preguntó por qué, dado que considera que nada debería llegar a producción sin aprobación previa en staging. Investigación en el repo derivado mostró que el 2026-10-04 21:34 un `workflow_dispatch` manual contra `production` aplicó 81 migraciones de una sola vez (incluidas las 3 de IA), disparado por el propio coordinador como "ponerse al día con CI" rutinario, no como una decisión feature-por-feature.

## Symptom

El job `production` de `migraciones-cloud.yml` (y, por el mismo contrato, `deploy-infraestructura-vps.yml` y `publicar-flows-kestra.yml`) se dispara por `workflow_dispatch` sin ninguna dependencia técnica de que `staging` haya corrido, ni mucho menos de que haya corrido *exitosamente* para el mismo commit. Se esperaba que "producción" implicara que lo desplegado ya pasó por staging; en los hechos, quien dispara `workflow_dispatch` puede promover cualquier estado de `main` a producción sin que el YAML verifique nada al respecto.

## Reproduction

1. Mergear un PR a `main` que toque `supabase/migrations/**` — dispara `staging` automáticamente.
2. Sin esperar a que `staging` termine (o incluso si falló), ir a la pestaña Actions de `migraciones-cloud.yml` y disparar `workflow_dispatch` eligiendo `production`.
3. El job `production` corre igual, sin ningún chequeo que lo bloquee — aplica contra el `SUPABASE_DB_URL` de producción.

Caso real observado (no hipotético): run `37236652561` (`workflow_dispatch`, 2026-10-04T21:34:36Z, actor `nicolasjones`) en `estudio-contable-automation`, aplicó 81 migraciones de golpe, confirmado con `gh run view --log`.

## Suspected Code Paths

- `.github/workflows/migraciones-cloud.yml:59-79` — job `production`, `if: github.event_name == 'workflow_dispatch'`, sin `needs: staging` ni verificación cruzada.
- `.github/workflows/deploy-infraestructura-vps.yml` y `.github/workflows/publicar-flows-kestra.yml` — mismo contrato (`contracts/workflow-gate.md`), mismo gap, no revisados en detalle en esta pasada pero afectados por diseño.
- `scripts/migrar-supabase-cloud.mjs:9-11` — ejecuta `supabase db push --db-url` directo, sin consultar el historial de migraciones de otro entorno.
- `specs/20261003-105444-cicd-staging-produccion/contracts/workflow-gate.md` — documenta el trade-off como aceptado ("Edge cases cubiertos por este contrato" → "Alguien dispara `production` sin que `staging` haya corrido nunca para ese commit: el workflow lo permite... exactamente el trade-off de esta alternativa").
- `specs/20261003-105444-cicd-staging-produccion/research.md` §6 y `tasks.md` T027 — documentan la decisión original (`needs: staging` + GitHub Environment con required reviewers) y su reversión posterior por costo.

## Root Cause Hypothesis

**Confianza: alta.** No es un bug de implementación (el YAML hace exactamente lo que `contracts/workflow-gate.md` documenta) — es una decisión de diseño aceptada (T027) que ya no sostiene su propia justificación. El diseño original (research.md §6, "Decision (original, intake)") ya pedía `needs: staging` + GitHub Environment de producción con "required reviewers". Se abandonó porque esa regla de protección requiere plan pago para repos **privados**, y en ese momento tanto `nicolasjones/automation-platform-template` como `Agenmatica/automation-platform-template` estaban en plan Free. La resolución fue hacer ambos repos **públicos** — lo cual, según la propia nota de T027, *desbloqueó* required reviewers (gratis en repos públicos) — pero el coordinador decidió no usarlo de todos modos y quedarse con `workflow_dispatch` puro, dejando el trade-off documentado como aceptado sin que nadie lo haya vuelto a cuestionar hasta este reporte.

**Matiz nuevo, no contemplado en T027**: el repo derivado real donde ocurrió el incidente (`estudio-contable-automation`) es **privado** (confirmado: `gh api repos/nicolasjones/estudio-contable-automation` → `"private": true`). Aunque el template sea público y pueda usar required reviewers gratis, **el producto derivado no puede** sin plan pago — así que "required reviewers" no es una solución que se porte automáticamente a los repos derivados, que es justo donde vive el riesgo real (datos de clientes reales, ver `project_era_consultores_primer_cliente_real` en memoria del coordinador). Cualquier remediación que dependa de visibilidad pública del repo no sirve de forma general para esta plantilla.

## Proposed Remediation

**Preferred**: reemplazar el trade-off de T027 por un **gate técnico basado en el propio GitHub Actions API**, sin depender de ninguna feature de plan pago ni de que el repo sea público — funciona igual en el template (público) y en cualquier producto derivado (privado):

- El job `production` de cada uno de los tres workflows, como primer step (antes de tocar ningún secret de producción), consulta la API de runs de GitHub (`gh api repos/${{ github.repository }}/actions/workflows/<archivo>/runs?branch=main&status=success`, usando el `GITHUB_TOKEN` por defecto del job) y verifica que exista un run del job `staging` con `conclusion: success` para el mismo `head_sha` que el checkout actual de `main`.
- Si no existe ese run exitoso, el job falla inmediato con un mensaje explícito ("staging nunca corrió exitosamente para este commit — no se puede promover a producción"), antes de instalar nada ni tocar `SUPABASE_DB_URL`/`VPS_SSH_PRIVATE_KEY`/credenciales de Kestra o Superset.
- Esto cierra exactamente el edge case que `contracts/workflow-gate.md` documenta como aceptado — deja de estarlo.
- Extra (específico de `migraciones-cloud.yml`, defensa en profundidad): además del chequeo de run exitoso, verificar que las migraciones a aplicar en producción sean un subconjunto de las que `supabase migration list --db-url <STAGING_DB_URL>` reporta como ya aplicadas en staging — esto además protege contra el caso en que `staging` "pasó" pero por alguna razón no llegó a aplicar todas las migraciones nuevas (p. ej. un merge posterior sin re-disparar staging). Requiere exponer `SUPABASE_DB_URL` de staging como secret legible también desde el Environment de producción (o un secret de solo-lectura separado) — evaluar impacto de aislamiento de credenciales entre entornos antes de implementarlo.

**Alternatives**:
- Habilitar required reviewers en el GitHub Environment `*-production` del **template** (público, gratis) como defensa adicional — útil ahí, pero no resuelve el caso de productos derivados privados, así que no puede ser la única mitigación.
- Pagar GitHub Team/Enterprise para habilitar required reviewers también en los repos derivados privados — descartado por costo, mismo motivo que T027 original; se podría reconsiderar como decisión de negocio aparte, no como parte de este fix.

**Files likely to change**:
- `.github/workflows/migraciones-cloud.yml`
- `.github/workflows/deploy-infraestructura-vps.yml`
- `.github/workflows/publicar-flows-kestra.yml`
- `specs/20261003-105444-cicd-staging-produccion/contracts/workflow-gate.md` (actualizar la sección "Edge cases" y el contrato de forma del workflow)
- `specs/20261003-105444-cicd-staging-produccion/research.md` §6 (nueva subsección "Revisión 2")
- `specs/20261003-105444-cicd-staging-produccion/tasks.md` (nota de desvío referenciando el commit de este fix, con el criterio corto del CLAUDE.md)
- `docs/adoptar-cicd-staging-produccion.md` si documenta el comportamiento actual del gate

**Tests to add or update**:
- Test de workflow (si existe harness de validación de YAML de Actions en este repo) que confirme que `production` tiene el step de verificación antes de cualquier step que use secrets de producción.
- Si no hay harness de CI de workflows, al menos una prueba manual documentada en `quickstart.md`/`tasks.md`: disparar `production` contra un commit cuyo `staging` nunca corrió (rama de prueba) y confirmar que falla rápido con el mensaje esperado, sin tocar secrets.

## Risks & Considerations

- El `GITHUB_TOKEN` por defecto de un job tiene permisos de lectura sobre `actions: read` solo si `permissions:` lo habilita explícitamente — hoy el workflow declara `permissions: contents: read` únicamente; hay que sumar `actions: read` para que el nuevo step pueda consultar runs.
- La verificación por `head_sha` asume que `production` siempre se dispara contra `main` en su HEAD actual — si en el futuro se permite elegir un ref/commit distinto vía input de `workflow_dispatch`, el chequeo debe usar ese ref, no asumir `github.sha` del evento `workflow_dispatch` (que por defecto es el HEAD de la rama por defecto, hay que confirmarlo contra la documentación de GitHub antes de implementar).
- Cambiar `contracts/workflow-gate.md` es tocar un contrato compartido por 3 workflows — el fix debe aplicarse a los 3 a la vez para no dejar 2 de 3 todavía vulnerables.
- Esta spec ya fue adoptada por al menos un producto derivado (`estudio-contable-automation`, capacidad `vps-deploy-gate` 1.0.5 en `template-adoption.json`) — el fix necesita portback explícito después de mergear acá, no alcanza con arreglarlo solo en el template.
- No se modifica nada de producción real como parte de esta sola evaluación — ningún secret ni Environment fue tocado, solo se leyó `protection_rules` (vacío, confirmado) de `migraciones-cloud-production` en el template.

## Open Questions

- [NEEDS CLARIFICATION: el usuario quiere además (no en reemplazo) required reviewers en el template público, dado que ahí es gratis? Queda como "Alternative" arriba, no incluido en el fix preferido salvo que se pida.]
- [NEEDS CLARIFICATION: para la verificación extra de `migraciones-cloud.yml` contra `supabase migration list` en staging — ¿aceptable que el Environment de producción pueda leer (no escribir) el `SUPABASE_DB_URL` de staging, o preferible mantener aislamiento total de credenciales entre entornos y quedarse solo con el chequeo de "run exitoso" por `head_sha`?]
