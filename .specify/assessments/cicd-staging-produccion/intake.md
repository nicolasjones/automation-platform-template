# Idea Intake: CI/CD completo staging → producción para todo el stack

- **Slug**: cicd-staging-produccion
- **Created**: 2026-10-03
- **Source**: pasted text
- **Type**: new-capability

## Idea (as captured)

> CI/CD completo staging -> produccion para todos los componentes del stack de la plantilla automation-platform-template.
>
> Situacion actual: ya es automatico el deploy de la app web via Vercel (push a main = produccion, PR = preview) y la publicacion de imagenes Docker de los workers via un workflow de GitHub Actions que corre en push a main que toque la carpeta de workers (nuevo tag en el registry de contenedores). Es manual hoy: las migraciones de base de datos contra los proyectos cloud de staging y produccion (no hay workflow para esto); todo el despliegue de infraestructura (orquestador tipo Kestra, analitica tipo Superset, conexiones OAuth tipo Nango, proxy reverso) contra el VPS -- se copia a mano por SSH y se corre un script de deploy a mano; los flows del orquestador se publican corriendo un script a mano.
>
> Objetivo: que todos los componentes sigan el mismo patron -- push dispara deploy automatico a staging, se prueba ahi, una autorizacion manual promueve a produccion.
>
> Diseño ya acordado con el coordinador del producto (estudio-contable-automation, no se toca, es solo referencia), para que el intake/shape parta de estas decisiones de fondo ya tomadas, sin re-derivarlas:
>
> - Mecanismo de gate staging-a-produccion: dos jobs en el mismo workflow de GitHub Actions, el de produccion con `needs` apuntando al job de staging y un GitHub Environment de produccion con "required reviewers" configurado -- el job se pausa hasta que alguien lo aprueba con un click en la pestaña Actions. Nativo de GitHub, no hay que construir nada custom.
> - Las credenciales (orquestador, base de datos, SSH del VPS) deben pasar de vivir como archivos .env en el VPS a vivir como GitHub Actions secrets -- se inyectan directo al job en vez de necesitar acceso SSH manual para rotarlas.
> - El dashboard de analítica (Superset) se suma al mismo pipeline una vez que el producto tenga dashboards exportados a YAML (hoy no tiene ninguno, es trabajo del producto que se está haciendo en paralelo, no de esta spec) -- la spec de esta plantilla debe dejar el mecanismo genérico de importar YAMLs de dashboards vía CLI/API, parametrizado, sin asumir cuáles YAMLs existen.
> - La integración OAuth (tipo Nango) queda deliberadamente fuera de este pipeline: es configuración de cuenta (client id/secret), no cambia con cada push de código, no tiene sentido redisparar en cada commit.
> - Para el ambiente de staging no se recomienda copiar datos reales de producción (son datos de clientes reales con información sensible) -- la spec puede sugerir fixtures sintéticos como alternativa, pero no es el foco principal.
> - Debe cubrir también un script de deploy genérico ya existente en esta plantilla (equivalente a "deploy a un entorno dado") -- evaluar si necesita ampliarse para leer credenciales de variables de entorno de CI en vez de archivos .env locales.
> - Debe cubrir CI para aplicar migraciones de base de datos (ej. `supabase db push` o equivalente) contra un proyecto cloud parametrizado por entorno, con el mismo gate de staging-a-producción.
>
> Alcance: esta es una spec puramente de mecanismo de plataforma (el workflow de GitHub Actions, el script de deploy genérico, el wrapper de import de dashboards, el CI de migraciones) -- no debe incluir lógica de negocio específica de ningún producto puntual. Es genérica para la plantilla reutilizable.

## Restated

Extender el patrón "push → auto-deploy a staging → aprobación manual → promoción a producción" (ya vigente para la app web vía Vercel y para las imágenes de workers vía GitHub Actions) a los componentes que hoy se despliegan o actualizan a mano: migraciones de base de datos contra proyectos cloud, despliegue de infraestructura del VPS (orquestador, analítica, proxy reverso), publicación de flows del orquestador, e importación de dashboards de analítica. El mecanismo de gate (dos jobs de GitHub Actions con `needs` + GitHub Environment de producción con required reviewers) y el traslado de credenciales de archivos `.env` en el VPS a GitHub Actions secrets ya están decididos; la integración OAuth queda deliberadamente fuera del pipeline.

## Origin & Context

- **Raised by**: Coordinador del producto estudio-contable-automation (vía nicolasjones, quien opera este fork/plantilla)
- **Trigger**: Brecha operativa identificada entre lo ya automatizado (web app, imágenes de workers) y lo que hoy requiere pasos manuales (migraciones de BD, despliegue de infraestructura del VPS, publicación de flows, import de dashboards), surgida de una conversación extensa ya resuelta en decisiones de diseño concretas.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: cómo se dispara hoy el "deploy a VPS manual" — qué script exacto, y si ese script vive en esta plantilla o en el producto derivado — para saber qué generalizar aquí vs. qué queda en el fork]
- [NEEDS CLARIFICATION: existe hoy algún runner self-hosted con acceso de red al VPS de staging/producción, o hay que aprovisionarlo como parte de esta spec]
- [NEEDS CLARIFICATION: el wrapper genérico de import de dashboards de Superset — se construye igual aunque el producto todavía no tenga YAMLs que importar, o se deja solo el mecanismo sin wiring al workflow hasta que existan]
- [NEEDS CLARIFICATION: qué entornos de Supabase (o equivalente) ya existen hoy como proyectos cloud separados para staging y producción, o si crear esa separación es parte del alcance]

Slug: cicd-staging-produccion
