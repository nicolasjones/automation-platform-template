# Research: Despachador por outbox con detalle opcional en Kestra

## Evidencia del producto derivado

Repo `estudio-contable-automation` (Nexo Contable), rama
`normalizar-esquema-supabase`:

- Commit `d180294` ("Agregar el flow cartera-clientes y despacharlo desde el
  outbox"): `infra/kestra/flows/despacho-outbox.yml` pasa de
  `"{{ fromJson(taskrun.value).detalle.periodo_desde }}"` a
  `"{{ fromJson(taskrun.value).detalle.periodo_desde ?? '' }}"` (ídem
  `periodo_hasta`), con el comentario: "Una capacidad sin período [...]
  encola detalle {}: sin el default, Pebble falla por la variable faltante y
  la orden nunca se despacha". `despacho-capacidad.yml` declara
  `periodo_desde`/`periodo_hasta` con `defaults: ""` y `required: false`.
- Commit `4e26180` ("Corregir los inputs de período de despacho-capacidad y
  documentar la corrida real"): Kestra 1.3.35 rechaza con 422 un input con
  default y `required: false`; quedan `required: true` con `defaults: ""`,
  probado publicándolo en el Kestra local.
- `docs/wiki/modulos/automatizaciones.md`, "Capacidades sin período en el
  outbox": describe el defecto, el arreglo y lo marca candidato a port-back.
- `docs/wiki/sistemas/kestra.md`, "Fragilidad del stack local
  (2026-10-04)": el contenedor de Kestra local no se había recreado con
  `ENV_KESTRA_ORQUESTACION_DB_USERNAME`; publicar desde `main` un flow con
  `envs.kestra_orquestacion_db_username` hizo fallar `despacho-outbox` cada
  minuto durante 11 minutos (``Unable to find
  `kestra_orquestacion_db_username` ``) sin reclamar órdenes. Consecuencia
  relacionada: el `despacho-outbox` publicado en local no tenía el `?? ''`, y
  un disparo sin período dejaba la orden `reclamada` hasta el vencimiento del
  lease (1 h).
- Commit `92bf38a` ("Corregir usuario JDBC del pooler de Supabase..."):
  origen de `envs.kestra_orquestacion_db_username` (Supavisor exige
  `<rol>.<project_ref>`).
- `docs/wiki/portback-template.md`, candidatos de identidad-clientes-dominio
  (commit `80407ad`).

## Hallazgo: el template no tiene el despachador

`infra/kestra/flows/` del template tiene `alertas.yml`,
`limpieza-evidencia.yml`, `plantilla-dedicado.yml`, `plantilla-generico.yml`
y `respaldo-postgres.yml`. El contrato del outbox
(`specs/019-outbox-ejecuciones/contracts/despacho-outbox.md`) y un comentario
en las plantillas describen cómo reclamar, pero no hay flow que lo haga. El
producto construyó `despacho-outbox.yml` (label `capa: producto`, commit
`2e8d0b9` "Adoptar despachador outbox en Kestra") y `despacho-capacidad.yml`.

Fuera de los `cases` de negocio (Libro Mayor, IVA, cartera de clientes), los
dos flows son mecanismo puro: reclamar, iterar, derivar por
`clave_capacidad`, confirmar o liberar con motivo sanitizado.

## Decisión 1: traer el despachador genérico, no solo el parche

**Decision**: el template incorpora `despacho-outbox.yml` y
`despacho-capacidad.yml` sin `cases` de negocio, con un `case` de ejemplo y
el `default` `CAPACIDAD_SIN_FLOW`.

**Rationale**: el parche no tiene dónde aplicarse en el template. Y sin el
despachador en el template, el próximo producto lo reescribe desde el
comentario y repite el defecto (regla del `CLAUDE.md`: lo genérico va al
template).

**Alternatives considered**: solo documentar la regla en el contrato
(descartado: la regla ya era implícita y el producto la rompió igual); traer
solo una verificación estática (descartado: no hay flows del template que
verificar).

## Decisión 2: el `detalle` viaja entero; los campos son del producto

**Decision**: `despacho-outbox` pasa a `despacho-capacidad` el `detalle`
completo como un único input (`detalle`, con default `{}` y
`required: true`). Cada `case` lee lo que necesita con
`{{ inputs.detalle.<campo> ?? '' }}`.

**Rationale**: "período" es negocio del producto. Declararlo en el router
del template filtra negocio a la plataforma y obliga a tocar el router por
cada campo nuevo. Con el `detalle` entero, el router no cambia.

**Riesgo a verificar**: que Kestra 1.3.35 acepte un input `JSON` de un
subflow renderizado desde `fromJson(taskrun.value).detalle`. Si no, el
fallback es un input `STRING` con `toJson` en `despacho-outbox` y `fromJson`
en cada `case`. La tarea de implementación prueba la primera opción
publicando en el Kestra local y cae a la segunda si falla.

**Compatibilidad con el producto**: el producto puede conservar sus inputs
`periodo_desde`/`periodo_hasta` como extensión propia o migrar a leerlos del
`detalle`. Las dos opciones cumplen el contrato.

## Decisión 3: regla de inputs con default

**Decision**: todo input con `defaults` va `required: true`, y una
verificación estática lo fija para todos los flows del repo.

**Rationale**: Kestra 1.3.35 responde 422 en otro caso (commit `4e26180`). No
está en el contrato ni en los comentarios del template.

## Decisión 4: verificación de `envs.*` estática y al publicar

**Decision**: una función compartida extrae los `envs.<nombre>` de un flow y
verifica que `infra/kestra/compose.yaml` declare `ENV_<NOMBRE>`. Corre como
test en el CI para todos los flows del repo y como chequeo previo de
`infra/kestra/desplegar-flow.mjs` antes de llamar a la API.

**Rationale**: la fragilidad del producto ocurre cuando un flow espera una
variable que el contenedor no tiene. Kestra no expone por API las variables
de entorno del contenedor, así que lo verificable es que el repo sea
coherente. Lo demás (un contenedor viejo) se cubre en la guía: recrear el
contenedor al sumar una variable.

**Alternatives considered**: consultar al contenedor con `docker exec env`
desde `desplegar-flow.mjs` (descartado: acopla la publicación a Docker local
y no sirve contra el Kestra del VPS).

## Decisión 5: usuario JDBC literal

**Decision**: los flows nuevos usan `username: kestra_orquestacion`, como el
resto de los flows del template.

**Rationale**: parametrizar el usuario para el pooler (commit `92bf38a` del
producto) es otro port-back que cambia todos los flows del template; mezclarlo
acá rompe "una spec por capacidad". La verificación de la Decisión 4 ya
protege ese port-back cuando se haga.

## Cómo vuelve al producto

1. Adopción selectiva: el producto compara sus `despacho-outbox.yml` y
   `despacho-capacidad.yml` con los del template, conserva sus `cases` de
   negocio y adopta el paso del `detalle` entero (o documenta que conserva
   sus inputs de período). Trae la verificación estática y el chequeo de
   `desplegar-flow.mjs`.
2. `template-adoption.json`: sube `durable-execution-outbox` y
   `safe-kestra-flow-publication` a las versiones nuevas, con evidencia de la
   publicación en su Kestra local y una corrida de "Traer clientes" (capacidad
   sin período).
3. Log en `docs/wiki/sistemas/sincronizacion-template.md` y candidato marcado
   como "llevado" en `docs/wiki/portback-template.md`.

No es un `git merge upstream/main`: ese merge solo aplica a
`docs/roadmap-template.md`.
