# Cómo usar las skills del proyecto

Esta página explica qué skill cargar según la tarea y dónde se versiona. Las skills aportan instrucciones especializadas; [AGENTS.md](../AGENTS.md) y [CLAUDE.md](../CLAUDE.md) siguen siendo las reglas obligatorias del repositorio.

## Elegir una skill

Cargá una skill solo cuando su descripción coincida con el trabajo. No cargues el catálogo completo ni uses una skill para ampliar el alcance de una tarea.

| Necesidad | Skills |
| --- | --- |
| Nueva funcionalidad | `speckit-specify`, `speckit-plan`, `speckit-tasks`, `speckit-implement` |
| Idea o bug | `speckit-assess-*` o `speckit-bug-*` |
| Pantallas, experiencia de usuario (UX) y accesibilidad | `refine-frontend`, `mui-refine`, `frontend-design`, `web-design-guidelines`, `accessibility-*` |
| Datos y Supabase | `supabase`, `supabase-postgres-best-practices` |
| Workers, Kestra o Superset | `kestra-orquestacion`, `superset-analitica` |
| Pruebas | `pruebas-plataforma`; `playwright-best-practices` para pruebas end-to-end (E2E), inestabilidad o integración continua (CI) de Playwright |
| Revisión y seguridad | `code-review` o la skill de seguridad específica del cambio |
| Decisiones transversales o investigación amplia | `arquitectura-plataforma`, `eficiencia-contexto` |

Consultá el enrutamiento completo y sus límites en [AGENTS.md](../AGENTS.md).

## Grafo de código Graphify (ahorro de tokens)

`graphify-out/graph.json` es el mapa consultable del código (nodos = símbolos, aristas = imports/calls). Generarlo es local y no consume tokens:

```powershell
uv tool install "graphifyy[sql]"  # una vez por máquina (incluye tree-sitter SQL)
pnpm grafo:init                    # por clon/worktree: extract + cluster + hooks
```

Uso: `graphify query "<pregunta>"` (tope 2000 tokens), `graphify path "A" "B"`, `graphify explain "X"`. Preferirlo antes que `grep` masivo o leer archivos completos (ver "## graphify" en [AGENTS.md](../AGENTS.md)). `graphify-out/` nunca se commitea.

## Disponibilidad por agente

Codex y OpenCode detectan las skills en `.agents/skills`. Claude Code usa las copias equivalentes de `.claude/skills`. OpenCode también recibe los comandos nativos de GitHub Spec Kit en `.opencode/commands`.

Las extensiones oficiales `assess` y `bug` viven en `.specify/extensions`. Codex las consume mediante wrappers en `.agents/skills`; Claude Code y OpenCode reciben sus integraciones generadas.

## Actualizar una skill externa

Las fuentes externas y sus hashes están fijados en [`skills-lock.json`](../skills-lock.json). Para una actualización deliberada, ejecutá lo siguiente y revisá el diff antes de conservarlo:

```powershell
npx skills update -p -y
```

Comprobá que las copias de `.agents/skills` y `.claude/skills` sigan presentes. No actualices skills durante una tarea de producto sin evaluar el cambio.

## Controles de seguridad locales

Las skills de seguridad incluyen escáneres Python sin dependencias.

```powershell
python .agents/skills/skill-security/scripts/scan.py .agents/skills --format json
python .agents/skills/crypto-secrets/scripts/scan.py . --format markdown
python .agents/skills/infra-security/scripts/scan.py infra --format markdown
```

`ci-cd-security` no incluye ejecutable. Su revisión de workflows es estática y guiada por su `SKILL.md`.

Estos controles aportan evidencia estática. No sustituyen las validaciones del producto ni autorizan exponer secretos.
