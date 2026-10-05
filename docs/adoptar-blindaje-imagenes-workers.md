# Adoptar el blindaje de imágenes de workers en un producto derivado

Guía de proceso para traer la capacidad de la spec 017 a un producto que ya
tiene workers propios en producción — el caso más probable, ya que esta
spec nació de generalizar exactamente esa situación real. Contrato técnico:
`specs/017-blindaje-imagenes-workers/contracts/{worker-image,worker-runtime}.md`.

## 0. Prerrequisitos

El producto conserva la convención de workers de `workers/README.md` (spec
012): un worker por sistema externo, contrato de entrada/salida, marcador
`CREDENCIAL_INVALIDA:<conexion_id>`. Si el fork ya tiene workers reales
publicándose por su cuenta, van a colisionar varios archivos — no es un
error, es lo esperado; resolverlo es el resto de esta guía.

## 1. Comparar antes de migrar

En el fork, relevar antes de mergear `git merge upstream/main`:

- ¿Hay un `Dockerfile` por worker (`workers/<nombre>/Dockerfile`), o ya uno
  único parametrizado por `ARG WORKER`? Si es por worker, esta spec los
  reemplaza a todos por `workers/Dockerfile` — mapear qué tenía cada uno de
  distinto (base image, pasos de build) antes de borrarlos.
- ¿El workflow de CI (`.github/workflows/worker-images.yml`) ya escanea
  vulnerabilidades y firma SBOM/provenance, o solo hace `docker build` +
  `push`? Si es lo segundo, el de esta spec lo reemplaza entero.
- ¿`workers/egress-allowlists.json` ya existe con dominios reales? La
  versión de esta spec trae `workers: {}` vacío — el fork **no debe perder
  sus entradas reales** al mergear (ver regla de reconciliación abajo).
- ¿`.github/worker-vulnerability-exceptions.json` ya tiene excepciones
  reales vigentes? Mismo cuidado que la allowlist.

## 2. Migrar

1. Los siguientes archivos deberían traerse **sin conflicto** si el fork no
   los tenía todavía, o **idénticos** si ya adoptó esta misma spec de otra
   fuente: `workers/CONTRATO.md`, `scripts/descubrir-workers.mjs` (+ test),
   `scripts/smoke-imagenes-workers.mjs`, `scripts/validar-auditoria-workers.mjs`,
   `scripts/validar-idempotencia-workers.mjs`, `infra/kestra/validar-workers-runtime.mjs`,
   `infra/kestra/fixtures/worker-runtime/`.
2. `scripts/validar-egress-workers.mjs` y `scripts/validar-scan-worker.mjs`
   leen su configuración de `workers/egress-allowlists.json` y
   `.github/worker-vulnerability-exceptions.json` respectivamente — no
   tienen nombres de sistema hardcodeados. Si el fork tenía una versión
   anterior con nombres de proveedores hardcodeados dentro del script en
   vez de en el JSON, esa es la señal de que hay que migrar la
   configuración al JSON, no al revés.
3. Ejecutar `pnpm test:workers:discover`, `pnpm test:workers:scan`,
   `pnpm test:workers:idempotency`, `pnpm test:workers:audit` y, con al
   menos un worker real, `pnpm workers:discover`.

## 3. Reglas de reconciliación

Estos archivos casi seguro generan conflicto de "ambos lados agregaron el
mismo archivo con contenido distinto" si el fork ya tenía su propia versión
— resolución en cada caso:

- **`workers/Dockerfile`**: quedarse con el de la spec 017 (parametrizado
  por `ARG WORKER`); portar cualquier paso de build específico de un
  worker real como un `RUN` condicional o, si no aplica a todos, evaluar si
  ese worker necesita su propio stage — no bifurcar el Dockerfile único sin
  necesidad real.
- **`.github/workflows/worker-images.yml`**: quedarse con el de la spec
  017; si el fork ya tenía un `--build-arg` propio (por ejemplo, para
  parametrizar la URL del repositorio en el label OCI), volver a agregarlo
  sobre la versión nueva.
- **`workers/egress-allowlists.json`** y
  **`.github/worker-vulnerability-exceptions.json`**: **nunca** quedarse
  con la versión vacía de la spec 017 si el fork ya tenía entradas reales
  — fusionar a mano, el objeto `workers`/`exceptions` es aditivo por
  clave.
- **`infra/kestra/flows/plantilla-generico.yml` /
  `plantilla-dedicado.yml`**: estos SÍ tienen ancestro común (specs
  013/014) — si el fork ya aplicó el mismo endurecimiento de runtime
  (`--read-only`, `--cap-drop=ALL`, allowlist de red) de forma
  independiente, el merge debería resolver limpio solo si el contenido
  quedó idéntico; si el fork lo hizo distinto (otro orden de flags, otra
  variable de entorno), es un conflicto de contenido real a resolver a
  mano, no automático.

## `workflow_dispatch` en `worker-images.yml` (1.0.4, 2026-10-05)

El workflow solo corría con push a `main` sobre rutas de `workers/**` —
sin forma de reintentar la publicación sin un commit real a esas rutas.
Encontrado en un fork de producto: el runner se queda sin `buildx`
disponible en la ventana entre que se mergea un fix al Dockerfile del
runner (por ejemplo, agregar `docker-buildx-plugin`) y que la imagen
real del runner se reconstruye con ese cambio — las corridas por push
en esa ventana fallan con "BuildKit/buildx es obligatorio para
provenance y SBOM" y quedan sin forma de reintentar. Se agregó
`workflow_dispatch: {}` al trigger para poder republicar manualmente en
cuanto el runner tenga `buildx` disponible, sin depender de un cambio
real a `workers/**`.

## 4. Mapeo de este producto

_(Completar al adoptar: qué tenía este fork de distinto y cómo se
resolvió cada conflicto real.)_

- Dockerfiles por worker antes de esta spec: —
- Workflow de CI anterior (¿escaneaba vulnerabilidades?): —
- Entradas reales de `egress-allowlists.json`/`worker-vulnerability-exceptions.json`
  antes de mergear: —
- Diferencias encontradas en `plantilla-generico.yml`/`plantilla-dedicado.yml`
  y cómo se resolvieron: —
