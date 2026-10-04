# Contrato: gate de staging → producción compartido

Aplica a los tres workflows nuevos (`migraciones-cloud.yml`, `deploy-infraestructura-vps.yml`, `publicar-flows-kestra.yml`). No es un contrato de API — es la forma que deben respetar los tres archivos de workflow para que `tasks.md`/implementación los trate de manera uniforme.

**Actualizado (decisión del coordinador, ver `tasks.md` T027)**: el diseño original usaba `needs: staging` + GitHub Environment de producción con required reviewers. Esa regla de protección requiere un plan de pago (GitHub Team/Enterprise) para repositorios privados — no estaba disponible ni en el fork ni en el repo de la organización. Alternativa sin costo adoptada: `production` deja de depender de `staging` dentro de la misma corrida y pasa a dispararse **solo manualmente** vía `workflow_dispatch` desde la pestaña Actions. Los GitHub Environments se conservan (separan secrets por entorno, que sigue funcionando en el plan Free); solo se cae el campo de required reviewers.

## Forma del workflow

```yaml
on:
  push:
    branches: [main]      # o la rama que corresponda a cada mecanismo
    paths: [<filtro específico del mecanismo>]
  workflow_dispatch: {}

permissions:
  contents: read

jobs:
  staging:
    if: github.event_name == 'push'
    runs-on: [self-hosted, platform-local]
    environment: <mecanismo>-staging
    steps: [...]

  production:
    if: github.event_name == 'workflow_dispatch'
    runs-on: [self-hosted, platform-local]
    environment: <mecanismo>-production
    steps: [...]  # mismos steps que staging, apuntando al entorno de producción
```

## Reglas del contrato

1. `production` **nunca** corre en un push — solo cuando alguien entra a la pestaña Actions y dispara el workflow a mano (`workflow_dispatch`). El filtro `if: github.event_name == 'workflow_dispatch'` en el job (no en `on:`, que es compartido) es lo que separa qué evento corre qué job.
2. El GitHub Environment de producción (`<mecanismo>-production`) ya no tiene (ni necesita) required reviewers — el gate es el propio acto deliberado de ir a la pestaña Actions y tocar "Run workflow", no una aprobación de GitHub. El Environment se sigue creando igual (paso manual único, ver `docs/adoptar-cicd-staging-produccion.md`) porque sigue siendo lo que separa los secrets de staging de los de producción.
3. `runs-on: [self-hosted, platform-local]` en ambos jobs — nunca `ubuntu-latest` (regla de `CLAUDE.md`).
4. Los steps de `staging` y `production` son idénticos salvo el valor de `environment` y, por lo tanto, los secrets que resuelven (mismo nombre de secret, distinto valor por Environment).
5. Ningún workflow de esta spec se dispara por `pull_request` — solo por `push` a la rama de integración (staging) o `workflow_dispatch` (producción), igual criterio que `worker-images.yml` sobre no gastar recursos del runner en cada intento de PR.
6. El filtro de `paths` de cada workflow sigue aplicando solo al trigger `push` (staging) — `workflow_dispatch` no admite filtro de paths, es una acción deliberada sin importar qué cambió.

| Workflow | `paths` que dispara `staging` |
|---|---|
| `migraciones-cloud.yml` | `supabase/migrations/**` |
| `deploy-infraestructura-vps.yml` | `infra/kestra/compose*.yaml`, `infra/superset/compose*.yaml`, `infra/nango/compose*.yaml`, `infra/playwright/compose*.yaml`, `scripts/deploy-vps.mjs` |
| `publicar-flows-kestra.yml` | `infra/kestra/flows/**` |

## Edge cases cubiertos por este contrato

- Push sin cambios relevantes bajo `paths`: GitHub Actions no dispara el workflow en absoluto (comportamiento nativo del filtro) — no hay job vacío que "no falle".
- Staging falla: ya no bloquea `production` automáticamente (no hay `needs`) — es responsabilidad de quien dispara `workflow_dispatch` haber verificado que el último `staging` relevante terminó bien antes de promoverlo a mano. Documentado como riesgo aceptado de la alternativa sin costo, no resuelto por el YAML.
- Alguien dispara `production` sin que `staging` haya corrido nunca para ese commit: el workflow lo permite (no hay gate automático) — es exactamente el trade-off de esta alternativa frente a `needs`+required-reviewers.
