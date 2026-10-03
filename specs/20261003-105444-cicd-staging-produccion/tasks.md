# Tasks: CI/CD staging → producción para migraciones, VPS, flows y dashboards

**Input**: Design documents from `specs/20261003-105444-cicd-staging-produccion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (todos presentes)

**Tests**: Se incluyen tareas de test porque el repo ya tiene la convención establecida de un `.test.mjs` junto a cada script nuevo (`desplegar-flow.test.mjs`, `supabase-ci.test.mjs`) corrido con `node --test`; no es TDD estricto, pero las tareas de test preceden a la tarea de implementación de cada script nuevo.

**Organization**: Una fase por historia de usuario de `spec.md` (P1–P4), en orden de prioridad. Cada fase es un incremento independiente — se puede implementar, probar y entregar por separado, con `/clear` entre fases (CLAUDE.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede correr en paralelo (archivos distintos, sin depender de una tarea sin terminar)
- **[Story]**: A qué historia de usuario pertenece (US1–US4)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dejar la documentación base lista antes de que cada historia agregue su propia sección — evita que la primera historia en implementarse tenga que crear el archivo desde cero.

- [X] T001 Crear `docs/adoptar-cicd-staging-produccion.md` con la estructura de secciones (una por mecanismo: migraciones, deploy de infraestructura del VPS, publicación de flows, import de dashboards) y el listado de los 6 GitHub Environments a crear manualmente (`migraciones-cloud-staging`/`-production`, `deploy-infraestructura-vps-staging`/`-production`, `publicar-flows-kestra-staging`/`-production`), señalando que el required reviewers de cada `*-production` se configura a mano en GitHub (no es expresable en YAML)

**Checkpoint**: Documentación base lista — cada historia de usuario puede completar su propia sección sin pisar a las demás.

---

## Phase 2: User Story 1 - Migrar bases de datos cloud sin pasos manuales (Priority: P1) 🎯 MVP

**Goal**: Que una migración nueva en `supabase/migrations` se aplique sola contra Supabase cloud de staging, y que promoverla a producción sea un click de aprobación en GitHub Actions.

**Independent Test**: Agregar una migración de prueba, pushear, y verificar que se aplique contra staging sin intervención y que producción quede pausada hasta aprobación (Escenario 1 de `quickstart.md`).

### Tests for User Story 1

- [ ] T002 [P] [US1] Escribir `scripts/migrar-supabase-cloud.test.mjs` que verifique: rechaza un `--entorno` que no sea `staging`/`production` antes de tocar la red, y falla con un mensaje que nombra `SUPABASE_DB_URL` cuando falta (contrato en `contracts/cli-migrar-supabase-cloud.md`)

### Implementation for User Story 1

- [ ] T003 [US1] Implementar `scripts/migrar-supabase-cloud.mjs`: valida `--entorno`, usa `requireEnvironment('SUPABASE_DB_URL')` de `scripts/operaciones.mjs`, ejecuta `supabase db push --db-url "$SUPABASE_DB_URL"` vía `run()`, y agrega `SUPABASE_DB_URL` a la lista de valores redactados en `redactError` (depende de T002)
- [ ] T004 [P] [US1] Agregar el script `db:migrar:cloud` en `package.json` apuntando a `node scripts/migrar-supabase-cloud.mjs`
- [ ] T005 [US1] Crear `.github/workflows/migraciones-cloud.yml` con los jobs `staging`/`production` según `contracts/workflow-gate.md`, disparado por `push` a `supabase/migrations/**`, cada job invocando `pnpm db:migrar:cloud -- <entorno>` con el secret `SUPABASE_DB_URL` del Environment correspondiente (depende de T003, T004)
- [ ] T006 [P] [US1] Agregar la entrada `SUPABASE_DB_URL=` (sin valor) a `.env.example`, con un comentario que explique que es por-entorno y vive como secret del GitHub Environment, no en este archivo
- [ ] T007 [US1] Agregar la capacidad `cloud-migrations-gate` a `template-capabilities.json` (paths: `scripts/migrar-supabase-cloud.mjs`, `scripts/migrar-supabase-cloud.test.mjs`, `.github/workflows/migraciones-cloud.yml`)
- [ ] T008 [US1] Completar la sección "Migraciones" de `docs/adoptar-cicd-staging-produccion.md` y actualizar `docs/deployment.md` (sección "CI") para reflejar que las migraciones cloud ya no son un paso manual

**Checkpoint**: User Story 1 funcional y verificable de forma independiente — ejecutar Escenario 1 de `quickstart.md`.

---

## Phase 3: User Story 2 - Desplegar infraestructura del VPS sin SSH manual (Priority: P2)

**Goal**: Que un cambio en `infra/<producto>/` dispare el deploy contra el VPS de staging sin SSH manual, y que producción quede gateada por aprobación.

**Independent Test**: Modificar `infra/kestra/compose.yaml`, pushear, y verificar que el job de staging corra `deploy-vps.mjs` contra el VPS sin intervención SSH manual, y que producción quede pausada (Escenario 2 de `quickstart.md`).

### Implementation for User Story 2

- [ ] T009 [P] [US2] Agregar `openssh-client` a `infra/runner/Dockerfile` (requerido para que el runner controle `DOCKER_HOST=ssh://...`; ver `research.md` §1 y `contracts/cli-deploy-vps-ci.md`)
- [ ] T010 [US2] Crear `.github/workflows/deploy-infraestructura-vps.yml` con los jobs `staging`/`production` según `contracts/workflow-gate.md` y `contracts/cli-deploy-vps-ci.md`: decodifica el secret `VPS_SSH_PRIVATE_KEY` a un archivo temporal (permisos 600), exporta `DOCKER_HOST=ssh://<usuario>@<host>`, sintetiza `.env.<entorno>` en el workspace del job desde los demás secrets del Environment, invoca `pnpm deploy:vps -- <entorno>`, disparado por `push` a los `paths` listados en `contracts/workflow-gate.md` (depende de T009)
- [ ] T011 [P] [US2] Agregar las claves `VPS_SSH_PRIVATE_KEY=`, `VPS_SSH_USER=`, `VPS_SSH_HOST=` (sin valores) a `.env.example`, documentando que las demás claves que hoy viven en `.env.<entorno>` del VPS (Kestra, Superset, Nango) pasan a ser secrets del mismo Environment
- [ ] T012 [US2] Agregar la capacidad `vps-deploy-gate` a `template-capabilities.json` (paths: `.github/workflows/deploy-infraestructura-vps.yml`, `infra/runner/Dockerfile`)
- [ ] T013 [US2] Completar la sección "Deploy de infraestructura del VPS" de `docs/adoptar-cicd-staging-produccion.md` y actualizar `docs/deployment.md` para reflejar que el deploy a VPS ya no requiere SSH manual ni `.env.<entorno>` persistente

**Checkpoint**: User Stories 1 y 2 funcionan de forma independiente — ejecutar Escenario 2 de `quickstart.md`.

---

## Phase 4: User Story 3 - Publicar flows del orquestador dentro del mismo pipeline (Priority: P3)

**Goal**: Que un cambio en un flow de Kestra se publique solo contra el Kestra de staging, con el mismo gate hacia producción.

**Independent Test**: Modificar un flow bajo `infra/kestra/flows/`, pushear, y verificar que se publique contra el Kestra de staging sin correr el script a mano (Escenario 3 de `quickstart.md`).

### Implementation for User Story 3

- [ ] T014 [US3] Crear `.github/workflows/publicar-flows-kestra.yml` con los jobs `staging`/`production` según `contracts/workflow-gate.md`, disparado por `push` a `infra/kestra/flows/**`, cada job invocando `node infra/kestra/desplegar-flow.mjs` (sin cambios de código) con `KESTRA_BASIC_AUTH_USERNAME`/`PASSWORD` y `--kestra-url` del Environment correspondiente
- [ ] T015 [P] [US3] Agregar las claves `KESTRA_BASIC_AUTH_USERNAME=`/`KESTRA_BASIC_AUTH_PASSWORD=` por entorno (sin valores, si no existían ya) a `.env.example`, aclarando que ahora también viven como secrets de los Environments `publicar-flows-kestra-*`
- [ ] T016 [US3] Incrementar la versión de la capacidad `safe-kestra-flow-publication` en `template-capabilities.json` y agregar `.github/workflows/publicar-flows-kestra.yml` a sus `paths`
- [ ] T017 [US3] Completar la sección "Publicación de flows" de `docs/adoptar-cicd-staging-produccion.md` y actualizar `docs/deployment.md` para reflejar que la publicación de flows ya no es un paso manual

**Checkpoint**: User Stories 1, 2 y 3 funcionan de forma independiente — ejecutar Escenario 3 de `quickstart.md`.

---

## Phase 5: User Story 4 - Dejar listo el mecanismo de import de dashboards de Superset (Priority: P4)

**Goal**: Un mecanismo genérico invocable manualmente para importar un paquete de dashboard de Superset contra un entorno, sin wiring automático todavía.

**Independent Test**: Invocar el script contra un paquete de prueba y una instancia de Superset de staging, y confirmar que ningún workflow automático se dispara por esto (Escenario 4 de `quickstart.md`).

### Tests for User Story 4

- [ ] T018 [P] [US4] Escribir `infra/superset/importar-dashboards.test.mjs` que verifique: rechaza `--source` inexistente antes de autenticar contra Superset, y falla con un mensaje que nombra la variable cuando falta `SUPERSET_URL`/`SUPERSET_USERNAME`/`SUPERSET_PASSWORD` (contrato en `contracts/cli-importar-dashboards-superset.md`)

### Implementation for User Story 4

- [ ] T019 [US4] Implementar `infra/superset/importar-dashboards.mjs`: valida `--source` y `--entorno`, resuelve `SUPERSET_URL`/`SUPERSET_USERNAME`/`SUPERSET_PASSWORD` del entorno, autentica contra la API de Superset, hace `POST` del paquete al endpoint de import, redacta credenciales en cualquier error (depende de T018)
- [ ] T020 [P] [US4] Agregar las claves `SUPERSET_URL=`, `SUPERSET_USERNAME=`, `SUPERSET_PASSWORD=` (sin valores) a `.env.example`
- [ ] T021 [US4] Agregar la capacidad `superset-dashboard-import` a `template-capabilities.json` (paths: `infra/superset/importar-dashboards.mjs`, `infra/superset/importar-dashboards.test.mjs`)
- [ ] T022 [US4] Completar la sección "Import de dashboards de Superset" de `docs/adoptar-cicd-staging-produccion.md`, aclarando explícitamente que no tiene wiring automático a ningún workflow mientras no exista un paquete de dashboard versionado (FR-011)

**Checkpoint**: Las cuatro historias de usuario funcionan de forma independiente — ejecutar Escenario 4 de `quickstart.md`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación transversal una vez que las historias que se vayan a entregar en esta ronda estén completas.

- [ ] T023 Correr `pnpm docs:check` y resolver cualquier gap entre código y documentación antes de cerrar el PR
- [ ] T024 [P] Revisar los tres workflows nuevos en busca de cualquier `echo`/log que pueda exponer un secret en texto plano (migraciones, deploy VPS, publicación de flows)
- [ ] T025 Ejecutar los cuatro escenarios de `quickstart.md` contra un entorno de prueba real (o el más cercano disponible) y registrar el resultado en la spec (nota de desvío con referencia a commit si algo no salió como estaba planeado, por CLAUDE.md)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede arrancar de inmediato
- **User Story 1 (Phase 2)**: depende solo de Setup — es el MVP
- **User Story 2 (Phase 3)**: depende solo de Setup — independiente de US1 (puede implementarse en paralelo si hay capacidad)
- **User Story 3 (Phase 4)**: depende solo de Setup — independiente de US1/US2
- **User Story 4 (Phase 5)**: depende solo de Setup — independiente de las otras tres
- **Polish (Phase 6)**: depende de que las historias que se vayan a entregar en esta ronda estén completas

No hay fase "Foundational" bloqueante: a diferencia de un proyecto con modelo de datos compartido, las cuatro historias son cuatro mecanismos de CI independientes que solo comparten la forma del gate (documentada en `contracts/workflow-gate.md`, no código compartido que haya que construir primero).

### Within Each User Story

- Test antes de implementación (T002→T003, T018→T019)
- Script/implementación antes del workflow que lo invoca (T003→T005, T009→T010)
- `.env.example` y catálogo de capacidades pueden ir en paralelo a la implementación una vez que el nombre de las claves/paths está decidido (ya lo está, por los contratos)

### Parallel Opportunities

- T002, T004, T006 (US1) tocan archivos distintos y pueden correr en paralelo entre sí (no con T003, que depende de T002)
- T009, T011 (US2) en paralelo
- T015 (US3) no depende de T014 para empezar, pero conviene secuenciarlo para no pisar `.env.example` a la vez que otra historia
- Las fases 2 a 5 (una por historia) pueden implementarse en paralelo por completo si hay más de un agente/operador disponible — ninguna historia depende del código de otra

---

## Parallel Example: User Story 1

```bash
# En paralelo, una vez terminado Setup:
Task: "Escribir scripts/migrar-supabase-cloud.test.mjs (T002)"
Task: "Agregar SUPABASE_DB_URL= a .env.example (T006)"

# Secuencial después de T002:
Task: "Implementar scripts/migrar-supabase-cloud.mjs (T003)"
Task: "Crear .github/workflows/migraciones-cloud.yml (T005, tras T003+T004)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Phase 1 (Setup)
2. Completar Phase 2 (User Story 1 — migraciones)
3. **Detener y validar**: correr Escenario 1 de `quickstart.md`
4. Abrir PR/entregar si ya es suficiente valor por sí solo

### Incremental Delivery

Dado que `CLAUDE.md` pide invocar `/speckit-implement` fase por fase (o historia por historia) con `/clear` entre una y la siguiente, no la spec completa en una sola corrida:

1. Setup → Foundación lista (no hay fase Foundational separada en esta spec)
2. User Story 1 (migraciones) → validar → esto ya es el MVP
3. `/clear` → User Story 2 (deploy VPS) → validar
4. `/clear` → User Story 3 (publicación de flows) → validar
5. `/clear` → User Story 4 (import de dashboards) → validar
6. `/clear` → Polish

Cada historia agrega valor sin romper a las anteriores — ninguna depende del código de otra.

---

## Notes

- `[P]` = archivos distintos, sin dependencias entre sí
- La etiqueta de historia (`[US1]`–`[US4]`) mapea cada tarea a su historia para trazabilidad
- Verificar que los tests fallen antes de implementar (T002 antes de T003; T018 antes de T019)
- Commitear tras cada tarea o grupo lógico, consistente con el resto del pipeline de esta spec
- Detenerse en cada Checkpoint para validar la historia de forma independiente antes de seguir
