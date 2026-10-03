# Decision: CI/CD completo staging → producción para todo el stack

- **Slug**: cicd-staging-produccion
- **Decided**: 2026-10-03
- **Verdict**: go
- **Artifacts reviewed**: intake.md, research.md, problem.md, concept.md

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | strong | `research.md` confirma con lectura directa del código (`scripts/deploy-vps.mjs`, `docs/deployment.md`) que migraciones, deploy de VPS y publicación de flows son hoy manuales, sin workflow — brecha real, no supuesta. |
| Evidence strength | adequate | Hallazgos clave están citados a archivos concretos del repo (`deploy-vps.mjs`, `desplegar-flow.mjs`, `worker-images.yml`, `CLAUDE.md`); el único punto marcado ASSUMPTION (mecánica de GitHub Environments/required reviewers) es comportamiento de plataforma bien conocido, bajo riesgo. |
| Value vs. inaction | strong | `problem.md` liga directamente el costo de inacción (SSH manual persistente, sin auditoría, riesgo que crece con cada producto derivado) a goals concretos y ya priorizados por el coordinador. |
| Feasibility / appetite fit | adequate | `concept.md` ofrece una Opción B con apetito medio, construida sobre scripts que ya existen y ya son parcialmente CI-friendly (`desplegar-flow.mjs` ya lee env vars). El mayor riesgo — si el runner self-hosted tiene hoy red/SSH hacia el VPS real — queda como suposición a validar, no como bloqueo probado. |
| Strategic fit | strong | Coincide con la regla del propio `CLAUDE.md` de resolver mecanismos de plataforma reutilizables en el template antes que en el fork, y con el gate nativo de GitHub ya en uso parcial (`worker-images.yml`). |
| Risk posture | adequate | Los dos riesgos reales identificados (conectividad del runner al VPS; construir el wrapper de Superset sin caso de uso) tienen mitigación concreta: el primero se documenta como asunción a validar en plan/specify; el segundo se resuelve excluyendo el wrapper de Superset del alcance inmediato (Opción B), evitando la tensión con la regla de "no habilitar capacidad sin caso de uso". |

## Verdict & Rationale

**Go**, con la Opción B de `concept.md` como alcance recomendado (núcleo del pipeline — migraciones, deploy de infraestructura del VPS, publicación de flows, y migración de credenciales a GitHub Actions secrets — sin el wrapper de import de Superset). El problema está bien evidenciado con citas directas al código del propio repo, el costo de inacción es concreto y ya priorizado por el coordinador, y existe una opción con apetito medio construida sobre piezas que ya existen parcialmente (`deploy-vps.mjs`, `desplegar-flow.mjs`). El único riesgo de feasibility no resuelto —si el runner self-hosted ya tiene conectividad hacia el VPS real— no invalida el "go": es una pregunta que `/speckit-specify` y su `/speckit-clarify` pueden y deben resolver como parte de especificar el mecanismo (incluyendo, si hace falta, declarar el aprovisionamiento de esa conectividad como parte del alcance), no un motivo para devolver el assessment a una etapa anterior.

La tensión sobre el wrapper de Superset se señaló explícitamente (ver arriba) y se trasladó al coordinador antes de continuar. **Resolución**: el coordinador confirmó incluirlo ya (Opción A) — se prioriza el pedido original tal como fue acordado, pese a la tensión con la regla de "no habilitar capacidad sin caso de uso" del propio `CLAUDE.md`. Queda documentado que el wrapper se construye sin ningún YAML real de referencia (riesgo aceptado conscientemente por el coordinador, no pasado por alto).

## If go — Handoff to `/speckit-specify`

- **Problem**: La plantilla solo automatiza el deploy de la app web y la publicación de imágenes de workers; migraciones de base de datos cloud, despliegue de infraestructura del VPS (Kestra, Superset, proxy reverso) y publicación de flows del orquestador siguen siendo pasos manuales por SSH, sin el mismo gate de staging→producción ni el mismo control de credenciales que el resto del stack.
- **Chosen approach**: Opción A de `concept.md`, confirmada por el coordinador — un workflow de GitHub Actions por mecanismo (migraciones, deploy VPS, publicación de flows), cada uno con dos jobs (`staging` → `production` vía `needs`) y un GitHub Environment de producción con required reviewers como gate nativo; ampliar `scripts/deploy-vps.mjs` para leer credenciales desde variables de entorno de CI en vez de `.env.<entorno>` del VPS; mover credenciales (DB, SSH del VPS, orquestador) a GitHub Actions secrets; y un wrapper CLI/API genérico y parametrizado para importar YAMLs de dashboards de Superset, construido ya mismo aunque hoy no haya ningún YAML real que importar (riesgo aceptado por el coordinador).
- **In scope**: CI de migraciones de Supabase por entorno con gate; CI de deploy de infraestructura del VPS (Kestra, Superset, proxy reverso vía `deploy-vps.mjs` ampliado) con el mismo gate; wiring de `infra/kestra/desplegar-flow.mjs` al pipeline; migración de credenciales de archivos `.env` del VPS a GitHub Actions secrets; wrapper genérico de import de dashboards de Superset (sin asumir cuáles YAMLs existen).
- **Out of scope**: integración OAuth/Nango; copia de datos reales de producción a staging (solo se puede sugerir fixtures sintéticos); aprovisionamiento de nuevos servidores de organización o reverse proxy; lógica de negocio de cualquier producto derivado puntual; wiring del wrapper de Superset a dashboards concretos (no existen todavía).
- **Success metrics**: push a `supabase/migrations` dispara aplicación automática contra staging sin intervención manual; push a `infra/<producto>/` dispara deploy automático a staging vía `deploy-vps.mjs`, con producción pausada hasta aprobación en el Environment; ninguna credencial de VPS/DB/orquestador sigue viviendo como archivo `.env` en el VPS al cerrar la spec; existe un wrapper de import de dashboards de Superset invocable por CLI/API, parametrizado por entorno.
- **Carried-forward open questions**:
  - [NEEDS CLARIFICATION: el runner self-hosted que ejecutará los jobs de deploy a VPS — ¿tiene hoy conectividad SSH/red hacia el VPS real de staging y producción, o hace falta aprovisionarla como parte de esta spec?]
  - [NEEDS CLARIFICATION: ¿están ya creados y accesibles los proyectos Supabase cloud de staging y producción, o crear/conectar esos proyectos es parte del alcance de esta spec?]
