# Contrato: `promover-todo-a-produccion.yml`

Extiende `specs/20261003-105444-cicd-staging-produccion/contracts/workflow-gate.md` (el contrato del gate individual stg→prd). No lo reemplaza — cada mecanismo sigue cumpliendo ese contrato por su cuenta; este archivo describe únicamente el punto de disparo compartido.

## Forma del workflow

```yaml
name: Promover todo a producción

on:
  workflow_dispatch: {}

permissions:
  contents: read
  actions: read     # los 3 workflows reutilizados lo requieren (verificar-staging-exitoso.mjs) — sin otorgarlo acá, GitHub rechaza la corrida completa (startup_failure, 0 jobs)

jobs:
  migraciones-cloud:
    uses: ./.github/workflows/migraciones-cloud.yml
    secrets: inherit

  deploy-infraestructura-vps:
    uses: ./.github/workflows/deploy-infraestructura-vps.yml
    secrets: inherit

  publicar-flows-kestra:
    uses: ./.github/workflows/publicar-flows-kestra.yml
    secrets: inherit
```

## Reglas del contrato

1. **Nunca se dispara por `push`** — solo `workflow_dispatch`, igual criterio que el gate individual.
2. Los tres jobs reutilizados (`migraciones-cloud`, `deploy-infraestructura-vps`, `publicar-flows-kestra`) **no duplican ningún step** — invocan los workflows existentes vía `workflow_call` + `secrets: inherit`. Cada uno sigue verificando su propio staging antes de tocar sus secretos de producción (contrato de `workflow-gate.md`, sin cambios). Verificado en vivo de punta a punta (2026-10-05): los 3 se promovieron correctamente en una corrida real contra `estudio-contable-automation`.
3. Para que un workflow reusable funcione desde `workflow_call`, su job `production` debe aceptar ambos triggers: `if: github.event_name == 'workflow_dispatch' || github.event_name == 'workflow_call'`. Su job `staging` no cambia (`if: github.event_name == 'push'`).
4. Los 3 jobs no dependen entre sí (`needs` vacío) — una falla en cualquiera **no bloquea** la promoción de los demás (FR-006).
5. **Regla de extensión (FR-007, obligatoria para specs futuras)**: cualquier mecanismo de plataforma nuevo que introduzca su propio split staging→producción (un flow, un worker, un dashboard de Superset con su propio ciclo, etc.) DEBE agregar un job a `promover-todo-a-produccion.yml` — vía `workflow_call` si es un workflow de GitHub Actions, o un step equivalente si no lo es. No se habilita crear un `workflow_dispatch` de producción nuevo que quede fuera de este punto único. Documentar la incorporación en este mismo archivo, sección "Mecanismos registrados" (ver abajo).
6. El OK para disparar este workflow sigue siendo una decisión humana explícita — este contrato no introduce ni depende de ningún control técnico de aprobación de GitHub (ver Assumptions de `spec.md`).

## Mecanismos registrados

| Mecanismo | Cómo se suma | Desde |
|---|---|---|
| Migraciones de Supabase | `workflow_call` → `migraciones-cloud.yml` | esta spec |
| Infraestructura VPS (Kestra/Superset/Nango) | `workflow_call` → `deploy-infraestructura-vps.yml` | esta spec |
| Flows de Kestra | `workflow_call` → `publicar-flows-kestra.yml` | esta spec |
| Refine (frontend) | **fuera de alcance** — ver "Refine/Vercel: limitación conocida" abajo | — |

## Refine/Vercel: limitación conocida (decisión del usuario, 2026-10-05, no bloqueante)

Se intentaron dos caminos reales y ambos fallaron contra el proyecto Vercel real (plan Hobby/personal):

1. Reasignar la "Production Branch" del proyecto a una rama `production` nueva — descartado sin ejecutarlo: no existe ningún campo de API documentado para leerla ni cambiarla, y tampoco aparece en la UI del dashboard (ni en Settings → Git, ni en Settings → General) para este plan.
2. Promover por `deployment_id` (`POST /v10/projects/{id}/promote/{deploymentId}`) el deployment generado por un push a una rama `production` — **confirmado en vivo que falla** con `422 unprocessable_entity`. Causa real: ese endpoint solo acepta deployments que ya nacieron con `target: "production"`, y eso solo pasa en deployments construidos desde la rama que Vercel ya tiene como Production Branch — es decir, no resuelve nada, es circular.

Por qué no hay alternativa gratis real: todas las specs de este repo mergean a `main` (convención central del repo, no específica de Refine). Si `main` queda fijo como la Production Branch de Vercel (lo único que el plan gratis permite), **cualquier merge de cualquier spec** dispara un deploy a producción real sin control — no se puede aislar "solo lo de Refine" sin separar `main` de la rama de producción de Vercel. La única forma de lograr esa separación sin pagar sería reestructurar a qué rama mergea *todo* el repo, un cambio de convención central desproporcionado frente al costo de Vercel Pro (~USD 20/mes).

**Decisión**: Refine queda fuera del botón único por ahora. `main` sigue desplegando a producción automáticamente en cada push, igual que antes de esta spec — no se empeoró nada, tampoco se resolvió para Refine. Revisar si corresponde pagar Vercel Pro cuando haya un caso de negocio real que lo justifique (no una tarea abierta de esta spec).

**Qué quedó sin usar, a propósito, no limpiado del todo**: la rama `production` creada en el repo durante la investigación, y el Environment `promover-todo-a-produccion` con los secrets `VERCEL_TOKEN`/`VERCEL_PROJECT_ID` ya cargados por el usuario. No se borran automáticamente (acciones destructivas no se hacen sin pedirlo); quedan disponibles si en el futuro se retoma este camino.
