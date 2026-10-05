# Adoptar los runners locales optimizados

Capacidad `local-ci-runners` de `template-capabilities.json`. Hace que las
réplicas del runner self-hosted compartan un store de pnpm persistente
(también con los runners de otros productos de la máquina), limita la memoria
de cada réplica y la cantidad de descargas simultáneas de `pnpm install`, y
deja la cantidad de réplicas en una variable. El diseño y la operación están
en `docs/deployment.md` ("Réplicas, memoria, red y store de pnpm del runner");
el porqué, en `specs/20260925-221701-optimizar-runners-locales/research.md`.

Mientras un producto no la adopte, sus runners siguen descargando todas las
dependencias en cada réplica, y el store del template no lo aprovecha: el
beneficio de "una descarga por máquina" requiere que ambos adopten.

## Qué traer

Solo `infra/runner/compose.yaml`; el `Dockerfile` y el `entrypoint.mjs` no
cambian, y `validate.yml` tampoco.

1. Integrar el `compose.yaml` del template (`git merge upstream/main` o a mano)
   **conservando lo propio del producto**: `name:` (línea 1), `RUNNER_REPO` y
   `RUNNER_NAME`. Lo nuevo es el bloque `deploy` (réplicas y
   `resources.limits.memory`), las cinco variables `pnpm_config_*` del
   `environment`, el montaje `pnpm-store:/pnpm` y el bloque `volumes:`
   al final. **No** cambiar el nombre por defecto del volumen
   (`platform-runner-pnpm-store`): es lo que lo comparte con el template.
2. En `package.json`, `dev:down:runner` con `--env-file .env` (como
   `dev:runner`).
3. Las variables `RUNNER_*` en `.env.example` (sin valores reales; ninguna es
   secreta).
4. Registrar `local-ci-runners` en `template-adoption.json`.

## estudio-contable-automation

- Proyecto Compose: `estudio-contable-automation-runner-dev`; se conserva.
- El volumen `platform-runner-pnpm-store` ya existe en la máquina (lo creó el
  template): el primer CI del producto solo descarga lo que el template no
  tenga.
- Con los dos repos en la misma máquina, conviene arrancar con
  `RUNNER_REPLICAS=2` en el `.env` del producto si hay varios agentes
  trabajando a la vez (ver criterios en `docs/deployment.md`).

## Recrear los runners sin cortar jobs

Recrear corta cualquier job en curso. Antes de `pnpm dev:runner`:

```bash
gh api repos/Agenmatica/estudio-contable-automation/actions/runners \
  -q '.runners[] | select(.status=="online") | "\(.name) busy=\(.busy)"'
```

Solo si ninguno dice `busy=true`, correr `pnpm dev:runner`. Tocar únicamente
el proyecto Compose del producto: nunca bajar ni recrear los runners de otro
repo desde este.

## Validar la adopción

1. `pnpm infra:config` pasa.
2. `docker exec estudio-contable-automation-runner-dev-runner-1 sh -c 'env | grep ^pnpm_config_'`
   muestra `store_dir=/pnpm/store`, `cache_dir=/pnpm/cache`,
   `network_concurrency=16`, `fetch_retries=5` y `fetch_timeout=600000`;
   `docker inspect … --format '{{.HostConfig.Memory}}'` muestra el tope.
3. En el CI del PR de adopción, el log de `pnpm install --frozen-lockfile`
   (`Progress: resolved N, reused R, downloaded D`) muestra `downloaded` bajo
   en la primera corrida y `downloaded 0` al re-ejecutarla.

## `buildx` y `docker scout` en la imagen del runner (2026-10-05)

`infra/runner/Dockerfile` no traía ni `docker-buildx-plugin` ni `docker
scout` — `worker-images.yml` exige ambos (`docker buildx build
--provenance=true --sbom=true` y `docker scout version` para bloquear
vulnerabilidades) y fallaba sin ellos. Encontrado en un fork de producto
al intentar republicar imágenes de workers. `docker-buildx-plugin` se
instala por apt (repo oficial de Docker, ya configurado en este
Dockerfile); `docker scout` no tiene paquete apt oficial y su
instalador (`curl | sh`, sin `set -e`) no deja el binario instalado de
forma confiable durante un `docker build` sin que el build se entere
del fallo — se usa un tarball pineado por versión (`SCOUT_VERSION`),
mismo criterio que ya usa este Dockerfile para `actions-runner`.

**`docker scout cves --format json` ya no existe (2026-10-05)**: con el
runner ya con `scout` instalado, el escaneo en sí falló — `--format
json` no es un valor válido en `docker scout` v1.26.0 (imprime la
ayuda del comando en vez de un error claro, y ese texto rompía el
parseo de `scripts/validar-scan-worker.mjs`). El gate de
vulnerabilidades nunca evaluó nada de verdad hasta ahora. Reemplazado
por `--format gitlab` (JSON real, esquema de GitLab Container
Scanning) y ajustado el validador: compara `severity` sin distinguir
mayúsculas (gitlab usa "Title Case") y prioriza el `cve` sobre el `id`
interno (un hash) del reporte al matchear excepciones.

**`docker scout` también exige sesión de Docker Hub (2026-10-05)**: con
`--format gitlab` ya resuelto, la primera corrida real devolvió un
reporte vacío (`SyntaxError: Unexpected end of JSON input`) — scout
imprimía "Log in with your Docker ID or email address to use docker
scout." en vez de un reporte. El login a `ghcr.io` que ya hace el job
no alcanza: scout necesita su propia sesión contra Docker Hub. Se
agregó un `docker login` adicional con secrets nuevos
(`DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`, cuenta gratuita dedicada,
token de solo lectura) antes del escaneo.

## Reversión

Revertir el merge del PR de adopción y recrear los runners (verificando antes
que ninguno esté ocupado). El volumen compartido no se borra: lo sigue usando
el template. Para aislar el producto sin revertir, fijar
`RUNNER_PNPM_STORE_VOLUME` con otro nombre en su `.env` y recrear.
