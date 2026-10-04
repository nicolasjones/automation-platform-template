# Data Model: CI/CD staging → producción para migraciones, VPS, flows y dashboards

Esta feature no agrega tablas a Supabase — es mecanismo de CI/plataforma. Las "entidades" son conceptuales (configuración y artefactos versionados), no filas de base de datos. Se documentan aquí para que `tasks.md` tenga nombres estables a los que referirse.

## Entorno

Representa `staging` o `production`. Determina:
- El GitHub Environment de GitHub Actions que aplica (y por lo tanto sus required reviewers y sus secrets).
- A qué proyecto Supabase cloud, qué host del VPS, y qué instancia de Kestra/Superset apunta cada script.

No se modela como tabla ni archivo de configuración nuevo: es el nombre de job/Environment en cada workflow (`staging` / `production`), y el sufijo de los secrets (`STAGING_*` / `PRODUCTION_*` según el Environment, no en el nombre del secret — GitHub Environments ya aíslan los secrets por entorno sin necesitar prefijo).

## Secreto (GitHub Actions secret, por Environment)

| Campo | Descripción |
|---|---|
| `nombre` | Identificador del secret (p. ej. `SUPABASE_DB_URL`) |
| `entorno` | Environment de GitHub al que pertenece (`staging` o la variante `*-production`) |
| `consumidor` | Script o paso de workflow que lo lee |
| `reemplaza` | Qué credencial manual (archivo `.env` del VPS, variable local) deja obsoleta |

Catálogo completo en `research.md` → "Resumen de secrets nuevos por GitHub Environment".

## Workflow de gate (staging → producción)

| Campo | Descripción |
|---|---|
| `nombre` | Archivo en `.github/workflows/` |
| `disparador` | `push` con filtro de `paths` (qué carpeta/archivo activa el job de staging) |
| `job_staging` | Corre sin gate, contra el entorno de staging |
| `job_production` | `needs: job_staging`; `environment` con required reviewers; corre solo tras aprobación |
| `mecanismo` | Cuál de los tres (migraciones / deploy de infraestructura / publicación de flows) |

Tres instancias de esta forma: `migraciones-cloud.yml`, `deploy-infraestructura-vps.yml`, `publicar-flows-kestra.yml`.

## Migración (ya existente, sin cambios de forma)

Archivo SQL versionado en `supabase/migrations/`. Esta spec no cambia su formato — solo agrega el mecanismo que la aplica contra un proyecto cloud por entorno. Debe seguir siendo aditiva o llevar camino de reversión explícito (regla ya vigente, Constitución §Technology and Quality Gates).

## Despliegue de infraestructura (ya existente, sin cambios de forma)

Lo que ya orquesta `scripts/deploy-vps.mjs` por producto (`kestra`, `superset`, `nango`) contra un entorno. Playwright queda deliberadamente fuera de este loop — no es un producto de plataforma compartido, cada cliente corre su propia instancia dedicada (hallazgo real de T025, ver `research.md`). Esta spec no cambia cómo se despliega cada producto incluido — cambia de dónde obtiene las credenciales y cómo alcanza el Docker del VPS (ver `research.md` §1-2).

## Flow de orquestación (ya existente, sin cambios de forma)

Archivo YAML versionado en `infra/kestra/flows/`. Esta spec no cambia su formato — solo conecta `infra/kestra/desplegar-flow.mjs` (sin cambios de código) al mismo gate de staging/producción.

## Paquete de dashboard exportado (nuevo concepto, sin wiring automático)

| Campo | Descripción |
|---|---|
| `ruta` | Paquete exportado de Superset (ZIP con el YAML del dashboard + datasets/bases que usa) |
| `entorno_destino` | A qué Superset (staging o producción) se importa |
| `invocación` | Manual (CLI), no disparada por ningún push mientras no exista ningún paquete versionado en el repo (FR-011) |

No se versiona ningún paquete de ejemplo real en esta spec — se usa uno sintético solo para validar el mecanismo durante la implementación (ver `spec.md` → Assumptions).
