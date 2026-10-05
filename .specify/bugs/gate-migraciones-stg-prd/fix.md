# Bug Fix: `production` ahora exige que `staging` haya corrido exitosamente

- **Slug**: gate-migraciones-stg-prd
- **Fixed**: 2026-10-05
- **Assessment**: ./assessment.md
- **Status**: applied

## Summary

El job `production` de los tres workflows del gate (`migraciones-cloud.yml`, `deploy-infraestructura-vps.yml`, `publicar-flows-kestra.yml`) ahora corre, como primer step, `scripts/verificar-staging-exitoso.mjs` — consulta la API de runs de GitHub Actions y exige que exista un run de `staging` con `conclusion: success` para el mismo `head_sha` que `production` está por promover. Si no existe, el job falla antes de instalar nada o de resolver cualquier secret de producción. No depende de GitHub Environments de pago ni de que el repo sea público — a diferencia de "required reviewers", se porta sin cambios a productos derivados privados.

## Changes

| File | Change | Notes |
|------|--------|-------|
| `scripts/verificar-staging-exitoso.mjs` | added | Consulta `GET .../actions/workflows/{workflow}/runs?branch=main&event=push&status=success` y busca un run con `head_sha` igual al commit a promover. |
| `scripts/verificar-staging-exitoso.test.mjs` | added | 6 tests: validación de argumentos/env antes de tocar la red, y 3 casos contra un servidor HTTP local falso (match exitoso, sin match, sin runs). |
| `package.json` | modified | Alias `ci:verificar-staging-exitoso` y `test:ci:verificar-staging-exitoso`, mismo patrón que `db:migrar:cloud`/`db:validar:aditivas`. |
| `.github/workflows/migraciones-cloud.yml` | modified | `permissions.actions: read` + nuevo step en `production` antes de `pnpm db:validar:aditivas`. Comentario de cabecera actualizado. |
| `.github/workflows/deploy-infraestructura-vps.yml` | modified | Mismo patrón, step antes de iniciar el ssh-agent de producción. |
| `.github/workflows/publicar-flows-kestra.yml` | modified | Mismo patrón, step antes de publicar flows contra Kestra de producción. |
| `specs/20261003-105444-cicd-staging-produccion/contracts/workflow-gate.md` | modified | Nueva sección "Actualizado otra vez", forma del workflow actualizada con el step nuevo, edge cases reescritos (ya no quedan como trade-off aceptado). |
| `specs/20261003-105444-cicd-staging-produccion/research.md` | modified | §6 "Revisión 2": hallazgo del incidente real, por qué required reviewers no se porta a productos derivados privados, decisión y alternativas. |
| `specs/20261003-105444-cicd-staging-produccion/tasks.md` | modified | T030 agregada, nota corta de desvío referenciando este fix (regla del CLAUDE.md del repo derivado, aplicada también acá por consistencia). |
| `docs/adoptar-cicd-staging-produccion.md` | modified | Nota de actualización en la sección de Environments — sin pasos manuales nuevos para el producto derivado. |
| `.specify/bugs/gate-migraciones-stg-prd/assessment.md` | added (commit previo) | Evaluación del bug. |

## Diff Highlights

```yaml
# production, los 3 workflows — primer step antes de cualquier secret de producción
- name: Exigir que staging haya corrido exitosamente para este commit
  run: pnpm ci:verificar-staging-exitoso -- --workflow migraciones-cloud.yml --head-sha "$GITHUB_SHA"
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

```js
// scripts/verificar-staging-exitoso.mjs
const exitoso = runs.some((run) => run.head_sha === headSha && run.conclusion === 'success');
if (!exitoso) {
  console.error(`::error::staging nunca corrió exitosamente para el commit ${headSha} en ${workflow} — no se puede promover a producción. ...`);
  process.exit(1);
}
```

## Tests Added or Updated

- `scripts/verificar-staging-exitoso.test.mjs::rechaza sin --workflow antes de tocar la red`
- `scripts/verificar-staging-exitoso.test.mjs::rechaza sin --head-sha antes de tocar la red`
- `scripts/verificar-staging-exitoso.test.mjs::rechaza sin GITHUB_TOKEN antes de tocar la red`
- `scripts/verificar-staging-exitoso.test.mjs::aprueba cuando staging corrió exitosamente para el mismo head_sha`
- `scripts/verificar-staging-exitoso.test.mjs::rechaza cuando staging nunca corrió exitosamente para ese head_sha`
- `scripts/verificar-staging-exitoso.test.mjs::rechaza cuando no hay ningún run exitoso de staging`

## Local Verification

- `pnpm test:ci:verificar-staging-exitoso` → 6/6 pass.
- `pnpm test:db:migrar-cloud` → 3/3 pass (sin regresión).
- `pnpm test:db:validar-aditivas` → 5/5 pass (sin regresión).
- `pnpm docs:check` → OK (Principio VII de la Constitución, cambio de código acompañado de doc).
- Lectura manual de los 3 YAML editados completos — indentación y estructura de jobs verificada a ojo (no había `actionlint`/`js-yaml` instalado localmente para una validación automática; queda como follow-up).
- CI real del PR (`gh run list`, rama `gate-migraciones-stg-prd`): `Validate` y `Verificar alcance de plataforma` en `success` contra el commit final (`c47bb01`) — incluye `pnpm template:capabilities:check` y `pnpm template:adoption:check`, ambos en verde tras bumpear versiones y `template-adoption.json`.
- **No verificado en vivo todavía**: disparar `production` contra un commit real sin `staging` exitoso y confirmar que falla antes de tocar secrets — requiere un `workflow_dispatch` real contra uno de los 3 workflows. Pendiente para `/speckit-bug-test`.

## Deviations from Assessment

- La "Alternative" de verificación extra contra `supabase migration list` de staging (defensa en profundidad específica de `migraciones-cloud.yml`) **no se implementó** — el assessment ya la dejaba como opcional/abierta por el trade-off de aislamiento de credenciales entre entornos. Documentada en `research.md` §6 Revisión 2 como pendiente para una spec futura si el chequeo por `head_sha` resulta insuficiente en la práctica. No es una desviación del plan, es la opción que el propio assessment marcaba como no-preferida.
- Se agregó una entrada a `tasks.md` (T030) no listada explícitamente en "Files likely to change" del assessment, pero sí implícita en "Risks & Considerations" (nota de desvío) y requerida por el CLAUDE.md del repo derivado sobre notas de desvío cortas — se aplicó el mismo criterio acá por consistencia aunque esta spec es del template, no del producto derivado.

## Follow-ups

- Portback explícito a `estudio-contable-automation` (capacidad `vps-deploy-gate` en `template-adoption.json`, hoy en 1.0.5) después de mergear este PR — es el repo donde ocurrió el incidente real.
- Validar en vivo (`/speckit-bug-test`): push a una rama que dispare `staging`, dejarlo fallar o no correr, y confirmar que `workflow_dispatch` de `production` falla rápido con el mensaje esperado sin tocar secrets. Idealmente contra un workflow de prueba aislado, no contra los 3 reales con secrets de producción reales.
- Evaluar si instalar `actionlint` (o equivalente) como gate de CI para YAML de workflows — hoy no hay validación automática de sintaxis de Actions en este repo, se verificó a ojo en este fix.
- Decisión pendiente, no de este fix: ¿sumar además "required reviewers" en el Environment de producción del template público, como defensa adicional ahí? Quedó como pregunta abierta en el assessment, no resuelta — no bloquea este fix.
