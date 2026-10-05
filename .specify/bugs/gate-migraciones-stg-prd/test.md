# Bug Verification: `production` ahora exige que `staging` haya corrido exitosamente

- **Slug**: gate-migraciones-stg-prd
- **Tested**: 2026-10-05
- **Assessment**: ./assessment.md
- **Fix**: ./fix.md
- **Result**: verified

## Summary

Reproducción en vivo contra el `production` real del template (con confirmación explícita del usuario, dado el secret real `SUPABASE_DB_URL` configurado en el Environment `migraciones-cloud-production`): se disparó `workflow_dispatch` de `migraciones-cloud.yml` en la rama del fix, que nunca tuvo un `staging` exitoso para ese commit. El job falló en el primer step (`Exigir que staging haya corrido exitosamente para este commit`) en ~2.5s, y todos los pasos posteriores (`db:validar:aditivas`, `Instalar Supabase CLI`, `db:migrar:cloud`) quedaron `skipped` — el secret de producción nunca se resolvió ni se usó. El síntoma original (producción se promueve sin que staging haya corrido) ya no reproduce.

## Checks Performed

| Check | Command / Action | Result | Notes |
|-------|------------------|--------|-------|
| Reproducción (post-fix), en vivo contra `production` real | `gh workflow run migraciones-cloud.yml --ref gate-migraciones-stg-prd` (run [37338970243](https://github.com/nicolasjones/automation-platform-template/actions/runs/37338970243)) | pass | Job `production` → `conclusion: failure` en el step del gate; pasos siguientes `skipped`. Monitoreado en vivo, sin necesidad de cancelar. |
| Tests nuevos | `pnpm test:ci:verificar-staging-exitoso` | pass | 6/6 (ver `fix.md`) |
| Regresión — script de migración | `pnpm test:db:migrar-cloud` | pass | 3/3, sin cambios de comportamiento |
| Regresión — validación aditiva | `pnpm test:db:validar-aditivas` | pass | 5/5, sin cambios de comportamiento |
| Gate de versiones de capacidades | `pnpm template:capabilities:check --base origin/main` | pass | Las 3 capacidades tocadas bumpeadas correctamente |
| Gate de adopción del template sobre sí mismo | `pnpm template:adoption:check` | pass | `template-adoption.json` actualizado |
| Doc de cambios | `pnpm docs:check` | pass | OK contra HEAD~1 |
| CI real del PR #27 | `Validate` + `Verificar alcance de plataforma` (GitHub Actions) | pass | Verde contra el commit final (`f3b0389`) |

## Output Excerpts

```
$ node scripts/verificar-staging-exitoso.mjs -- --workflow migraciones-cloud.yml --head-sha f3b03891ec1255dbf8d6753d60f67cb4627ceee0
##[error]staging nunca corrió exitosamente para el commit f3b03891ec1255dbf8d6753d60f67cb4627ceee0 en migraciones-cloud.yml — no se puede promover a producción. Volvé a correr staging (push a main) o esperá a que termine antes de disparar production.
[ELIFECYCLE] Command failed with exit code 1.
```

Step siguiente (`db:validar:aditivas`) y todos los posteriores: `completed/skipped`.

## Residual Risks

- Solo se probó `migraciones-cloud.yml` en vivo (los 3 workflows comparten el mismo script y el mismo patrón de step, verificado por lectura — `deploy-infraestructura-vps.yml` y `publicar-flows-kestra.yml` no se dispararon en vivo para no tocar sus respectivos secrets reales sin necesidad adicional, dado que la lógica que se está probando es idéntica y vive en el mismo script compartido).
- No se probó el camino "feliz" en vivo (un `head_sha` que sí tiene un `staging` exitoso) — cubierto por los tests unitarios con servidor HTTP falso (`aprueba cuando staging corrió exitosamente para el mismo head_sha`), no contra la API real de GitHub. Riesgo bajo: la llamada a la API real ya se ejercitó en el camino de fallo (conectividad, auth con `GITHUB_TOKEN`, parseo de la respuesta) — solo cambia el resultado de la comparación de `head_sha`/`conclusion`, que es lógica pura ya cubierta por unit tests.
- Portback a `estudio-contable-automation` (el repo donde ocurrió el incidente real) no hecho todavía — sin esto, el repo derivado real sigue expuesto al mismo gap hasta que se porte.
- PR #27 todavía no está mergeado a `main` del template.

## Recommendation

Cerrar el bug en el template — verificado de punta a punta, incluida una reproducción en vivo del escenario exacto que motivó el reporte, contra el `production` real (sin tocar ningún secret, por diseño del propio fix). Antes de considerar el incidente original resuelto, falta: (1) mergear PR #27, y (2) portear la capacidad actualizada a `estudio-contable-automation`, que es el repo privado donde ocurrió el incidente real — ninguno de los dos pasos es parte de este bug-fix en sí, quedan como próximos pasos explícitos.
