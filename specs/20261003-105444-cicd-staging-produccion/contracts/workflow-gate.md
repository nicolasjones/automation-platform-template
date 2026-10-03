# Contrato: gate de staging → producción compartido

Aplica a los tres workflows nuevos (`migraciones-cloud.yml`, `deploy-infraestructura-vps.yml`, `publicar-flows-kestra.yml`). No es un contrato de API — es la forma que deben respetar los tres archivos de workflow para que `tasks.md`/implementación los trate de manera uniforme.

## Forma del workflow

```yaml
on:
  push:
    branches: [main]      # o la rama que corresponda a cada mecanismo
    paths: [<filtro específico del mecanismo>]

permissions:
  contents: read

jobs:
  staging:
    runs-on: [self-hosted, platform-local]
    environment: <mecanismo>-staging
    steps: [...]

  production:
    needs: staging
    runs-on: [self-hosted, platform-local]
    environment: <mecanismo>-production   # con required reviewers configurado en GitHub
    steps: [...]  # mismos steps que staging, apuntando al entorno de producción
```

## Reglas del contrato

1. `production` **siempre** declara `needs: staging` — nunca corre si `staging` no terminó con éxito.
2. El GitHub Environment de producción (`<mecanismo>-production`) tiene required reviewers configurado manualmente en la configuración del repositorio (fuera del YAML — GitHub no lo expresa como código). La spec no crea ese Environment por API; se documenta como paso manual único de configuración del repositorio en `docs/adoptar-cicd-staging-produccion.md`.
3. `runs-on: [self-hosted, platform-local]` en ambos jobs — nunca `ubuntu-latest` (regla de `CLAUDE.md`).
4. Los steps de `staging` y `production` son idénticos salvo el valor de `environment` y, por lo tanto, los secrets que resuelven (mismo nombre de secret, distinto valor por Environment).
5. Ningún workflow de esta spec se dispara por `pull_request` — solo por `push` a la rama de integración, igual que `worker-images.yml` (publicar en cada intento de PR no aporta y gasta recursos del runner).
6. El filtro de `paths` de cada workflow es específico del mecanismo (ver tabla abajo) — un cambio fuera de esas rutas no dispara ninguno de los tres pipelines.

| Workflow | `paths` que dispara `staging` |
|---|---|
| `migraciones-cloud.yml` | `supabase/migrations/**` |
| `deploy-infraestructura-vps.yml` | `infra/kestra/compose*.yaml`, `infra/superset/compose*.yaml`, `infra/nango/compose*.yaml`, `infra/playwright/compose*.yaml`, `scripts/deploy-vps.mjs` |
| `publicar-flows-kestra.yml` | `infra/kestra/flows/**` |

## Edge cases cubiertos por este contrato

- Push sin cambios relevantes bajo `paths`: GitHub Actions no dispara el workflow en absoluto (comportamiento nativo del filtro) — no hay job vacío que "no falle" (ver nota en `spec.md`, ya resuelta por el propio filtro de `paths`, no por lógica dentro del job).
- Staging falla: `production` nunca queda disponible para aprobación (comportamiento nativo de `needs` ante un job fallido).
- Reviewer rechaza producción: el job `production` queda en estado "Rejected"; no se re-ejecuta solo; un nuevo push dispara una corrida nueva de `staging` que, si tiene éxito, vuelve a ofrecer `production` para aprobación.
