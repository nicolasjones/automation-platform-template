# Adoptar CI/CD de staging a producción en un producto derivado

Guía de proceso para traer la capacidad de la spec
`20261003-105444-cicd-staging-produccion` a un producto derivado. Contratos
técnicos en `specs/20261003-105444-cicd-staging-produccion/contracts/`.

## 0. Prerrequisitos

- Un VPS con `sshd` accesible (el mismo que ya usa el producto para Kestra,
  Superset y el proxy reverso — ver `docs/deployment.md`).
- Dos proyectos Supabase cloud distintos, uno de staging y uno de
  producción, cada uno con su propia cadena de conexión Postgres.
- Decidir, junto al coordinador del producto, quién será el revisor
  requerido de cada Environment de producción (paso manual, no
  automatizable — ver sección 1).

## 1. Crear los GitHub Environments (manual, una sola vez por repositorio)

GitHub no permite expresar "required reviewers" como código — se configura
a mano en **Settings → Environments** del repositorio. Crear estos seis
Environments:

| Environment | Mecanismo | Required reviewers |
|---|---|---|
| `migraciones-cloud-staging` | CI de migraciones Supabase | No |
| `migraciones-cloud-production` | CI de migraciones Supabase | **Sí** |
| `deploy-infraestructura-vps-staging` | CI de deploy del VPS | No |
| `deploy-infraestructura-vps-production` | CI de deploy del VPS | **Sí** |
| `publicar-flows-kestra-staging` | CI de publicación de flows | No |
| `publicar-flows-kestra-production` | CI de publicación de flows | **Sí** |

En cada `*-production`, agregar como reviewer a la persona (o equipo) que el
coordinador del producto designe — nunca dejarlo sin reviewer, porque
GitHub trataría el Environment como si no tuviera gate.

## 2. Migraciones de Supabase cloud

Ver `specs/20261003-105444-cicd-staging-produccion/contracts/cli-migrar-supabase-cloud.md`
y `.github/workflows/migraciones-cloud.yml`.

- Secret por Environment: `SUPABASE_DB_URL` (cadena de conexión Postgres del
  proyecto cloud de ese entorno).
- Dispara en `push` a `supabase/migrations/**`.

## 3. Deploy de infraestructura del VPS

Ver `specs/20261003-105444-cicd-staging-produccion/contracts/cli-deploy-vps-ci.md`
y `.github/workflows/deploy-infraestructura-vps.yml`.

- Secrets por Environment: `VPS_SSH_PRIVATE_KEY` (Base64), `VPS_SSH_USER`,
  `VPS_SSH_HOST`, y las credenciales que hoy viven en `.env.<entorno>` del
  VPS (Kestra, Superset, Nango).
- El runner self-hosted necesita `openssh-client` instalado
  (`infra/runner/Dockerfile`).
- Dispara en `push` a los `paths` listados en el contrato de gate.

## 4. Publicación de flows de Kestra

Ver `.github/workflows/publicar-flows-kestra.yml`. Reutiliza
`infra/kestra/desplegar-flow.mjs` sin cambios de código.

- Secrets por Environment: `KESTRA_BASIC_AUTH_USERNAME` /
  `KESTRA_BASIC_AUTH_PASSWORD`.
- Dispara en `push` a `infra/kestra/flows/**`.

## 5. Import de dashboards de Superset (mecanismo sin wiring automático)

Ver `specs/20261003-105444-cicd-staging-produccion/contracts/cli-importar-dashboards-superset.md`
y `infra/superset/importar-dashboards.mjs`.

Invocación manual únicamente — no se dispara por ningún push mientras el
producto no tenga al menos un paquete de dashboard exportado y versionado.
Cuando el producto exporte su primer dashboard real, decidir ahí si vale la
pena wirearlo a un workflow de push (fuera del alcance de esta spec).

- Secrets por Environment: `SUPERSET_URL`, `SUPERSET_USERNAME`,
  `SUPERSET_PASSWORD`.
