# Problem Definition: CI/CD completo staging → producción para todo el stack

- **Slug**: cicd-staging-produccion
- **Created**: 2026-10-03
- **Inputs used**: intake.md, research.md

## Problem Statement

En esta plantilla, solo dos de los componentes del stack (la app web vía Vercel, y las imágenes de workers vía GitHub Actions) siguen el patrón "push → deploy automático a staging → aprobación manual → producción". El resto —migraciones de base de datos contra proyectos Supabase cloud, despliegue de infraestructura del VPS (Kestra, Superset, proxy reverso), y publicación de flows del orquestador— depende hoy de pasos manuales (copiar por SSH, correr un script a mano, aplicar migraciones a mano), lo que deja a esos componentes sin el mismo nivel de trazabilidad, repetibilidad y control de acceso que ya tiene el resto del stack, y exige acceso SSH directo al VPS para operaciones de rutina como rotar una credencial.

## Affected Users & Stakeholders

- **Usuarios**: el agente/operador que opera este repo (y los repos derivados que adopten esta capacidad) — hoy ejecuta a mano el deploy a VPS, la publicación de flows y las migraciones cloud, con el riesgo de pasos salteados u olvidados y sin un registro automático de quién aprobó qué.
- **Stakeholders**: coordinador(es) de producto de cada producto derivado (p. ej. estudio-contable-automation) — deciden cuándo algo pasa a producción y hoy necesitan acceso SSH o confiar en que el operador corrió el script correcto manualmente; les interesa poder aprobar una promoción a producción con un click trazable en GitHub en vez de una operación SSH no auditada.
- **Stakeholder derivado**: cualquier producto futuro que adopte esta plantilla — hereda la brecha si no se resuelve acá (regla del propio `CLAUDE.md`: mecanismos de plataforma reutilizables se resuelven primero en el template).

## Goals

- Que todos los componentes del stack (migraciones de base de datos, infraestructura del VPS, flows del orquestador, y en el futuro dashboards de Superset) sigan el mismo patrón ya vigente para la app web y los workers: push dispara deploy automático a staging, una aprobación manual explícita promueve a producción.
- Eliminar la necesidad de acceso SSH manual al VPS para rotar credenciales — que vivan como GitHub Actions secrets, inyectados directo al job.
- Dejar un mecanismo genérico y parametrizado (no atado a un producto puntual) para que cualquier producto derivado lo adopte igual que ya adoptó `worker-images.yml` o el runner local.

## Non-Goals

- No automatizar la integración OAuth (tipo Nango): es configuración de cuenta, no cambia con cada push, queda deliberadamente fuera de este pipeline.
- No copiar datos reales de producción a staging (son datos de clientes reales sensibles); no es foco principal de esta spec diseñar el mecanismo de fixtures sintéticos, solo dejar la puerta sugerida.
- No construir un mecanismo de aprobación custom: se usa el gate nativo de GitHub (Environments + required reviewers + `needs` entre jobs), nada propio.
- No incluir lógica de negocio de ningún producto derivado — es mecanismo de plataforma puro (workflow de GitHub Actions, script de deploy genérico, wrapper de import de dashboards, CI de migraciones).
- No resolver todavía la importación de dashboards de Superset reales: el producto de referencia no tiene ningún YAML exportado hoy. Dejar el mecanismo genérico listo, sin asumir contenido.

## Success Metrics

- Un push que toque migraciones de `supabase/migrations` dispara un job de CI que las aplica contra el proyecto Supabase de staging, sin intervención manual (baseline: hoy no existe ningún workflow para esto — totalmente manual).
- Un push que toque `infra/<producto>/` dispara un job que ejecuta `deploy-vps.mjs` contra staging automáticamente, y la promoción a producción queda pausada en GitHub Actions hasta un click de aprobación en un Environment con required reviewers (baseline: hoy se hace copiando por SSH y corriendo el script a mano, sin gate).
- Ninguna credencial (DB, SSH del VPS, Kestra) sigue viviendo como archivo `.env` en el VPS al cerrar la spec — todas disponibles como GitHub Actions secrets (baseline: hoy viven como `.env.staging`/`.env.production` en el filesystem del VPS, según `scripts/deploy-vps.mjs`).
- Existe un wrapper genérico (CLI/API) para importar YAMLs de dashboards de Superset, parametrizado por entorno, listo para wiring futuro (baseline: hoy no existe ningún script de import de dashboards en `infra/superset/`). Métrica cualitativa: "existe y es invocable", no "está integrado al workflow automático" — eso queda condicionado a que el producto tenga YAMLs reales.

## Cost of Inaction

Si no se construye esto, cada producto derivado sigue dependiendo de acceso SSH manual al VPS para desplegar infraestructura, rotar credenciales y publicar flows, y de pasos manuales para migrar bases de datos cloud. El riesgo crece con cada producto nuevo que adopte la plantilla: cada uno repite (o reinventa) el mismo proceso manual, sin el mismo nivel de auditoría, control de acceso o repetibilidad que ya tiene el resto del stack. Un paso salteado en una migración o un despliegue a mano mal ejecutado no deja rastro en GitHub Actions como sí lo dejaría un workflow con gate.

## Open Questions

- [NEEDS CLARIFICATION: dónde corre hoy el runner self-hosted que ejecutaría el job de deploy a VPS — si tiene red/SSH hacia el VPS real de staging/producción hoy, o si aprovisionar esa conectividad es un prerequisito de esta spec]
- [NEEDS CLARIFICATION: si el wrapper de import de dashboards de Superset se construye ya (sin wiring al workflow automático) dado que no hay ningún caso de uso de negocio todavía, en tensión con la regla del propio `CLAUDE.md` de no habilitar capacidades sin caso de uso real]
- [NEEDS CLARIFICATION: si los proyectos Supabase cloud de staging y producción ya están creados y accesibles hoy (research.md confirma que `docs/deployment.md` documenta staging, pero no confirma que ambos proyectos existan y estén conectables desde CI)]
