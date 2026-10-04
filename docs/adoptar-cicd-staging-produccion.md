# Adoptar CI/CD de staging a producción en un producto derivado

Guía de proceso para traer la capacidad de la spec
`20261003-105444-cicd-staging-produccion` a un producto derivado. Contratos
técnicos en `specs/20261003-105444-cicd-staging-produccion/contracts/`.

## 0. Prerrequisitos

- Un VPS con `sshd` accesible (el mismo que ya usa el producto para Kestra,
  Superset y el proxy reverso — ver `docs/deployment.md`).
- Dos proyectos Supabase cloud distintos, uno de staging y uno de
  producción, cada uno con su propia cadena de conexión Postgres.

## 1. Crear los GitHub Environments (manual, una sola vez por repositorio)

**Actualizado (decisión del coordinador, ver `tasks.md` T027 de esta spec)**:
el gate ya no usa required reviewers — esa regla de protección requiere un
plan de pago de GitHub (Team/Enterprise) para un repositorio privado, y no
estaba disponible. El gate es ahora el propio acto de disparar
`workflow_dispatch` a mano desde la pestaña Actions. Los Environments se
siguen creando igual, porque siguen siendo lo que separa los secrets de
staging de los de producción — solo que ya no llevan ninguna regla de
protección. Crear estos seis Environments en **Settings → Environments**:

| Environment | Mecanismo |
|---|---|
| `migraciones-cloud-staging` | CI de migraciones Supabase |
| `migraciones-cloud-production` | CI de migraciones Supabase |
| `deploy-infraestructura-vps-staging` | CI de deploy del VPS |
| `deploy-infraestructura-vps-production` | CI de deploy del VPS |
| `publicar-flows-kestra-staging` | CI de publicación de flows |
| `publicar-flows-kestra-production` | CI de publicación de flows |

Promover a producción es: pestaña **Actions** → el workflow correspondiente
→ **Run workflow**, elegido a propósito por quien tenga permiso de escribir
en el repositorio (GitHub ya requiere al menos permiso `write` para disparar
`workflow_dispatch` — no hace falta nada adicional).

## 2. Migraciones de Supabase cloud

Ver `specs/20261003-105444-cicd-staging-produccion/contracts/cli-migrar-supabase-cloud.md`
y `.github/workflows/migraciones-cloud.yml`.

- Secret por Environment: `SUPABASE_DB_URL` (cadena de conexión Postgres del
  proyecto cloud de ese entorno).
- `staging` dispara en `push` a `supabase/migrations/**`. `production` solo
  por `workflow_dispatch` manual.
- Antes de aplicar nada, `pnpm db:validar:aditivas` rechaza cualquier
  migración destructiva sin Reversión documentada (misma convención ya
  vigente en `supabase/migrations/`).

## 3. Deploy de infraestructura del VPS

Ver `specs/20261003-105444-cicd-staging-produccion/contracts/cli-deploy-vps-ci.md`
y `.github/workflows/deploy-infraestructura-vps.yml`.

- Secrets por Environment: `VPS_SSH_PRIVATE_KEY` (texto plano PEM, sin Base64), `VPS_SSH_USER`,
  `VPS_SSH_HOST`, y `VPS_DEPLOY_ENV` (el bloque completo de variables que
  hoy viven en `.env.<entorno>` del VPS — Kestra, Superset, Nango — que el
  workflow sintetiza como archivo transitorio en el workspace del job).
- El runner self-hosted necesita `openssh-client` instalado
  (`infra/runner/Dockerfile`).
- `staging` dispara en `push` a los `paths` listados en el contrato de gate.
  `production` solo por `workflow_dispatch` manual.

## 4. Publicación de flows de Kestra

Ver `.github/workflows/publicar-flows-kestra.yml`. Reutiliza
`infra/kestra/desplegar-flow.mjs` sin cambios de código.

- Secrets por Environment: `KESTRA_BASIC_AUTH_USERNAME`,
  `KESTRA_BASIC_AUTH_PASSWORD` y `KESTRA_PUBLIC_URL` (mismo nombre que ya usa
  `.env.example` para el dominio HTTPS de Kestra en ese entorno).
- `staging` dispara en `push` a `infra/kestra/flows/**`. `production` solo
  por `workflow_dispatch` manual.

## 5. Import de dashboards de Superset (mecanismo sin wiring automático)

Ver `specs/20261003-105444-cicd-staging-produccion/contracts/cli-importar-dashboards-superset.md`
y `infra/superset/importar-dashboards.mjs`.

Invocación manual únicamente — no se dispara por ningún push mientras el
producto no tenga al menos un paquete de dashboard exportado y versionado.
Cuando el producto exporte su primer dashboard real, decidir ahí si vale la
pena wirearlo a un workflow de push (fuera del alcance de esta spec).

- Secrets por Environment: `SUPERSET_URL`, `SUPERSET_USERNAME`,
  `SUPERSET_PASSWORD`.
- Invocación: `pnpm superset:importar-dashboards -- --source <paquete.zip> --entorno staging|production`.
  Exporta `SUPERSET_URL`/`SUPERSET_USERNAME`/`SUPERSET_PASSWORD` antes de
  correrlo a mano, o inyectalos como secrets si alguna vez se conecta a un
  workflow.
