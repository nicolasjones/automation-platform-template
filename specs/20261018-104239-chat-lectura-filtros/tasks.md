# Tasks: Lectura del chat companion con descubrimiento de fuentes y filtros

**Input**: Design documents from `/specs/20261018-104239-chat-lectura-filtros/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tool-leer.md, quickstart.md

**Tests**: la spec los pide explícitamente (FR/SC verificables): pgTAP para el mecanismo SQL y `node --test` para la lógica pura de la Edge Function.

## Phase 1: Setup

- [x] T001 [P] Agregar el script `test:edge` en `package.json` (`node --test supabase/functions/chat-ia-responder/*.test.ts`) y encadenarlo dentro de `test`.
- [x] T002 [P] Correr `pnpm test:edge` en `.github/workflows/validate.yml` (job de validación), junto a los demás `test:*` (research.md R7: hoy la lógica pura de las Edge Functions no corre en CI).

**Checkpoint**: el arnés de tests existe y falla/vacío es visible en CI.

---

## Phase 2: Foundational — migración del mecanismo (bloquea todas las historias)

**Propósito**: los RPCs de descubrimiento (con columnas) y de alta por convención, y la habilitación de agregaciones del motor de lectura. Sin esto, ni US1 ni US3 funcionan.

- [x] T003 Crear `supabase/migrations/<timestamp>_chat_lectura_filtros.sql` con: `private/public.chat_fuentes_disponibles()` devolviendo `(vista, descripcion, feature_id, columnas text[])` (columnas derivadas de `information_schema.columns` por `ordinal_position`), `private/public.registrar_fuente_chat_ia(text, text, text)` (upsert idempotente + `capacidades_chat_ia.lectura = true`, validación de forma `tabla`/`esquema.tabla` y de funcionalidad existente), `alter role authenticator set pgrst.db_aggregates_enabled = 'true'; notify pgrst, 'reload config';`, `revoke`/`grant execute` acordes, comentarios y **reversión al pie del archivo** (contracts/tool-leer.md §3 y §4).
- [x] T004 Crear `supabase/tests/database/chat_lectura_fuentes.test.sql` (pgTAP) verificando: descubrimiento devuelve la fuente con sus columnas en orden; fuente no legible, capacidad `lectura = false` y funcionalidad no habilitada para la organización quedan fuera; `vista` inexistente devuelve `columnas` vacío; `registrar_fuente_chat_ia` es idempotente, exige superadmin y rechaza vista inválida y funcionalidad inexistente; `pgrst.db_aggregates_enabled` figura en `pg_roles.rolconfig` para `authenticator`; `execute` de los wrappers públicos solo para `authenticated`; aislamiento entre dos organizaciones.
- [x] T005 Aplicar la migración al stack local y correr `pnpm test:db`: verificar que T004 falla sin la migración y pasa con ella.

**Checkpoint**: los RPCs y el setting están probados en base real. Ninguna historia puede empezar antes de esto.

---

## Phase 3: User Story 1 — El modelo sabe exactamente qué puede consultar (P1)

**Goal**: el chat descubre las fuentes legibles del usuario, le inyecta el catálogo (con columnas) al modelo y distingue los desenlaces de negación.

**Independent Test**: con una fuente legible y otra no legible, el chat usa el nombre exacto de la vista registrada para la primera y responde que no tiene acceso a la segunda (quickstart §2 y §4.4).

- [x] T006 [P] [US1] Crear `supabase/functions/chat-ia-responder/catalogo.ts` (paridad del producto de origen): `listarFuentes` (vista + descripción + columnas), `construirDescripcionLeer` (catálogo dentro de la descripción del tool), `construirSystemPrompt` (rol + catálogo + reglas de negación, con el prompt base configurable por producto, sin identidad hardcodeada) y `mensajeSinRespuesta`.
- [x] T007 [P] [US1] Crear `supabase/functions/chat-ia-responder/catalogo.test.ts` (`node --test`): sin fuentes, con una fuente, con varias, con descripción vacía, con columnas; reglas de negación presentes; prompt base inyectado.
- [x] T008 [US1] Modificar `supabase/functions/chat-ia-responder/index.ts`: llamar `asUser.rpc('chat_fuentes_disponibles')` en cada invocación, usar `construirDescripcionLeer` en la descripción del tool `leer`, `construirSystemPrompt` en la instrucción de sistema, y `mensajeSinRespuesta` cuando el modelo no devuelve texto. Nunca tomar el catálogo del cliente ni de los datos de entrada.
- [x] T009 [US1] Verificar US1 con el quickstart (§2 y §4): catálogo correcto, negación correcta, sin filas de otra organización.

**Checkpoint**: US1 funciona sola; US2 y US3 ya tienen catálogo sobre el que operar.

---

## Phase 4: User Story 2 — Rango, orden y límite sin perder la consulta (P2)

**Goal**: el tool acepta rango, orden y límite validados contra la metadata de la fuente, y un criterio inválido no pierde la respuesta.

**Independent Test**: contra una fuente de prueba, pedir un rango con orden y límite y verificar filas exactas; pedir una columna inexistente y verificar que el criterio se descarta en vez de fallar la consulta (quickstart §4.1 y §4.3).

- [x] T010 [P] [US2] Crear `supabase/functions/chat-ia-responder/consulta.ts`: tipos del plan de consulta y validación pura — columnas contra metadata, `rango`, `orden` (dirección normalizada), `limite` (default 50, tope 1000), `criteriosDescartados`, resolución de `esquema.tabla` y armado del descriptor de consulta (data-model.md).
- [x] T011 [P] [US2] Crear `supabase/functions/chat-ia-responder/consulta.test.ts` (`node --test`): cada regla de validación, incluidos límite inválido/negativo/desmesurado, dirección desconocida, rango con un solo extremo, vista con y sin esquema, y criterios descartados.
- [x] T012 [US2] Modificar `supabase/functions/chat-ia-responder/index.ts`: `leer` arma la consulta con `consulta.ts`, aplica igualdad + rango + orden + límite, resuelve la vista en su esquema (`asUser.schema(esquema)`), mantiene el reintento acotado como red de seguridad ante valor inválido y devuelve los tres desenlaces distinguibles (`FUENTE_NO_DISPONIBLE`, filas vacías, `ERROR_AL_LEER`) junto con `criteriosDescartados`.

**Checkpoint**: US2 funciona sola sobre US1.

---

## Phase 5: User Story 3 — Totales sin traer todas las filas (P2)

**Goal**: el tool puede devolver agregaciones de una columna con los filtros del período, en una sola consulta.

**Independent Test**: contra una fuente con más filas que el tope, pedir suma y cantidad de un período y comparar con el cálculo directo (quickstart §3 y §4.2).

- [x] T013 [US3] Extender `supabase/functions/chat-ia-responder/consulta.ts`: armado de la expresión de agregados (`alias:columna.operacion()`) con alias saneado, operaciones soportadas (`suma`/`cantidad`/`promedio`/`minimo`/`maximo`), y regla de que con agregados no aplican orden ni límite.
- [x] T014 [US3] Extender `supabase/functions/chat-ia-responder/consulta.test.ts` con los casos de agregados (alias inválido saneado, operación no soportada descartada, columna inexistente descartada, varios alias).
- [x] T015 [US3] Modificar `supabase/functions/chat-ia-responder/index.ts`: ejecutar la consulta agregada y devolver `{ agregados }` (una fila de totales), sin filas individuales.
- [x] T016 [US3] Verificar la habilitación real contra PostgREST local (quickstart §3): la consulta con `sum()` devuelve el total y **no** responde `PGRST123`.

**Checkpoint**: las tres historias funcionan; los totales no dependen del tope de filas.

---

## Phase 6: Cierre y documentación

- [x] T017 Actualizar las capacidades del template: `chat-companion-mechanism` `1.0.1` → `1.1.0` en `template-capabilities.json` (y los `paths` si la implementación agrega archivos nuevos: `consulta.ts`, `consulta.test.ts`, `catalogo.ts`, `catalogo.test.ts`).
- [x] T018 Actualizar la documentación de plataforma del mecanismo (contrato de la herramienta de lectura, habilitación de agregaciones en PostgREST y su reversión) en `docs/`; correr `pnpm docs:check`.
- [x] T019 Correr y dejar verdes: `pnpm lint`, `pnpm build`, `pnpm test:edge`, `pnpm test:db`, `pnpm template:capabilities:check`, `pnpm docs:check`.
- [x] T020 Anotar en `tasks.md` las notas de desvío (cortas, con `ver commit <hash>`).
- [x] T021 Cerrar: merge del PR con `--no-ff` (nunca squash ni rebase), conservar la rama hasta confirmar que el cierre quedó estable, y actualizar la fila correspondiente en `docs/roadmap-template.md` si aplica.

**Checkpoint**: spec cerrada en `main` del template; el producto derivado puede traerla con `git merge upstream/main`.

**Cierre**: merge del PR #44 en `main` con merge commit `fb835c5` (rama `20261018-104239-chat-lectura-filtros` conservada); fila "Lectura gobernada de datos por el chat companion" agregada a `docs/roadmap-template.md` y nota del puerto publicado del stack de CI en `docs/ci-self-hosted-storage.md` (mismo commit de cierre).

---

## Notas de desvío

- T004: el archivo de pgTAP quedó como `supabase/tests/database/chat_lectura_filtros.test.sql` (no `chat_lectura_fuentes.test.sql`), con `plan(28)`: cubre los tres alcances de la spec y agrega el alta por convención con vista sin esquema y el `revoke` de `anon` (ver commit `0206e00`).
- T003: `chat_fuentes_disponibles()` cambia de 3 a 4 columnas de retorno, así que la migración hace `drop function if exists public.chat_fuentes_disponibles();` antes de `create`. Es el único cambio no aditivo, permitido por `scripts/validar-migraciones-aditivas.mjs` (solo flaguea tablas/columnas), y la reversión al pie del archivo la restituye en su forma de 3 columnas (ver commit `0206e00`).
- T013: `limite` con agregados se anula en vez de forzarse a 1 — el contrato exigía una sola fila de totales y `limit=1` era arbitrario (ver commit `0206e00`).
- T006: `construirSystemPrompt(fuentes, promptBase)` recibe el prompt base por parámetro (el producto de origen lo lee de `CHAT_COMPANION_SYSTEM_PROMPT`) para no hardcodear identidad ni catálogo (ver commit `0206e00`).
- T016: verificado contra el PostgREST real del stack local con una vista efímera de prueba (borrada después). `select=total_debe:debe.sum()&empresa=eq.acme` → `[{"total_debe":150.50}]`; `fecha=gte.…&fecha=lte.…&order=fecha.desc&limit=2` → 2 filas en orden descendente; con `alter role authenticator reset pgrst.db_aggregates_enabled` la misma consulta responde `PGRST123 "Use of aggregate functions is not allowed"` y vuelve a funcionar al reaplicar el bloque → la migración es lo que habilita las agregaciones.
- T019: `pnpm lint` (solo warnings previos), `pnpm build`, `pnpm test:edge` (45/45), `pnpm test:db` sobre la dev de este clon (`supabase_db_automation-platform-template-supabase-de`), `pnpm template:adoption:check --check`, `pnpm template:capabilities:check --base origin/main` y `pnpm docs:check`: todo verde salvo **un fallo ajeno** en `perfil_usuario.test.sql` test 11 (`ON CONFLICT (bucket_id, name)` sobre `storage.objects`: drift de metadata del stack de Storage local, 26 archivos/654 tests, 1 fallo). El gate real es el job `database` de CI sobre base limpia.
- El stack local del template se migró con `docker exec … psql` y no con `supabase migration up --local` (el historial de migraciones de la dev está atrasado respecto de las aplicadas a mano); el `db:reset:ci` de CI vuelve a aplicar todo desde cero y es la verificación autoritativa.

---

## Dependencies & Execution Order

- **Setup (Fase 1)**: sin dependencias.
- **Foundational (Fase 2)**: depende de Setup. **Bloquea US1, US2 y US3** (T004/T005 prueban T003).
- **US1 (Fase 3)**: depende de Fase 2. T006/T007 en paralelo; T008 depende de T006.
- **US2 (Fase 4)**: depende de Fase 2 y de US1 (el catálogo con columnas es la entrada de la validación). T010/T011 en paralelo; T012 depende de T010 y de T008.
- **US3 (Fase 5)**: depende de US2 (reusa el plan de consulta). T013 → T014 → T015; T016 depende de T003 (setting) y de T015.
- **Cierre (Fase 6)**: depende de todas.

## Implementation Strategy

MVP = Fase 1 + Fase 2 + US1 (el template deja de estar ciego: descubre fuentes y sabe negar bien). US2 y US3 se entregan después, cada una con su checkpoint. El PR es el gate de CI desde el primer commit de implementación.
