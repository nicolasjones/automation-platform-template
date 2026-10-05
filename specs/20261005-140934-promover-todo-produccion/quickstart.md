# Quickstart: validar el botón único de promoción a producción

## Prerrequisitos

- PR de esta spec mergeado a `main` en `automation-platform-template` (y, después, porteado a cada producto derivado — ver `docs/wiki/sistemas/sincronizacion-template.md` en el producto).

## Validación sin riesgo

1. Disparar `promover-todo-a-produccion.yml` (`workflow_dispatch`) en una rama de prueba cuyo `staging` nunca corrió para ese commit.
2. Confirmar que los tres jobs (`migraciones-cloud`, `deploy-infraestructura-vps`, `publicar-flows-kestra`) fallan en su step `Exigir que staging haya corrido exitosamente para este commit`, igual que lo hacían al dispararse individualmente (ver `.specify/bugs/gate-migraciones-stg-prd/test.md` del PR #27) — sin que uno bloquee a los otros.
3. Confirmar que ninguno llega a resolver un secret de producción.

## Validación completa (con `staging` real en verde)

1. Verificar que `staging` corrió exitosamente para el commit de `main` que se quiere promover, en los tres mecanismos.
2. Disparar `promover-todo-a-produccion.yml`.
3. Confirmar que los tres se promueven (mismo resultado que dispararlos individualmente).

**Verificado en vivo (2026-10-05)**: run [37363470211](https://github.com/nicolasjones/estudio-contable-automation/actions/runs/37363470211) contra `estudio-contable-automation` — los 3 jobs se promovieron correctamente a producción real con un solo disparo.

## Refine/Vercel: fuera de alcance

Ver `contracts/promover-todo-a-produccion.md` → "Refine/Vercel: limitación conocida" y `research.md` → "Revisión final". No hay nada que validar acá — el frontend no forma parte de este botón; sigue desplegando a producción automáticamente en cada push a `main`, igual que antes de esta spec.

## Residual Risk (documentar, no resolver en esta spec)

- Ninguno nuevo de los 3 mecanismos entregados — su comportamiento es el mismo que ya tenían disparados individualmente, solo que agrupado.
