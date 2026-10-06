# Adoptar el Ciclo de Ejecuciones en un producto derivado

Guía de proceso para traer la capacidad de la spec 016 a un producto que ya
existe (US3/FR-011). Contrato técnico:
`specs/016-ciclo-ejecuciones-workers/contracts/adopcion-reconciliacion.md`.

## 0. Prerrequisitos

El producto conserva los mecanismos del template que esta capacidad
reutiliza: organizaciones, `conexiones`, RLS, roles `worker_<org>`, Vault y
rol `kestra_orquestacion` (specs 013/014). Si el fork modificó alguno,
reconciliarlo primero — las funciones nuevas no calzan sin ellos.

## 1. Comparar antes de migrar

En el Supabase local del producto, relevar:

- ¿Existe una tabla propia de historial/ejecuciones? Anotar nombre y
  columnas y mapearlas a `capacidades_ejecucion` / `ejecuciones_worker`
  (`specs/016-ciclo-ejecuciones-workers/data-model.md`). Si los nombres o
  firmas no coinciden, el mapeo queda documentado acá abajo: **no hay
  renombre automático** (FR-011).
- ¿Cómo guarda evidencia hoy (Storage, disco del worker, nada)? Definir el
  mapeo a `evidencias-ejecuciones/<organizacion_id>/<capacidad>/
  <ejecucion_id>/`.
- ¿Sus flows llaman ya a `iniciar`/`cerrar` con otra firma? Adaptar el orden
  de llamadas al contrato, sin tocar la lógica de dominio del flow.

## 2. Migrar (solo aditivo)

1. Copiar `supabase/migrations/20260920000000_ciclo_ejecuciones_workers.sql`
   al producto tal cual.
2. Ejecutar las pruebas: `pnpm test` (incluye
   `supabase/tests/database/ciclo_ejecuciones_workers.test.sql`).
3. Registrar la versión de origen:
   `select registrar_adopcion_ciclo('016');`
4. Verificar: `select version from adopciones_template;` y cero
   tablas/historiales duplicados (SC-005).

## 3. Reglas de reconciliación

- Permitido: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`,
  backfill de `tiempo_max_seg` / `habilitada`, creación del bucket si falta,
  grants a roles `worker_*` ya existentes (mismo `format(...)` de la
  migración).
- Prohibido en el mismo PR: `DROP`/`RENAME` de columnas o tablas, borrado
  de historial, traslado de automatizaciones o tablas de dominio al template
  (FR-011, Technology Gates).
- La tabla de dominio del producto no se toca: ni se migra, ni se renombra,
  ni se mueve al template.

## 3.1 Despacho durable (spec 019)

Cuando el producto adopte la outbox de ejecuciones, debe crear la orden en la
misma transacción que la ejecución y hacer que Kestra la reclame mediante el
contrato de `specs/019-outbox-ejecuciones/contracts/despacho-outbox.md`.
No debe conservar ni crear un trigger SQL que envíe HTTP, use `pg_net` o lea
una URL de webhook para despachar un worker. La primera adopción se valida con
un disparo manual recuperable antes de migrar schedules.

## 3.2 Observabilidad y evidencia visual (`worker-execution-cycle` 1.1.0)

Spec `specs/20260925-133820-observabilidad-workers-navegador`. Contrato
normativo en `workers/CONTRATO.md` ("Observabilidad y evidencia visual").

1. **Workers**: emitir eventos JSON por etapa en stdout con `etapa`,
   `estado` (`iniciada|completada|fallida|omitida`), `timestamp` (ISO UTC),
   `ejecucion` (`EJECUCION_ID` o `KESTRA_EJECUCION_ID`) y `mensaje`. Con
   `EVIDENCIA_VISUAL=true` y `EVIDENCIA_DIR`, capturar solo hitos en esa
   carpeta como `<AAAAMMDDTHHMMSSmmmZ>-<etapa>.png`. Un fallo de captura emite
   `evidencia/fallida` en stdout (nunca en stderr) y no cambia el resultado.
   El worker no lee `EVIDENCIA_RETENCION_DIAS` ni borra evidencia. Los
   nombres de etapa (y datos extra del evento) son del producto.
2. **Flows**: traer los cambios de `plantilla-generico.yml` y
   `plantilla-dedicado.yml` a cada flow concreto copiado de ellas: input
   `evidencia_visual`, preparación de carpeta antes de `docker run`,
   `KESTRA_EJECUCION_ID`, `EVIDENCIA_VISUAL`, `"$@"`, `publicar_evidencia`
   en el `finally` de la secuencia de despacho y `publicar_logs` en el
   `finally` del flow. Copiar `limpieza-evidencia.yml` con el namespace
   del producto (su input `namespace` es el prefijo que purga).
3. **Kestra**: definir por entorno `EVIDENCIA_VISUAL` (default `false`),
   `EVIDENCIA_RETENCION_DIAS` (default `30`) y `EVIDENCIA_DIR_HOST` (default
   `/var/lib/automation-platform/evidencia`) como en
   `infra/kestra/compose.yaml`.
4. **Hosts de despacho** (solo si se habilita evidencia): crear
   `EVIDENCIA_DIR_HOST` con dueño el usuario SSH de despacho y permisos
   `0700`, en la misma ruta absoluta que ve el daemon Docker. Sin espacios en
   la ruta.
5. **Regla de almacenamiento**: ningún flow bajo el prefijo que purga la
   limpieza guarda datos de negocio en el almacenamiento interno de Kestra;
   la limpieza borra todo ese almacenamiento vencido (capturas y logs
   publicados), nunca ejecuciones, logs, métricas ni Supabase. La evidencia
   de auditoría del bucket `evidencias-ejecuciones` no es evidencia visual.
6. **Validar** con una ejecución real equivalente a
   `pnpm test:kestra:evidencia:e2e` (capturas en éxito y en error, fallo de
   captura sin cambio de estado, limpieza idempotente).

Diferencias con el contrato de origen (README de un producto derivado): se
fijan los campos del evento, la ubicación de capturas la monta la plataforma
y la retención deja de ser responsabilidad del worker.

## 3.3 Fallas no reintentables (`worker-execution-cycle` 1.2.0)

Bug `.specify/bugs/reintentos-credencial-invalida`. Contrato normativo en
`workers/CONTRATO.md` ("Códigos de salida y reintentos" y "Ejecución en
curso antes de actuar"). Sin esto, el `retry` de `despacho_ssh` relanzaba el
worker (y el login contra el sistema externo) hasta 3 veces ante una
credencial inválida.

1. **Migración**: aplicar
   `supabase/migrations/20260925200000_ejecucion_en_curso_worker.sql`
   (aditiva: `private.ejecucion_worker_en_curso` con grant a
   `workers_orquestacion`, que alcanza a los roles `worker_*` existentes, y
   `private.resolver_resultado_despacho` con grant a `kestra_orquestacion`).
2. **Workers**: salir con `78` y `<MOTIVO>:<id>` en stderr ante una falla no
   reintentable (credencial inválida, ejecución no en curso, `YA_EN_CURSO`,
   capacidad no habilitada, configuración inválida). Con `EJECUCION_ID`,
   llamar a `private.ejecucion_worker_en_curso` antes de abrir el navegador
   o hacer login; si devuelve `false`, salir `78` con
   `EJECUCION_NO_EN_CURSO:<ejecucion_id>` sin cerrar la ejecución.
3. **Flows**: traer a cada flow concreto copiado de las plantillas la
   captura de `WORKER_STDERR`/`WORKER_RC` alrededor de `docker run`, el
   bloque que publica el output `no_reintentable` y el reemplazo de
   `marcar_conexion_activa` por `resolver_resultado_despacho` (misma
   posición, sin `retry`). El flow dedicado agrega el input opcional
   `ejecucion_id` → `EJECUCION_ID`. No agregar una tarea `Fail`/`Assert`
   aparte a la secuencia del flow genérico: con Kestra 1.3.35, sumar tareas
   (o referencias `outputs.<tarea>[parent.taskrun.value]`) a esa secuencia
   dentro del `ForEach` agota el heap de Kestra después de guardar el flow.
   Mientras un worker no adopte el código `78`, la marca
   `CREDENCIAL_INVALIDA:` en stderr ya evita el reintento.
4. **Outbox**: si el flow resuelve una orden de spec 019, una falla con
   `no_reintentable` se resuelve con `agotar`, nunca con `liberar`.
5. **Validar** con una ejecución real equivalente a
   `pnpm test:kestra:reintentos:e2e`: credencial inválida con un solo
   lanzamiento del worker, reintento técnico posterior a un cierre sin nuevo
   login y falla técnica con sus 3 intentos.

### Limitaciones conocidas del flow genérico (Kestra 1.3.35)

Detalle y mediciones en
`.specify/bugs/reintentos-credencial-invalida/fix.md`.

- **Memoria al guardar.** Publicar el genérico puede hacer que Kestra pase
  de ~1,5 a ~8,5 GB de heap después de responder el guardado, termine en
  `OutOfMemoryError` y se reinicie. Sumar una tarea a la secuencia por
  organización (dentro del `ForEach`, con `finally` y `errors`), aunque
  sea un `debug.Return`, o más referencias
  `outputs.<tarea>[parent.taskrun.value]` lo provocó en 7 de 7 intentos;
  la estructura actual, en 2 de 8. El flow dedicado no lo sufre. Al adaptar
  el genérico, no agregar tareas a esa secuencia y validar la publicación en
  el Kestra de desarrollo antes de desplegar.
- **Clasificación de fallas.** En el genérico, `clasificar_y_alertar` lee
  `outputs.detectar_tipo_falla.value` sin el índice de la iteración y falla en
  runtime: una falla de una organización no se alerta ni marca la conexión
  (`credencial_invalida`). El dedicado clasifica bien. Corregir el índice
  dispara la limitación de memoria anterior, así que se trata como un bug
  propio; hasta entonces, las organizaciones que necesiten alerta de
  credencial deben despacharse con el flow dedicado.

## 3.4 Conexiones en `credencial_invalida` o `error` (`worker-execution-cycle` 1.3.0)

Bug `.specify/bugs/conexion-invalida-trabada`; transiciones en
`specs/013-orquestacion-multi-organizacion/data-model.md` (FR-013). Requiere
haber adoptado la 1.2.0 (fallas no reintentables): cada camino de abajo es un
único intento de login.

1. **Migración**: aplicar
   `supabase/migrations/20260925210000_destrabar_conexion_invalida.sql`
   (aditiva: `create or replace` de `iniciar_ejecucion_worker`,
   `organizaciones_activas_para_conector` y `actualizar_credencial_conexion`).
   Si el producto redefinió alguna de esas funciones, portar la regla en vez
   de pisarla.
2. **Reglas**: `error` no bloquea ningún origen ni el genérico.
   `credencial_invalida` la saltea el genérico y la rechaza
   `iniciar_ejecucion_worker` con `CONEXION_CREDENCIAL_INVALIDA`, salvo un
   disparo `manual` de un administrador autenticado; actualizar la credencial
   la devuelve a `activa`. La ejecución exitosa la deja `activa` como siempre.
3. **Refine**: el error `CONEXION_CREDENCIAL_INVALIDA` es nuevo; mostrarlo
   como "actualizá la credencial o iniciá la ejecución a mano", no como
   capacidad deshabilitada. Ya no hace falta `private.marcar_conexion_activa`
   a mano para destrabar una conexión.
4. **Validar** con una ejecución real equivalente a
   `pnpm test:kestra:conexion-trabada:e2e`.

## 3.5 Normalización de datos (`worker-execution-cycle` 1.3.1)

Solo documentación — no hay migración ni cambio de contrato de ejecución,
agrega la sección "Normalización de datos" a `workers/CONTRATO.md`. Regla:
todo monto o fecha que un worker extrae de un sistema externo se convierte a
su tipo real (`numeric`/`date`) antes de guardarlo, nunca texto crudo salvo
en un campo `datos_originales` dedicado a conservar la fuente. Nada que
migrar para adoptarla — si algún conector existente todavía guarda un monto
como texto en una columna de primera clase (no en `datos_originales`), es
candidato a corregir cuando se lo toque, no una migración urgente.

## 4. Mapeo de este producto

### Versión de outbox adoptable

La versión adoptable actual es **019**. La función de reclamo devuelve el
identificador de despacho, ejecución, conexión, capacidad, detalle, intento y
vencimiento; el flow debe conservar `despacho_id` + `intento` y pasarlos a
`private.resolver_despacho_ejecucion` para confirmar, liberar o agotar. No se
puede confirmar un intento vencido o reemplazado.

_(Completar al adoptar: tabla propia → tabla del template, columna por
columna, y decisión de evidencia.)_

- Historial propio: —
- Capacidades propias → `capacidades_ejecucion`: —
- Evidencia actual → bucket `evidencias-ejecuciones`: —
- Diferencias incompatibles y cómo se resolvieron sin renombre automático: —
