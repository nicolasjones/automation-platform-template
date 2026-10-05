# Contrato: `promover-todo-a-produccion.yml`

Extiende `specs/20261003-105444-cicd-staging-produccion/contracts/workflow-gate.md` (el contrato del gate individual stg→prd). No lo reemplaza — cada mecanismo sigue cumpliendo ese contrato por su cuenta; este archivo describe únicamente el punto de disparo compartido.

## Forma del workflow

```yaml
name: Promover todo a producción

on:
  workflow_dispatch: {}

permissions:
  contents: write   # necesario para el push explícito main -> production (job refine)
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

  promover-refine:
    runs-on: [self-hosted, platform-local]
    environment: promover-todo-a-produccion
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with: { version: 11.19.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: pnpm install --frozen-lockfile
      - name: Promover main a production (push explícito)
        run: git push origin main:production
      - name: Apuntar producción al deployment de ese push
        run: pnpm vercel:promover -- --branch production
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

## Reglas del contrato

1. **Nunca se dispara por `push`** — solo `workflow_dispatch`, igual criterio que el gate individual.
2. Los tres jobs reutilizados (`migraciones-cloud`, `deploy-infraestructura-vps`, `publicar-flows-kestra`) **no duplican ningún step** — invocan los workflows existentes vía `workflow_call` + `secrets: inherit`. Cada uno sigue verificando su propio staging antes de tocar sus secretos de producción (contrato de `workflow-gate.md`, sin cambios).
3. Para que un workflow reusable funcione desde `workflow_call`, su job `production` debe aceptar ambos triggers: `if: github.event_name == 'workflow_dispatch' || github.event_name == 'workflow_call'`. Su job `staging` no cambia (`if: github.event_name == 'push'`).
4. El job `promover-refine` no depende de los otros tres (`needs` vacío) — una falla en cualquiera de los cuatro **no bloquea** la promoción de los demás (FR-006). No hay gate técnico de "staging corrió" para Refine en esta spec porque Vercel ya genera su propio deploy por commit, verificable manualmente antes de disparar el botón — ver Residual Risk en `quickstart.md`. El `git push origin main:production` no usa `--force` a propósito: si `production` alguna vez divergió de `main` (p. ej. un commit directo a esa rama), el push falla con el rechazo estándar de git por non-fast-forward — falla visible y ruidosa, nunca silenciosa, pero sin ningún mensaje propio de este workflow explicándolo (queda como log crudo de git). `scripts/promover-deployment-vercel.mjs` reintenta hasta que ese deployment esté `READY` (timeout configurable, 5 minutos por defecto) antes de promoverlo — ver `research.md` §3 para por qué se promueve por `deployment_id` y no reasignando la "Production Branch" del proyecto.
5. **Regla de extensión (FR-007, obligatoria para specs futuras)**: cualquier mecanismo de plataforma nuevo que introduzca su propio split staging→producción (un flow, un worker, un dashboard de Superset con su propio ciclo, etc.) DEBE agregar un job a `promover-todo-a-produccion.yml` — vía `workflow_call` si es un workflow de GitHub Actions, o un step equivalente si no lo es (como el caso de Refine). No se habilita crear un `workflow_dispatch` de producción nuevo que quede fuera de este punto único. Documentar la incorporación en este mismo archivo, sección "Mecanismos registrados" (ver abajo).
6. El OK para disparar este workflow sigue siendo una decisión humana explícita — este contrato no introduce ni depende de ningún control técnico de aprobación de GitHub (ver Assumptions de `spec.md`).

## Mecanismos registrados

| Mecanismo | Cómo se suma | Desde |
|---|---|---|
| Migraciones de Supabase | `workflow_call` → `migraciones-cloud.yml` | esta spec |
| Infraestructura VPS (Kestra/Superset/Nango) | `workflow_call` → `deploy-infraestructura-vps.yml` | esta spec |
| Flows de Kestra | `workflow_call` → `publicar-flows-kestra.yml` | esta spec |
| Refine (frontend) | step `git push origin main:production` | esta spec |

## Bootstrap de Vercel (una sola vez, fuera del workflow recurrente)

- Crear la rama `production` en el repo, apuntando al commit actual de `main` — hecho.
- Crear un Access Token de Vercel (idealmente scopeado al proyecto) **generado y cargado por el usuario directamente** — un agente no debe generar ni ver el valor de un token real — y guardarlo como secret `VERCEL_TOKEN` en el GitHub Environment `promover-todo-a-produccion` del repo que adopte esta capacidad.
- Guardar también `VERCEL_PROJECT_ID` (no es secreto, pero se guarda igual como secret de Environment por simplicidad) — se obtiene de `vercel.com/<scope>/<proyecto>/settings` o de la API (`GET /v9/projects/{idOrName}`, campo `id`).
- No hace falta tocar ninguna configuración de Vercel (dominios, Production Branch, variables de entorno) — la promoción por `deployment_id` no depende de ninguna de esas.
