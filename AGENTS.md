# Instrucciones para Codex

Este repositorio usa GitHub Spec Kit. Antes de implementar una funcionalidad,
revisa `.specify/memory/constitution.md` y los artefactos de la funcionalidad en
`specs/`. No inventes requisitos de negocio: conviértelos primero en una spec.

## Comandos de validación

- `pnpm lint`
- `pnpm build`
- `pnpm infra:config`
- `pnpm test` (requiere `pnpm dev:supabase` corriendo para los tests de base de datos)

## Reglas del proyecto

- Mantén el frontend en `apps/web` y los procesos aislados en `workers/`.
- Toda modificación de base de datos debe ser una migración en `supabase/migrations`.
- Activa RLS en toda tabla expuesta y nunca uses la service-role key en el navegador.
- No guardes secretos en Git; actualiza únicamente los archivos `.env.example`.
- Conserva desarrollo local reproducible y despliegues independientes por producto.
- Nunca uses un Compose raíz: cada producto tiene su archivo en `infra/<producto>/compose.yaml`.
- Toda spec debe declarar su alcance de entrega: `refine`, `supabase`, `kestra`, `superset` y/o `workers`.
- Para desarrollo Docker usa los comandos `dev:<producto>`; para Refine fuera de Docker usa `dev:refine:host`.
- Los commits siempre llevan título claro y en castellano; lo mismo para nombres de rama y slugs de specs de Spec Kit.
- Habilitar una capacidad o herramienta sin un caso de uso de negocio todavía (una extensión de Postgres, una imagen Docker) no necesita spec — la funcionalidad real que la use, sí.
- Lo que se entrega es código versionado en git. Evitá herramientas cuya licencia restrinja el uso comercial de lo que se opera como propio (por eso Kestra —Apache 2.0— en vez de n8n —Sustainable Use License—). Los dashboards de Superset se exportan a YAML y se commitean, nunca quedan solo en la UI.
- El CI corre en runners self-hosted (`infra/runner/`), no en `ubuntu-latest` — no lo cambies sin motivo, evita gasto de minutos de GitHub Actions.
- Toda spec nueva abre su Pull Request contra `main` al crear la rama, no al terminar — el PR no es revisión por pares (un solo agente opera el repo), es el gate de CI/Preview y el punto de reversión. El cierre es el merge de ese PR con merge commit (`--no-ff`), nunca squash ni rebase, para poder deshacer la spec completa con un único `git revert -m 1`; la rama no se borra al mergear hasta confirmar que el cierre quedó estable.
- Las migraciones de Supabase son aditivas o llevan su camino de reversión explícito documentado en la spec — no se destruye una columna o tabla en el mismo PR que la crea.
- `/speckit-implement` en specs con varias fases o historias de usuario se invoca fase por fase (o historia por historia), usando el filtro de tareas del propio comando, con `/clear` entre una fase y la siguiente — no la spec completa en una sola corrida. `tasks.md` ya trae un "Checkpoint" al final de cada fase para cortar ahí.
- No encadenes `/speckit-analyze` ni `/speckit-converge` de forma rutinaria después de cada implement: releen todos los artefactos completos en cada corrida. Solo cuando haya una sospecha concreta de gap, no como paso automático.
- Las notas de desvío que se agregan a `tasks.md` (lo que se apartó del plan) van cortas, con referencia al commit (`ver commit <hash>`) en vez de repetir el párrafo entero — esa razón ya vive en el mensaje de commit y no hace falta cargarla dos veces.
- Si trabajás en un producto derivado (un fork de este template): antes de implementar una spec que toque un mecanismo de plataforma reutilizable — Kestra, imágenes/CI de workers, componentes compartidos de Refine, Supabase no-de-dominio — sin lógica de negocio entrelazada, evaluá primero si corresponde escribirlo acá, en el template (spec propia, PR, y traerlo al fork con `git merge upstream/main`), en vez de escribirlo directo en el fork y generalizarlo después. Evita la arqueología retroactiva de separar plataforma de negocio en cada sincronización. Cuando la pieza tiene lógica de negocio entrelazada (el caso más común), se implementa en el fork primero y se generaliza después — mismo proceso que documentan `docs/disenar-conector.md` y los `docs/adoptar-*.md` ya existentes.

## Documentación obligatoria

Todo cambio de plataforma, worker, Kestra, Supabase, CI o tooling propio debe
incluir en el mismo cambio una actualización de `specs/`, `docs/`, `AGENTS.md`,
`CLAUDE.md` o la constitución. El workflow ejecuta `pnpm docs:check`; una
implementación sin documentación equivalente debe fallar.

## Uso selectivo de skills

- Carga una skill solo si la tarea coincide con su descripción; el catálogo no es un checklist ni se carga completo. Las skills orientan el trabajo, pero no reemplazan estas instrucciones ni autorizan cambios fuera del pedido.
- Para una funcionalidad nueva, usa el flujo GitHub Spec Kit ya versionado (`speckit-*`). No reemplazarlo por una skill genérica de desarrollo guiado por especificación. `speckit-analyze` y `speckit-converge` se usan únicamente ante una sospecha concreta de inconsistencia, como indica la regla anterior.
- Para una idea aún exploratoria, usa el pipeline oficial `speckit-assess-*` y solo abre `speckit-specify` si la decisión es go. Para un comportamiento roto, usa `speckit-bug-assess` → `speckit-bug-fix` → `speckit-bug-test`; ninguna de las dos rutas es un paso automático para una funcionalidad normal.
- Para UI: `frontend-design` al construir o rediseñar pantallas; `web-design-guidelines` al revisar interfaz y experiencia; `user-research-analysis` al sintetizar entrevistas, encuestas o evidencia de usuarios; `accessibility-compliance` al implementar requisitos WCAG; y `accessibility-testing` al validar accesibilidad. Para rendimiento React, usa `vercel-react-best-practices`.
- Para Supabase, usa `supabase` y, cuando corresponda a consultas, esquemas o rendimiento de Postgres, `supabase-postgres-best-practices`.
- Usa `refine-frontend` para pantallas, rutas, recursos o configuración de Refine; `mui-refine` para theme y componentes Material UI; `kestra-orquestacion` para flows, despacho y operación de Kestra; y `superset-analitica` para dashboards, embebido y permisos analíticos de Superset.
- Para revisiones, usa solo la skill especializada que aplique: `code-review` (diff/PR), `authz-security` (autorización/RLS), `crypto-secrets` (secretos y criptografía), `ci-cd-security` (workflows), `infra-security` (IaC/Docker), `supply-chain-security` (dependencias), `skill-security` (skills de terceros) o `repo-security-posture` (postura integral).
- Usa `arquitectura-plataforma` para decisiones transversales entre productos, frontend, workers, Supabase y Kestra; y `eficiencia-contexto` para investigaciones, planes o revisiones amplias que puedan consumir contexto innecesariamente.
- Usa `pruebas-plataforma` al crear, revisar o ejecutar pruebas. Para una suite Playwright E2E, tests inestables o su CI, carga además `playwright-best-practices`; no actives ninguna de las dos para una modificación documental.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- Run `pnpm grafo:init` once per clone/worktree to generate the graph locally (extraction + clustering + the post-commit hook); it costs no tokens and nothing under `graphify-out/` is ever committed.
