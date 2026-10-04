# Research: Guarda de versiones únicas de migraciones

## Evidencia del producto derivado

Repo `estudio-contable-automation` (Nexo Contable), rama `main`:

- Bug `.specify/bugs/migraciones-version-duplicada/` (`assessment.md`,
  `fix.md`, `test.md`): `main` en `bfb5818` tenía dos pares de migraciones con
  la misma versión (`20261003230000` mcp_servidor_ia/rag_busqueda_documental y
  `20261003231500` chat_ia_capacidades_rpc/mcp_ejecucion), entrados con los
  PRs #15, #16 y #17, desarrollados en paralelo. `supabase migration up` se
  negó a correr; el CI quedó verde porque `scripts/reset-db-ci.mjs` aplica
  los archivos con `psql` en orden alfabético.
- Arreglo: PR #26 (`corregir-migraciones-version-duplicada`), merge
  `5af4508`, commits `7700653` (renombre + guarda) y `d890a74` (sacar la
  guarda de `reset-db-ci.mjs`). Archivos:
  `scripts/verificar-versiones-migraciones.mjs`,
  `scripts/verificar-versiones-migraciones.test.mjs` (4 casos), script
  `migrations:check` en `package.json`, paso `pnpm migrations:check` en el job
  `application` de `.github/workflows/validate.yml`.
- `fix.md`, "Deviations from Assessment": la guarda no se llamó desde
  `scripts/reset-db-ci.mjs` porque ese archivo pertenece a las capacidades
  adoptadas `portable-typescript-tooling` e `isolated-ci-database`, y tocarlo
  exigía subir sus versiones sin un cambio del template que lo respalde
  (`template:capabilities:check`). Queda para este port-back.
- `docs/wiki/portback-template.md`, sección "Candidato: guarda de versiones
  de migración únicas" (rama `normalizar-esquema-supabase`, commit `80407ad`).

## Estado del template

- `scripts/reset-db-ci.mjs` hace lo mismo que en el producto: lista
  `supabase/migrations/*.sql`, ordena y aplica con `psql`. Mismo punto ciego.
- `.github/workflows/validate.yml`, job `application`: no tiene la guarda.
  `test:tooling` existe en `package.json` pero el CI no lo corre.

## Decisión 1: traer el código tal cual

**Decision**: copiar `verificar-versiones-migraciones.mjs` y su test del
producto, y reescribir solo los comentarios que nombran PRs del producto.

**Rationale**: está probado en el producto (4/4 tests, guarda verde contra
su árbol). Mantenerlo idéntico hace que la adopción de vuelta sea un no-op.

## Decisión 2: llamar a la guarda desde el reset, importándola

**Decision**: `scripts/reset-db-ci.mjs` importa `verificarVersionesMigraciones`
y aborta con el mismo mensaje antes de `verificarDestinoCiActual()` y antes de
cualquier `psql`.

**Rationale**: FR-005 pide la misma guarda, no una copia, y que falle antes
de tocar la base. Ponerla primero también evita levantar conexiones en vano.

**Alternatives considered**: solo el paso del workflow (lo que hizo el
producto): no cubre a quien corre el reset a mano ni a un workflow futuro.

## Decisión 3: capacidad nueva y versiones

**Decision**: capacidad nueva `migration-version-guard` 1.0.0 con la guarda y
su test. `isolated-ci-database` y `portable-typescript-tooling` suben de
versión menor por el cambio de `scripts/reset-db-ci.mjs`.

**Rationale**: la guarda es útil sin la base aislada del CI (un producto
puede usarla con otro CI), así que no se mete dentro de
`isolated-ci-database`.

## Decisión 4: dónde corre el test de la guarda

**Decision**: un paso explícito `node --test
scripts/verificar-versiones-migraciones.test.mjs` y `pnpm migrations:check` en
el job `application`, antes de `lint`/`build`. También se suma el test a
`test:tooling`.

**Rationale**: el template no corre `test:tooling` en el CI; sumarlo entero
excede el alcance.

## Cómo vuelve al producto

1. El producto ya tiene la guarda y su test idénticos: no copia nada de eso.
   Trae solo el cambio de `scripts/reset-db-ci.mjs`.
2. En `template-adoption.json`: registra `migration-version-guard` 1.0.0
   como `adopted` (evidencia: su PR #26, origen del port-back) y sube
   `isolated-ci-database` y `portable-typescript-tooling` a las versiones
   nuevas del template, con la evidencia de la corrida del reset.
3. Log en `docs/wiki/sistemas/sincronizacion-template.md` y candidato marcado
   como "llevado" en `docs/wiki/portback-template.md`.

No es un `git merge upstream/main`: ese merge solo aplica a
`docs/roadmap-template.md`.
