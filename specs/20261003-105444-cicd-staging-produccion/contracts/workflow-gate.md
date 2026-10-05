# Contrato: gate de staging → producción compartido

Aplica a los tres workflows nuevos (`migraciones-cloud.yml`, `deploy-infraestructura-vps.yml`, `publicar-flows-kestra.yml`). No es un contrato de API — es la forma que deben respetar los tres archivos de workflow para que `tasks.md`/implementación los trate de manera uniforme.

**Actualizado (decisión del coordinador, ver `tasks.md` T027)**: el diseño original usaba `needs: staging` + GitHub Environment de producción con required reviewers. Esa regla de protección requiere un plan de pago (GitHub Team/Enterprise) para repositorios privados — no estaba disponible ni en el fork ni en el repo de la organización. Alternativa sin costo adoptada: `production` deja de depender de `staging` dentro de la misma corrida y pasa a dispararse **solo manualmente** vía `workflow_dispatch` desde la pestaña Actions. Los GitHub Environments se conservan (separan secrets por entorno, que sigue funcionando en el plan Free); solo se cae el campo de required reviewers.

**Actualizado otra vez (bug `gate-migraciones-stg-prd`, 2026-10-05)**: la alternativa de arriba dejaba `production` sin ninguna verificación técnica de que `staging` había corrido — documentado como trade-off aceptado (ver "Edge cases" más abajo, ahora corregido). Un caso real lo expuso: un `workflow_dispatch` aplicó 81 migraciones de golpe a producción en un producto derivado, sin que nadie validara feature por feature que ya habían pasado por staging. Hacer público el template desbloqueó required reviewers gratis *ahí*, pero los productos derivados reales son repos privados — esa solución no se traslada. Gate nuevo, sin requisito de plan de pago ni de visibilidad del repo: el primer step de `production`, antes de tocar cualquier secret de producción, corre `scripts/verificar-staging-exitoso.mjs`, que consulta la API de runs de GitHub Actions y exige un run de `staging` con `conclusion: success` para el mismo `head_sha`. Si no existe, el job falla inmediato. Ver `research.md` §6 "Revisión 2".

## Forma del workflow

```yaml
on:
  push:
    branches: [main]      # o la rama que corresponda a cada mecanismo
    paths: [<filtro específico del mecanismo>]
  workflow_dispatch: {}

permissions:
  contents: read
  actions: read   # requerido por scripts/verificar-staging-exitoso.mjs (lee runs vía API)

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
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.19.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: pnpm install --frozen-lockfile
      - name: Exigir que staging haya corrido exitosamente para este commit
        run: pnpm ci:verificar-staging-exitoso -- --workflow <archivo>.yml --head-sha "$GITHUB_SHA"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      # ... resto de los steps, idénticos a staging, apuntando al entorno de producción
```

## Reglas del contrato

1. `production` **nunca** corre en un push — solo cuando alguien entra a la pestaña Actions y dispara el workflow a mano (`workflow_dispatch`). El filtro `if: github.event_name == 'workflow_dispatch'` en el job (no en `on:`, que es compartido) es lo que separa qué evento corre qué job.
2. El GitHub Environment de producción (`<mecanismo>-production`) ya no tiene (ni necesita) required reviewers — el gate ya no es solo el acto deliberado de ir a la pestaña Actions y tocar "Run workflow": el primer step de `production` verifica contra la API de GitHub que `staging` corrió exitosamente para ese mismo commit (ver más abajo), así que el riesgo de promover un commit no validado queda cerrado técnicamente, no solo por disciplina del operador. El Environment se sigue creando igual (paso manual único, ver `docs/adoptar-cicd-staging-produccion.md`) porque sigue siendo lo que separa los secrets de staging de los de producción.
3. `runs-on: [self-hosted, platform-local]` en ambos jobs — nunca `ubuntu-latest` (regla de `CLAUDE.md`).
4. Los steps de `staging` y `production` son idénticos salvo el valor de `environment` y, por lo tanto, los secrets que resuelven (mismo nombre de secret, distinto valor por Environment).
5. Ningún workflow de esta spec se dispara por `pull_request` — solo por `push` a la rama de integración (staging) o `workflow_dispatch` (producción), igual criterio que `worker-images.yml` sobre no gastar recursos del runner en cada intento de PR.
6. El filtro de `paths` de cada workflow sigue aplicando solo al trigger `push` (staging) — `workflow_dispatch` no admite filtro de paths, es una acción deliberada sin importar qué cambió.

| Workflow | `paths` que dispara `staging` |
|---|---|
| `migraciones-cloud.yml` | `supabase/migrations/**` |
| `deploy-infraestructura-vps.yml` | `infra/kestra/compose*.yaml`, `infra/superset/compose*.yaml`, `infra/nango/compose*.yaml`, `scripts/deploy-vps.mjs` |
| `publicar-flows-kestra.yml` | `infra/kestra/flows/**` |

## Edge cases cubiertos por este contrato

- Push sin cambios relevantes bajo `paths`: GitHub Actions no dispara el workflow en absoluto (comportamiento nativo del filtro) — no hay job vacío que "no falle".
- Staging falla o nunca corrió para el commit que se quiere promover: el step `Exigir que staging haya corrido exitosamente para este commit` de `production` falla inmediato (antes de instalar nada o tocar un secret de producción) — ya no es responsabilidad de quien dispara `workflow_dispatch` recordarlo, el workflow lo verifica solo contra la API de runs de GitHub Actions (`scripts/verificar-staging-exitoso.mjs`, bug `gate-migraciones-stg-prd`).
- `staging` corrió exitosamente pero para un commit **distinto** al que `production` va a promover (p. ej. alguien mergeó algo nuevo después del último `staging` exitoso): el chequeo compara por `head_sha` exacto, así que también falla en este caso — no alcanza con "staging pasó alguna vez", tiene que haber pasado para ese commit puntual.
- Residual, documentado y no resuelto por este contrato: el chequeo confirma que el job `staging` terminó en verde, no que un humano revisó el resultado o probó la funcionalidad manualmente — sigue siendo responsabilidad de quien dispara `workflow_dispatch` juzgar si "staging pasó" equivale a "esto está listo para producción" (p. ej. una migración puede aplicar sin error y aun así no ser la decisión de negocio correcta para ir a producción todavía). Para ese nivel de aprobación humana explícita, ver "Alternatives" en `research.md` §6 Revisión 2 (required reviewers, viable hoy solo en el repo público del template).
