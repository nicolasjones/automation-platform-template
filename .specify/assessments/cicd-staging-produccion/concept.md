# Concept: CI/CD completo staging → producción para todo el stack

- **Slug**: cicd-staging-produccion
- **Created**: 2026-10-03
- **Recommended option**: Opción B — núcleo del pipeline sin el wrapper de Superset

## Options

### Option A — Pipeline completo tal como lo describe el pedido original
- **Sketch**: Un solo esfuerzo que entrega las cuatro piezas a la vez: (1) workflow de GitHub Actions con gate de dos jobs (`needs` + GitHub Environment de producción con required reviewers) para aplicar migraciones de Supabase contra el proyecto cloud de cada entorno; (2) el mismo gate para correr `scripts/deploy-vps.mjs` contra staging y producción, ampliado para leer credenciales desde variables de entorno de CI en vez de `.env.<entorno>` en el filesystem del VPS; (3) wiring de `infra/kestra/desplegar-flow.mjs` al mismo pipeline, ya que lee credenciales de entorno; (4) un wrapper CLI/API genérico y parametrizado para importar YAMLs de dashboards de Superset, construido ya mismo aunque hoy no haya ningún YAML real que importar.
- **Appetite**: medium–large (semanas).
- **Trade-offs**: Entrega todo lo pedido en un solo movimiento, sin dejar ningún componente a medio migrar. Sacrifica foco: mezcla piezas con evidencia de uso real (migraciones, deploy VPS, flows) con una pieza sin ningún caso de uso de negocio hoy (Superset), lo que choca con la regla explícita del propio `CLAUDE.md` ("habilitar una capacidad sin caso de uso de negocio todavía no necesita spec"). También asume que el runner self-hosted ya tiene (o tendrá, dentro de esta misma spec) conectividad de red hacia el VPS real — si no la tiene, el job de deploy a VPS queda escrito pero no puede probarse end-to-end hasta resolver eso, inflando el alcance real.
- **Rabbit holes**: aprovisionar o migrar el runner self-hosted para que tenga red hacia el VPS (hoy corre en la PC de desarrollo, según `docs/deployment.md`); diseñar el wrapper de Superset sin ningún YAML de referencia real, con alto riesgo de adivinar una interfaz que no sirva cuando el producto por fin tenga dashboards.

### Option B — Núcleo del pipeline, wrapper de Superset diferido
- **Sketch**: Igual que la Opción A en los tres primeros puntos (CI de migraciones con gate, CI de deploy VPS con gate y credenciales desde secrets, wiring del publish de flows), pero el wrapper genérico de import de dashboards de Superset se deja fuera de esta spec — se documenta como capacidad pendiente a abrir cuando el producto en paralelo tenga al menos un YAML real exportado, siguiendo la regla del propio `CLAUDE.md` sobre no construir capacidades sin caso de uso de negocio.
- **Appetite**: medium (1–2 semanas).
- **Trade-offs**: Respeta la regla del repo al pie de la letra y evita construir una interfaz especulativa que probablemente haya que rehacer. Sacrifica la completitud del pedido original — Superset queda fuera del "todos los componentes siguen el mismo patrón" hasta una segunda spec. Es una desviación de lo pedido explícitamente por el coordinador, aunque fundamentada en una regla que el propio coordinador ya aceptó al escribir el `CLAUDE.md`.
- **Rabbit holes**: el mismo riesgo de conectividad del runner hacia el VPS que la Opción A, pero acotado a Kestra/Superset-compose/proxy (no a Superset-import). Si el runner no tiene red hacia el VPS, este sigue siendo el cuello de botella real del alcance, no la cantidad de piezas incluidas.

### Option C — Solo CI de migraciones (lo más chico que sirve)
- **Sketch**: Entregar únicamente el workflow de gate de dos jobs para migraciones de Supabase (staging automático → aprobación manual → producción), dejando el deploy de infraestructura del VPS y la publicación de flows tal como están hoy (manuales). Es la pieza con menor riesgo de prerequisitos no resueltos: no depende de que el runner tenga red hacia el VPS, solo de que tenga red hacia la API de Supabase cloud (ya la tiene, porque CI ya corre pruebas contra Supabase).
- **Appetite**: small (días).
- **Trade-offs**: Entrega valor rápido y de bajo riesgo, prueba el patrón de gate de dos jobs en un caso simple antes de aplicarlo a algo más complejo (VPS). Sacrifica la mayor parte del pedido: ni el deploy de infraestructura ni la publicación de flows se tocan, con lo que persiste la mayor parte del costo de inacción (acceso SSH manual, credenciales en archivos `.env` del VPS).
- **Rabbit holes**: ninguno significativo — es deliberadamente acotado. El riesgo es que, si se aprueba como la entrega completa, deja sin resolver la parte del pedido que más le importaba al coordinador (sacar las credenciales del VPS).

## Recommendation

**Opción B.** Resuelve el núcleo real del pedido del coordinador (migraciones, deploy de infraestructura del VPS, publicación de flows, y el traslado de credenciales de `.env` en el VPS a GitHub Actions secrets) con el mismo gate nativo en los tres casos, cumpliendo los goals y success metrics de `problem.md` salvo el de Superset. Difiere únicamente el wrapper de import de dashboards, con un criterio técnico explícito y ya documentado en el propio repo (`CLAUDE.md`: no construir una capacidad sin caso de uso de negocio), en vez de construir una interfaz a ciegas que con alta probabilidad no coincida con el primer YAML real que el producto exporte.

Esto es una desviación respecto del pedido original (que pedía dejar el mecanismo de Superset "ya" como parte de esta spec) — se señala explícitamente aquí para que el coordinador la confirme o la rechace antes de pasar a `/speckit-specify`. Si el coordinador prefiere incluir el wrapper de Superset igual (p. ej. porque ya sabe qué forma tendrán los YAMLs, o quiere la interfaz lista de antemano), la Opción A es la alternativa directa sin cambiar nada más.

La Opción C queda descartada como recomendación principal porque deja sin resolver la molestia más citada por el coordinador (SSH manual + credenciales en archivos del VPS), pero es la base técnica más segura si `/speckit-assess-decide` concluye que la conectividad del runner hacia el VPS es un bloqueante no resuelto — en ese caso, lo correcto es entregar primero C y abrir una spec aparte para el deploy de infraestructura una vez resuelta la conectividad.

## Out of Scope (for the recommended option)

- Wrapper/mecanismo de import de dashboards de Superset (diferido a una spec futura, cuando exista al menos un YAML real).
- Integración OAuth (Nango): fuera del pipeline, es configuración de cuenta.
- Copia de datos reales de producción a staging; fixtures sintéticos quedan como sugerencia, no como entregable de esta spec.
- Aprovisionamiento de un reverse proxy o de nuevos servidores de organización: fuera de alcance, ya cubierto por procedimientos existentes.
- Cualquier lógica de negocio de un producto derivado puntual.

## Assumptions to Validate

- El runner self-hosted que ejecuta los jobs de CI tiene (o se le puede dar, dentro del propio PR) conectividad SSH/red hacia el VPS real de staging y de producción — si no, el job de deploy a VPS no puede probarse end-to-end y la spec debe declarar ese prerequisito o acotarse a lo que sí puede probarse.
- Existen hoy proyectos Supabase cloud separados y accesibles para staging y producción (más allá de lo documentado en `docs/deployment.md` para staging) — a confirmar antes de escribir el workflow de migraciones.
- El coordinador acepta diferir el wrapper de Superset fuera de esta spec (desviación señalada arriba); si no, se adopta la Opción A completa.
