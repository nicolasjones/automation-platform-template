# Quickstart: validar el pipeline de CI/CD staging → producción

Guía de validación de punta a punta una vez implementada la spec. No es la implementación — referencia los contratos en `contracts/` y las entidades en `data-model.md`.

## Prerrequisitos

- Secrets configurados en los GitHub Environments `migraciones-cloud-staging`, `migraciones-cloud-production`, `deploy-infraestructura-vps-staging`, `deploy-infraestructura-vps-production`, `publicar-flows-kestra-staging`, `publicar-flows-kestra-production` (ver tabla de secrets en `research.md`).
- Required reviewers configurado en los tres Environments `*-production` (paso manual único de configuración del repositorio, no expresable en YAML).
- `infra/runner/Dockerfile` reconstruido con `openssh-client` incluido.
- Un proyecto Supabase cloud de staging y uno de producción, cada uno con su `SUPABASE_DB_URL` como secret.
- Un VPS (real o de prueba) con `sshd` accesible y Kestra/Superset corriendo vía `infra/<producto>/compose.yaml`, con su clave SSH como secret `VPS_SSH_PRIVATE_KEY`.

## Escenario 1 — Migraciones (User Story 1)

1. Crear una migración trivial (p. ej. un comentario o una tabla de prueba aditiva) en `supabase/migrations/`.
2. Push a la rama que dispara el pipeline.
3. **Esperado**: el job `staging` de `migraciones-cloud.yml` corre y aplica la migración contra el proyecto Supabase de staging sin intervención.
4. Revisar la pestaña Actions: el job `production` aparece pausado esperando aprobación.
5. Aprobar como reviewer autorizado.
6. **Esperado**: la misma migración se aplica contra el proyecto Supabase de producción.

## Escenario 2 — Deploy de infraestructura del VPS (User Story 2)

1. Modificar un valor no sensible en `infra/kestra/compose.yaml` (o el producto que se esté probando).
2. Push a la rama que dispara el pipeline.
3. **Esperado**: el job `staging` de `deploy-infraestructura-vps.yml` sintetiza el `.env.staging` transitorio, conecta por `DOCKER_HOST=ssh://...` al VPS de staging, y corre `pnpm deploy:vps -- staging` sin que nadie se conecte por SSH a mano.
4. Aprobar producción desde Actions.
5. **Esperado**: el mismo deploy corre contra el VPS de producción con sus propios secrets.

## Escenario 3 — Publicación de flows (User Story 3)

1. Modificar un flow bajo `infra/kestra/flows/`.
2. Push a la rama que dispara el pipeline.
3. **Esperado**: `publicar-flows-kestra.yml` publica el flow contra el Kestra de staging sin correr el script a mano; producción queda pausada hasta aprobación.

## Escenario 4 — Import de dashboards de Superset (User Story 4, manual)

1. Exportar un dashboard de prueba de una instancia de Superset local (`pnpm dev:superset`) a un paquete ZIP.
2. Ejecutar `node infra/superset/importar-dashboards.mjs --source <paquete.zip> --entorno staging` apuntando `SUPERSET_URL`/`SUPERSET_USERNAME`/`SUPERSET_PASSWORD` a una instancia de prueba.
3. **Esperado**: el dashboard aparece importado en esa instancia; ningún workflow automático se disparó por este paso (no hay ningún YAML de dashboard versionado en el repo todavía).

## Validación negativa (edge cases)

- Forzar que el job `staging` de cualquiera de los tres workflows falle (p. ej. una migración inválida) y confirmar que `production` nunca queda disponible para aprobación.
- Rechazar (no aprobar) un job `production` pendiente y confirmar que no se aplicó nada contra producción, y que un push posterior dispara una corrida nueva de `staging` sin quedar bloqueado por el rechazo anterior.
- Quitar temporalmente un secret requerido (p. ej. `SUPABASE_DB_URL`) y confirmar que el job falla con un mensaje que nombra la variable faltante, no un error de conexión ambiguo.
