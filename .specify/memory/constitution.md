<!--
Sync Impact Report
- Version change: 1.6.0 → 1.7.0 (MINOR: agrega un principio obligatorio que separa
  el esquema de plataforma (`public`) del esquema de dominio del producto (`dominio`)
  y exige RLS en toda tabla expuesta.)
- Modified principles: ninguno
- Added sections: Principle VII. Plataforma y dominio (esquemas)
- Removed sections: ninguna
- Follow-up TODOs: ninguno
-->

# Automation Platform Template Constitution

## Core Principles

### I. Aislamiento multi-tenant por diseño
Los datos de cada organización y sus clientes deben estar aislados. Toda
tabla expuesta debe usar RLS, el navegador sólo puede recibir claves
públicas y los secretos deben permanecer en gestores de variables o
archivos locales ignorados por Git.

### II. Especificar antes de implementar
Cada funcionalidad comienza con una spec verificable. Los planes y tareas deben
referenciar requisitos concretos y aclarar permisos, fallos, auditoría y datos.

### III. Automatizaciones idempotentes y auditables
Los workflows y workers deben poder reintentarse sin duplicar efectos. Cada
ejecución importante registra origen, actor, estado, timestamps y error útil.

### IV. Un monorepo, despliegues independientes
El código comparte repositorio y contratos, pero Refine, Supabase, Kestra,
Superset y cada worker conservan configuración y ciclo de despliegue propios.
En desarrollo Docker, cada producto usa su propio proyecto Compose:
`automation-platform-template-refine-dev`,
`automation-platform-template-supabase-dev`,
`automation-platform-template-kestra-dev`,
`automation-platform-template-superset-dev`,
`automation-platform-template-playwright-dev` y
`automation-platform-template-runner-dev`. No existe un Compose raíz que los
fusione.

### V. Simplicidad operativa
Se agrega infraestructura sólo cuando existe un caso de uso. Desarrollo es
local; staging aprovecha previews y recursos gratuitos; los servicios de VPS de
staging se levantan bajo demanda y se apagan al terminar.

### VI. Panel operable y extensible
Toda spec que agregue, mueva o rediseñe una pantalla del panel o una
automatización operable DEBE declarar su ubicación e icono en la navegación,
audiencia y contexto de organización, rutas canónicas y compatibilidad de
rutas anteriores cuando corresponda. DEBE usar los patrones compartidos de
carga, vacío, error y éxito; funcionar con teclado, lector de pantalla y anchos
de 320 px, 768 px y 1440 px; y no presentar identificadores técnicos como
identidad visible por defecto. Las funcionalidades que agreguen peso
significativo fuera del recorrido principal DEBEN justificar su carga inicial o
usar carga diferida. Estas reglas hacen que el panel crezca sin perder
orientación, seguridad de datos ni rendimiento percibido.

### VII. Plataforma y dominio (esquemas)
`public` es el esquema de **plataforma** (organizaciones, perfiles, membresías, feature
flags, backups, autenticación y orquestación). Las **tablas de dominio del producto**
viven en el esquema **`dominio`** — nunca en `public`. Toda tabla expuesta, en `public`
o en `dominio`, DEBE tener **RLS** por organización (con `private.organizacion_id()` /
`private.puede_escribir()`) y migraciones **aditivas** con camino de reversión. La prueba
de aislamiento (pgTAP) DEBE recorrer **todos los esquemas expuestos** (`public` +
`dominio`) y fallar si alguna tabla no tiene RLS. Una spec que cree una tabla de dominio
en `public` viola esta constitución. Ver `docs/disenar-conector.md`.

## Technology and Quality Gates

El stack base es Refine, Supabase, Kestra, Superset y workers explícitos. Toda
entrega debe compilar, pasar lint, validar Compose, pasar los tests (`pnpm test`)
y documentar migraciones y variables nuevas. Los cambios sensibles requieren
una prueba del aislamiento (pgTAP contra RLS, no solo revisión manual). Las
migraciones de Supabase son aditivas o llevan su camino de reversión explícito
documentado en la spec — no se destruye una columna o tabla en el mismo PR que
la crea.

## Delivery Workflow

Las ramas de funcionalidades nacen de `main`. Toda spec nueva abre su Pull
Request contra `main` al crear la rama, no al terminar el trabajo — así los
pull requests generan Preview en Vercel y ejecutan validaciones durante todo
el desarrollo, no solo al final. Con un único agente operando el repo, el PR
no cumple función de revisión por pares: es el gate de CI/Preview y el punto
de reversión de la spec.

El cierre de una spec es el merge de ese PR a `main` — con merge commit
(`--no-ff`), nunca squash ni rebase, para que deshacer la spec completa sea
un único `git revert -m 1 <hash>` sin reconstruir commits. La rama no se
borra al mergear; queda como referencia hasta confirmar que el cierre fue
estable en el entorno donde importa (staging o producción, según el alcance).

`staging` integra pruebas compartidas cuando se necesitan. Producción se
promueve desde una versión verificada y requiere aprobación manual para
migraciones o cambios del VPS.

## Governance

Esta constitución prevalece sobre decisiones ad hoc de los agentes. Una
excepción debe quedar documentada en la spec y su plan. Los cambios de principios
requieren actualizar versión, fecha y artefactos afectados.

### VIII. Documentación como parte del cambio
Todo cambio de plataforma, worker, Kestra, Supabase, CI o tooling propio DEBE
actualizar en el mismo cambio una spec, una guía en `docs/`, esta constitución,
`AGENTS.md` o `CLAUDE.md`. El control automatizado `pnpm docs:check` DEBE correr
en CI para impedir que el código evolucione sin una decisión o contrato escrito.

**Version**: 1.7.0 | **Ratified**: 2026-09-06 | **Last Amended**: 2026-10-12
