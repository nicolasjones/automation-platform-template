# Research: CI/CD staging → producción para migraciones, VPS, flows y dashboards

**Feature**: `specs/20261003-105444-cicd-staging-produccion/spec.md`

Este research resuelve, a nivel técnico, las dos preguntas que el assessment dejó abiertas (conectividad del runner, existencia de proyectos cloud) y las decisiones de diseño necesarias para implementar las cuatro piezas del alcance, reutilizando al máximo el código y los patrones ya existentes en el repo.

## 1. Conectividad del runner self-hosted hacia el VPS real

- **Decision**: El job de deploy a VPS no necesita que el runner *sea* el VPS ni que esté en la misma red local. Controla el Docker del VPS remotamente seteando `DOCKER_HOST=ssh://<usuario>@<host>` antes de invocar `pnpm deploy:vps -- <entorno>` — `scripts/deploy-vps.mjs` ya invoca el binario `docker` local vía `operaciones.mjs#run()`, que hereda `process.env` sin cambios de código; el CLI de Docker ya soporta `DOCKER_HOST=ssh://...` de forma nativa.
- **Rationale**: Reutiliza exactamente el patrón de acceso que ya usa el repo para despacho remoto — `docs/deployment.md` documenta una clave SSH privada en Base64 (`SECRET_ORQUESTACION_SSH_PRIVATE_KEY`, spec 014) para que Kestra despache workers a servidores de organización por SSH. El mismo mecanismo (clave privada como secret, decodificada a un archivo temporal al iniciar el job) resuelve la conectividad del runner sin exigir que el runner migre de máquina ni que se abra ningún puerto nuevo del VPS más allá del SSH que ya usa el operador para la copia manual de hoy.
- **Alternatives considered**: (a) Migrar el runner self-hosted para que corra físicamente en el VPS — descartado: acopla el CI a la disponibilidad del VPS y contradice que hoy el runner es compartido entre varios productos derivados en la máquina de desarrollo (`docs/deployment.md`, sección de réplicas). (b) Abrir la API de Docker por TCP con TLS en el VPS — descartado: mayor superficie de ataque que SSH, y el VPS ya tiene `sshd` configurado (`docs/deployment.md`, "Servidores de organización").
- **Resuelve**: la pregunta abierta de `spec.md` sobre conectividad — no requiere aprovisionar nada nuevo en el VPS (ya tiene `sshd`); sólo requiere agregar el cliente SSH a la imagen del runner (`infra/runner/Dockerfile` no lo instala hoy) y una clave SSH por entorno como secret.
- **Corrección (T025, validación real)**: a diferencia de `SECRET_ORQUESTACION_SSH_PRIVATE_KEY` (spec 014), `VPS_SSH_PRIVATE_KEY` se guarda como texto plano PEM, **sin** Base64 — los secrets de GitHub Actions ya soportan multilínea nativamente, y el intento original de `base64 -d` falló contra la clave real con `base64: invalid input` (el secret configurado era el PEM crudo, no una versión codificada). Se corrigió el workflow para escribir el secret directo al archivo en vez de decodificarlo.

## 2. Credenciales del deploy de infraestructura sin archivo `.env` en el VPS

- **Decision**: El workflow sintetiza un archivo `.env.<entorno>` transitorio en el **workspace efímero del job de CI** (no en el VPS) a partir de los secrets del GitHub Environment correspondiente, justo antes de invocar `pnpm deploy:vps -- <entorno>`, y lo descarta al terminar el job. `scripts/deploy-vps.mjs` no necesita reescritura: sigue recibiendo un `--env-file` válido, solo que ya no vive en el filesystem persistente del VPS ni se edita a mano por SSH.
- **Rationale**: Cumple el requisito (FR-006) con el cambio de superficie mínimo — cero reescritura del script ya probado, cero riesgo de romper el flujo manual que algún operador todavía use localmente contra un VPS de prueba. El archivo nunca se commitea (el workspace del runner se descarta por job) y nunca se persiste en el disco del VPS.
- **Alternatives considered**: Reescribir `deploy-vps.mjs` para leer cada variable individualmente desde `process.env` y generar el `--env-file` internamente — descartado por ahora: agrega superficie de parsing/validación al script sin beneficio real sobre sintetizar el archivo en el step del workflow, que ya es el patrón estándar de GitHub Actions para "env desde secrets". Queda documentado como alternativa si en el futuro se necesita invocar el script fuera de un workflow de GitHub Actions.
- **Corrección (T025, validación real)**: el nombre `VPS_DEPLOY_ENV` se confundió con "elegir el entorno" (`staging`/`production`) en vez de "el contenido del `.env`" — se configuró el secret con el valor literal `staging`. Dos consecuencias: (1) `docker compose` no falla fuerte con un `.env` mal formado (variables faltantes quedan vacías silenciosamente), así que el error real aparece recién en `build`/`up`, no en `config`; (2) como el valor del secret coincidía con una palabra común (`staging`), GitHub enmascaró esa palabra en *todo* el log del job, incluyendo texto estático no relacionado — lección general: evitar que un secret tenga como valor una palabra que también aparezca en mensajes de error o nombres de pasos. Mitigado agregando una validación explícita (cuenta de líneas `CLAVE=valor`) antes de usar el archivo, que falla con un mensaje claro sin depender de contenido enmascarable.
- **Corrección 2 (T025, validación real contra el VPS real)**: con las credenciales ya corregidas, Kestra se desplegó exitosamente contra el VPS real de staging, pero Superset falló con `IsADirectoryError: [Errno 21] Is a directory: '/app/pythonpath/superset_config.py'`. Causa: `scripts/deploy-vps.mjs` no fijaba `--project-directory` al invocar `docker compose`, así que qué directorio ancla las rutas relativas dentro de cada `compose.yaml` (p. ej. `./superset_config.py` en `infra/superset/compose.yaml`) dependía del comportamiento default de la versión de Docker Compose instalada — distinto entre Compose v5.4.0 (verificado localmente, resuelve bien) y la versión del runner self-hosted (resolvía mal, Docker creó un directorio vacío en la ruta inexistente y lo bind-monteó). Corregido fijando `--project-directory infra/<producto>` explícitamente — elimina la ambigüedad entre versiones de Compose, sin afectar a Kestra/Nango/Playwright (ninguno de los tres usa bind mounts relativos, solo volúmenes nombrados o montajes absolutos).

## 3. Migraciones de Supabase contra proyectos cloud

- **Decision**: Nuevo script `scripts/migrar-supabase-cloud.mjs`, que ejecuta `supabase db push --db-url "$SUPABASE_DB_URL"` contra la cadena de conexión Postgres del proyecto cloud del entorno (un secret por entorno: `SUPABASE_DB_URL` dentro del GitHub Environment de staging y, por separado, dentro del de producción), sin usar `supabase link` ni un access token de cuenta.
- **Rationale**: Una cadena de conexión acotada a la base de ese proyecto es menos privilegio que un Personal/Service Access Token de la cuenta de Supabase (que puede administrar todos los proyectos de la organización) — alineado con el principio de aislamiento del propio repo. `supabase db push --db-url` no requiere `supabase link` (que persiste estado local de "proyecto vinculado"), lo que mantiene el job sin estado entre corridas.
- **Alternatives considered**: `supabase link --project-ref <ref>` + `supabase db push` autenticado con `SUPABASE_ACCESS_TOKEN` — descartado como opción primaria por el alcance más amplio del token (administra toda la cuenta); documentar como alternativa si el DB password rota con demasiada frecuencia como para mantenerlo como secret estático.

## 4. Publicación de flows de Kestra dentro del mismo pipeline

- **Decision**: Cero cambios de código en `infra/kestra/desplegar-flow.mjs` — ya acepta credenciales por variable de entorno (`KESTRA_BASIC_AUTH_USERNAME`/`PASSWORD`) y por flags (`--kestra-url`). El workflow nuevo solo necesita invocarlo dos veces (staging, producción) con el mismo gate, pasando la URL y las credenciales del Environment correspondiente.
- **Rationale**: Es, de las cuatro piezas, la que menos trabajo de implementación requiere — el research de la fase de assessment ya identificó que este script es el más cercano a ser CI-friendly.
- **Alternatives considered**: ninguna — no hay decisión de diseño pendiente aquí, solo wiring.

## 5. Wrapper genérico de import de dashboards de Superset

- **Decision**: Nuevo script `infra/superset/importar-dashboards.mjs`, mismo patrón que `desplegar-flow.mjs` (fetch directo a la API REST de Superset, sin SDK), que recibe `--source <ruta-al-paquete-exportado>` y `--entorno <staging|production>`, resuelve la URL y credenciales del Superset de ese entorno desde variables de entorno, y llama al endpoint de import de Superset.
- **Rationale**: Reutiliza la arquitectura "script Node + fetch + credenciales por entorno" ya validada por `desplegar-flow.mjs`, en vez de introducir una dependencia nueva (SDK de Superset o su CLI empaquetada en Python). Un detalle técnico corrige una imprecisión menor de FR-010: Superset no exporta un YAML suelto por dashboard, exporta un paquete (ZIP) que contiene el YAML del dashboard junto con los YAML de los datasets/bases que usa — el wrapper documenta y acepta ese formato de paquete, consistente con "YAMLs de dashboards" en sentido amplio (son YAML, empaquetados).
- **Alternatives considered**: Empaquetar el CLI `superset import-dashboards` (Python) dentro del runner — descartado: agrega una dependencia de Python al runner (hoy Node/Docker CLI únicamente) solo para esta pieza, cuando la API REST cubre el mismo caso sin dependencias nuevas.
- **Confirma** (research de assessment): no hay ningún caso de uso real contra el que probar el wrapper hoy — se valida con un paquete de ejemplo/sintético durante la implementación, tal como ya quedó documentado en `spec.md` → Assumptions.

## 6. Mecanismo de gate compartido (staging → producción)

- **Decision (original, intake)**: Cada uno de los tres workflows automáticos (migraciones, deploy de infraestructura, publicación de flows) define dos jobs en el mismo archivo: `staging` (dispara en push, sin gate) y `production` (`needs: staging`, `environment: <nombre>-production` con required reviewers configurado en GitHub). No se introduce ninguna Action ni script de aprobación custom.
- **Rationale (original)**: Ya hay precedente exacto en el propio repo — `.github/workflows/worker-images.yml` ya usa `environment: worker-images-production`, aunque en un solo job (no necesita gate de dos fases porque no hay "staging" de una imagen). Esta spec generaliza ese mismo mecanismo a un segundo job con `needs`.
- **Alternatives considered (original)**: ninguna — era una decisión ya tomada por el coordinador en el intake (no rediseñar).

### Revisión (post-implementación, decisión del coordinador — ver `tasks.md` T027)

- **Hallazgo**: la regla de protección "required reviewers" en GitHub Environments requiere un plan de pago (Team/Enterprise) para repositorios privados, o que el repositorio sea público. Verificado contra la API real: tanto el fork (`nicolasjones/automation-platform-template`) como el repo de la organización (`Agenmatica/automation-platform-template`) estaban en plan Free y el intento de crear la regla devolvía `422`. Ambos repos se hicieron públicos para desbloquear el PR; aun así, el coordinador decidió no depender de required reviewers como mecanismo central — ver próxima decisión.
- **Decision (revisada)**: `production` deja de usar `needs: staging` + required reviewers. Pasa a dispararse exclusivamente por `workflow_dispatch` (alguien entra a la pestaña Actions y lo corre a propósito). `staging` sigue disparando solo por `push`. Los GitHub Environments se conservan — siguen separando los secrets de cada entorno, que no depende de ninguna regla de pago — solo se cae el campo de reviewers requeridos.
- **Rationale (revisada)**: es la alternativa sin costo que preserva la intención original (producción no se despliega sola; alguien tiene que decidirlo activamente) sin depender de una función de plan de pago. No requiere ninguna Action ni script custom — `workflow_dispatch` es un trigger nativo de GitHub Actions.
- **Alternatives considered (revisada)**: (a) pagar GitHub Team/Enterprise para mantener required reviewers — descartado por costo; (b) un script/Action de aprobación custom (p. ej. comentario en un issue) — descartado, contradice la regla del propio `CLAUDE.md`/intake de "nativo de GitHub, no hay que construir nada custom"; `workflow_dispatch` sigue siendo 100% nativo.
- **Trade-off aceptado**: sin `needs`, nada impide disparar `production` para un commit cuyo `staging` nunca corrió o falló — la responsabilidad de verificar eso antes de tocar "Run workflow" queda en la persona que lo dispara, no en el YAML. Documentado en `contracts/workflow-gate.md` → Edge cases.

## 7. Documentación y catálogo de capacidades

- **Decision**: Esta spec agrega/actualiza entradas en `template-capabilities.json` (nueva capacidad, p. ej. `staging-production-gate`, cubriendo los tres workflows nuevos + el wrapper de Superset + los scripts nuevos/ampliados) y un nuevo `docs/adoptar-cicd-staging-produccion.md`, siguiendo el patrón de `docs/adoptar-*.md` ya existente. `docs/deployment.md` se actualiza para reflejar que migraciones, deploy de infraestructura y publicación de flows ya no son pasos manuales.
- **Rationale**: Exigido por la Constitución (Principio VII) y por `pnpm docs:check` en CI — ya validado como gate obligatorio en `.github/workflows/validate.yml`.
- **Alternatives considered**: ninguna — es una convención ya establecida, no una decisión de esta spec.

## Resumen de secrets nuevos por GitHub Environment (staging / production)

| Secret | Usado por | Reemplaza |
|---|---|---|
| `SUPABASE_DB_URL` | `scripts/migrar-supabase-cloud.mjs` | Aplicación manual de migraciones |
| `VPS_SSH_PRIVATE_KEY` (texto plano PEM) | workflow de deploy de infraestructura (`DOCKER_HOST=ssh://...`) | Acceso SSH manual del operador |
| `VPS_DEPLOY_ENV` (bloque de variables, sintetizado a `.env.<entorno>` transitorio) | `scripts/deploy-vps.mjs` | `.env.<entorno>` persistente en el VPS |
| `KESTRA_BASIC_AUTH_USERNAME` / `KESTRA_BASIC_AUTH_PASSWORD` | `infra/kestra/desplegar-flow.mjs` | Variables de entorno locales del operador |
| `SUPERSET_URL` / `SUPERSET_USERNAME` / `SUPERSET_PASSWORD` | `infra/superset/importar-dashboards.mjs` | N/A (mecanismo nuevo) |

Todos documentados únicamente como claves en `.env.example` (sin valores reales), nunca commiteados — consistente con `CLAUDE.md`.
