# Quickstart: validar el botón único de promoción a producción

## Prerrequisitos

- PR de esta spec mergeado a `main` en `automation-platform-template` (y, después, porteado a cada producto derivado — ver `docs/wiki/sistemas/sincronizacion-template.md` en el producto).
- Bootstrap de Vercel ya hecho (ver `contracts/promover-todo-a-produccion.md` → "Bootstrap de Vercel"): rama `production` creada, secrets `VERCEL_TOKEN`/`VERCEL_PROJECT_ID` cargados en el Environment `promover-todo-a-produccion`. **El token lo genera y carga el usuario directamente — un agente no debe generar ni ver su valor.**

## Validación sin riesgo (antes del bootstrap de Vercel)

1. Disparar `promover-todo-a-produccion.yml` (`workflow_dispatch`) en una rama de prueba cuyo `staging` nunca corrió para ese commit.
2. Confirmar que los tres jobs reutilizados (`migraciones-cloud`, `deploy-infraestructura-vps`, `publicar-flows-kestra`) fallan en su step `Exigir que staging haya corrido exitosamente para este commit`, igual que lo hacían al dispararse individualmente (ver `.specify/bugs/gate-migraciones-stg-prd/test.md` del PR #27) — sin que uno bloquee a los otros.
3. Confirmar que ninguno de los tres llega a resolver un secret de producción.

## Validación completa (después del bootstrap de Vercel, con `staging` real en verde)

1. Verificar que `staging` corrió exitosamente para el commit de `main` que se quiere promover, en los tres mecanismos de GitHub Actions.
2. Disparar `promover-todo-a-produccion.yml`.
3. Confirmar: los tres jobs reutilizados se promueven (mismo resultado que dispararlos individualmente). El job `promover-refine` hace `git push origin main:production` sin error, y `scripts/promover-deployment-vercel.mjs` encuentra el deployment resultante, espera a que esté `READY` y lo promueve.
4. Confirmar en el dashboard de Vercel (pestaña Deployments del proyecto) que el deployment de ese push a `production` quedó marcado como el actual en producción.

## Residual Risk (documentar, no resolver en esta spec)

- El job `promover-refine` no verifica técnicamente que alguien miró el staging de Refine (la URL `-git-main-...vercel.app`) antes de promover — a diferencia de los otros tres mecanismos, que sí tienen un chequeo automático (`verificar-staging-exitoso.mjs`). Queda como mejora futura si se vuelve un problema real en la práctica.
- `scripts/promover-deployment-vercel.mjs` identifica "el deployment a promover" por ser el más reciente de la rama `production` — si dos promociones se disparan casi en simultáneo, podría promoverse un deployment distinto del que un operador esperaba. Riesgo bajo dado que esta es una acción manual de baja frecuencia con OK explícito previo.
