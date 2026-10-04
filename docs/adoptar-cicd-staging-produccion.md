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

**Importante para cualquier servicio nuevo que agregues a `infra/<producto>/compose.yaml`**:
`DOCKER_HOST=ssh` remoto significa que un bind mount con ruta relativa
(`./archivo:/destino`) nunca va a funcionar — el daemon del VPS no tiene el
checkout del runner de CI en su filesystem. Si tu servicio necesita un
archivo propio dentro del contenedor, horneálo en la imagen (`COPY` en el
`Dockerfile` del producto), como ya hace `infra/superset/Dockerfile`. Ver
`research.md` §2 de esta spec para el detalle completo.

- Secrets por Environment: `VPS_SSH_PRIVATE_KEY` (texto plano PEM, sin Base64), `VPS_SSH_USER`,
  `VPS_SSH_HOST`, y `VPS_DEPLOY_ENV`.
- **`VPS_DEPLOY_ENV` NO es el nombre del entorno** (`staging`/`production`) —
  eso ya está hardcodeado en el workflow. Es el **contenido completo** de lo
  que hoy es el archivo `.env.<entorno>` en el filesystem del VPS: todas las
  variables que `infra/kestra/compose.yaml`, `infra/superset/compose.yaml`,
  `infra/nango/compose.yaml` y `infra/playwright/compose.yaml` necesitan,
  una por línea en formato `CLAVE=valor` (dotenv), con valores reales de
  ese entorno — nunca los defaults de `.env.example`, que son solo para
  desarrollo local. El workflow valida que tenga al menos 15 líneas
  `CLAVE=valor` antes de usarlo, y falla con un mensaje claro si no (para no
  confundir "faltan variables" con un error de Docker). Variables
  requeridas (ver `.env.example` para la descripción de cada una):

  | Grupo | Variables |
  |---|---|
  | Kestra | `KESTRA_PORT`, `KESTRA_BASIC_AUTH_USERNAME`, `KESTRA_BASIC_AUTH_PASSWORD`, `KESTRA_DB_PASSWORD`, `KESTRA_PUBLIC_URL`, `KESTRA_ORQUESTACION_DB_URL`, `KESTRA_ORQUESTACION_DB_PASSWORD`, `KESTRA_ORQUESTACION_CONCURRENCIA`, `KESTRA_BACKUPS_DB_URL`, `KESTRA_BACKUPS_PGDUMP_URL`, `KESTRA_BACKUPS_DB_PASSWORD`, `KESTRA_ALERTAS_WEBHOOK_URL`, `SECRET_ORQUESTACION_SSH_PRIVATE_KEY`, `EVIDENCIA_DIR_HOST`, `EVIDENCIA_RETENCION_DIAS`, `EVIDENCIA_VISUAL` |
  | Superset | `SUPERSET_PORT`, `SUPERSET_ADMIN_USERNAME`, `SUPERSET_ADMIN_PASSWORD`, `SUPERSET_ADMIN_EMAIL`, `SUPERSET_DB_PASSWORD`, `SUPERSET_SECRET_KEY`, `SUPERSET_GUEST_TOKEN_USERNAME`, `SUPERSET_GUEST_TOKEN_PASSWORD`, `SUPERSET_GUEST_TOKEN_JWT_SECRET`, `REFINE_ORIGIN`, `SUPABASE_DOCKER_NETWORK`, `WEB_PORT` |
  | Nango | `NANGO_PORT`, `NANGO_DASHBOARD_USERNAME`, `NANGO_DASHBOARD_PASSWORD`, `NANGO_DB_PASSWORD`, `NANGO_ENCRYPTION_KEY`, `NANGO_SERVER_URL`, `NANGO_PUBLIC_SERVER_URL`, `NANGO_SECRET_KEY_DEV` |
  | Playwright | `PLAYWRIGHT_PORT` |

  `KESTRA_ORQUESTACION_DB_URL`/`KESTRA_BACKUPS_DB_URL`/`KESTRA_BACKUPS_PGDUMP_URL`
  en particular **no** deben apuntar a `host.docker.internal` (eso es solo
  para desarrollo local) — deben apuntar a la conexión real del proyecto
  Supabase cloud de ese entorno. `REFINE_ORIGIN`/`KESTRA_PUBLIC_URL`/`NANGO_SERVER_URL`
  deben ser los dominios HTTPS reales del entorno, no `localhost`.
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
