# Idea Research: CI/CD completo staging → producción para todo el stack

- **Slug**: cicd-staging-produccion
- **Created**: 2026-10-03
- **Evidence confidence (overall)**: medium — alta sobre el estado actual del código de este template (todo cited a archivos reales); baja/media sobre decisiones de diseño que ya vienen dadas por el coordinador del producto (se tratan como decisión, no como hallazgo a validar).

## Users & Demand

- El propio pipeline de la plantilla tiene una brecha operativa documentada: `docs/deployment.md` describe el deploy a VPS y las migraciones como pasos manuales, sin workflow de CI — [source: `docs/deployment.md` líneas 45-53, 240-251] (confidence: high, cited).
- El pedido viene del coordinador del producto derivado (estudio-contable-automation), que ya experimenta el costo de los pasos manuales (SSH a mano, script de deploy a mano, publicación de flows a mano) — [source: intake.md, "Origin & Context"] (confidence: medium, cited — es un reporte de segunda mano del propio usuario, no un ticket o métrica).

## Prior Art

- **`scripts/deploy-vps.mjs`** ya existe y ya es genérico por entorno (`staging`/`production` como argumento), pero lee credenciales desde `.env.<entorno>` en el filesystem del VPS, no desde variables de CI — [source: `scripts/deploy-vps.mjs` líneas 6-10] (confidence: high, cited). Confirma exactamente la brecha que describe el intake y da la base concreta sobre la que ampliar en vez de crear un script nuevo.
- **`infra/kestra/desplegar-flow.mjs`** ya es el script de publicación manual de flows que menciona el intake. Ya lee credenciales de variables de entorno (`KESTRA_BASIC_AUTH_USERNAME`/`PASSWORD`) o flags CLI, no de archivos — ya está más cerca de ser CI-friendly que el deploy de infraestructura — [source: `infra/kestra/desplegar-flow.mjs` líneas 11-14] (confidence: high, cited).
- **`.github/workflows/worker-images.yml`** ya usa un GitHub Environment (`worker-images-production`) y corre en el runner self-hosted (`[self-hosted, platform-local]`), pero es un solo job sin gate de dos fases porque construir y publicar una imagen no tiene "staging" propio — es prior art de cómo este repo ya usa GitHub Environments, no un caso que ya resuelva el patrón de dos jobs con `needs` — [source: `.github/workflows/worker-images.yml` líneas 20-42] (confidence: high, cited).
- **Superset**: no existe hoy ningún script de import de dashboards YAML en `infra/superset/` — confirma que es mecanismo nuevo, no una ampliación de algo existente — [source: búsqueda en `infra/superset/`, sin resultados] (confidence: high, cited — ausencia verificada, no asumida).
- **Supabase/migraciones**: `docs/deployment.md` ya documenta que la rama `staging` apunta a un proyecto Supabase Free separado de producción — la separación de entornos cloud ya existe conceptualmente, falta solo el workflow que aplique migraciones contra cada uno — [source: `docs/deployment.md` línea 19] (confidence: high, cited). Esto reduce una de las incógnitas del intake: no hace falta crear la separación de proyectos, solo automatizar contra la que ya se documenta.
- **CI self-hosted runner**: `docs/deployment.md` documenta que hoy el runner corre en la PC de desarrollo, no en un VPS, y que migrarlo "no cambia nada del Dockerfile, solo dónde se levanta el compose" — [source: `docs/deployment.md` líneas 107-108] (confidence: high, cited). Esto es relevante para el gate a producción: si el runner no tiene red hacia el VPS de producción todavía, el job de "deploy a VPS" no tiene desde dónde ejecutarse hoy — incógnita abierta, no resuelta por este hallazgo.
- Patrón ya vigente y exitoso para comparar: Vercel (push a main = producción, PR = preview) y `worker-images.yml` (push a main con paths-filter) — [source: intake.md, confirmado por lectura directa de `worker-images.yml`] (confidence: high, cited).

## Market & Context

- GitHub Environments con "required reviewers" + `needs` entre jobs es un mecanismo nativo, sin costo adicional, ya dentro del plan de GitHub Actions que el repo usa (self-hosted runners evitan el gasto de minutos, pero el gate de aprobación no consume minutos mientras espera) — [source: conocimiento general de la plataforma GitHub Actions, no específico del repo] (confidence: medium, ASSUMPTION — no se citó documentación oficial de GitHub en esta investigación).
- Alternativa que el equipo ya descartó implícitamente: construir un gate custom (bot de aprobación, paso manual fuera de GitHub) — no hay evidencia de que se haya evaluado y rechazado explícitamente, pero el diseño ya acordado lo da por sentado — [source: intake.md] (confidence: high, cited como decisión ya tomada, no como alternativa de mercado evaluada aquí).

## Data & Constraints

- Las credenciales en juego (orquestador, base de datos, SSH del VPS) son sensibles y hoy viven como archivos planos en el VPS — moverlas a GitHub Actions secrets reduce superficie de acceso (ya no se necesita SSH para rotarlas) pero concentra el riesgo en los secrets de los GitHub Environments de staging/producción — [source: intake.md + `scripts/deploy-vps.mjs`] (confidence: high, cited).
- Dato de cumplimiento explícito: los datos de staging no deben ser una copia de producción porque son datos reales de clientes — [source: intake.md] (confidence: high, cited, ya es una decisión/restricción dada, no un hallazgo a validar).
- Convención ya vigente en el repo (`CLAUDE.md`): el CI corre en runners self-hosted, no en `ubuntu-latest`, para no gastar minutos de GitHub Actions — cualquier job nuevo (migraciones, deploy VPS, import de dashboards) debe mantenerse en esa misma convención — [source: `CLAUDE.md`, regla de runners self-hosted] (confidence: high, cited).
- Convención ya vigente: migraciones de Supabase deben ser aditivas o llevar camino de reversión explícito, nunca destructivas en el mismo PR que las crea — aplica directamente al nuevo job de CI de migraciones — [source: `CLAUDE.md`, regla de migraciones] (confidence: high, cited).

## Evidence Against the Idea

- **Costo/beneficio de automatizar el deploy de infraestructura del VPS puede no justificarse todavía**: `docs/deployment.md` describe el staging de Kestra/Superset como algo que "puede mantenerse en costo cero mientras no sea necesario ampliar el VPS" y que se usa "sólo cuando hay que probar una integración completa" — es decir, hoy el despliegue a staging de infraestructura no es constante, es ad-hoc. Automatizarlo con push-to-deploy podría generar despliegues de staging más frecuentes de lo que el flujo actual necesita, sin que haya evidencia de que el ciclo manual actual sea realmente un cuello de botella medido (no hay ticket, métrica de tiempo perdido, o incidente citado) — [source: `docs/deployment.md` líneas 16-26] (confidence: medium, cited).
- **El runner self-hosted hoy vive en la PC de desarrollo, no en un VPS con red hacia los servidores de staging/producción** — si el job de "deploy a VPS" necesita SSH o acceso de red directo al VPS, y el runner no está en una máquina con esa conectividad, la automatización no puede ejecutarse hoy sin aprovisionar o migrar el runner primero. Esto es un prerequisito no resuelto, no solo un detalle de implementación — [source: `docs/deployment.md` líneas 107-108] (confidence: high, cited).
- **El mecanismo de import de Superset se construiría sin ningún caso de uso real todavía** (cero dashboards YAML existentes hoy) — el propio `CLAUDE.md` del repo advierte explícitamente contra habilitar una capacidad sin caso de uso de negocio: *"Habilitar una capacidad o herramienta sin un caso de uso de negocio todavía (...) no necesita spec — la funcionalidad real que la use, sí."* Esto es tensión real entre el pedido (dejar el mecanismo genérico listo) y una regla explícita del propio repo — a resolver en `speckit-assess-shape`/`decide`, no aquí — [source: `CLAUDE.md`, regla de capacidad sin caso de uso] (confidence: high, cited).

## Gaps & Open Questions

- [NEEDS CLARIFICATION: dónde corre hoy el runner self-hosted que ejecutaría el job de deploy a VPS de staging/producción — si es la PC de desarrollo (según `docs/deployment.md`), ¿tiene red/SSH hacia el VPS real, o hace falta aprovisionar un runner en el propio VPS o con acceso a él antes de que este pipeline pueda funcionar?]
- [NEEDS CLARIFICATION: si el mecanismo de import de dashboards de Superset se implementa ya (sin wiring a ningún YAML real) dado que hoy no hay ningún caso de uso de negocio, en tensión con la regla del propio `CLAUDE.md` sobre no habilitar capacidades sin caso de uso — ¿corresponde construir solo el wrapper CLI/API genérico sin integrarlo al workflow de GitHub Actions todavía, dejando ese wiring para cuando el producto tenga YAMLs?]
- [NEEDS CLARIFICATION: el intake asume que ya existen proyectos Supabase cloud separados para staging y producción — `docs/deployment.md` lo confirma para staging, pero no queda explícito si ambos proyectos (staging y producción) ya están creados y accesibles hoy, o si crear/conectar esos proyectos es parte del trabajo de esta spec.]

## Sources

- `docs/deployment.md` (archivo local del repo, no URL)
- `scripts/deploy-vps.mjs` (archivo local del repo, no URL)
- `infra/kestra/desplegar-flow.mjs` (archivo local del repo, no URL)
- `.github/workflows/worker-images.yml` (archivo local del repo, no URL)
- `CLAUDE.md` (archivo local del repo, no URL)
- `.specify/assessments/cicd-staging-produccion/intake.md` (artefacto de este mismo assessment)
