# Contrato operativo de workers

Un worker es un proceso puntual, independiente y ejecutable en un contenedor
Linux `amd64`. Puede correr sobre un host Linux o sobre Windows con un runtime
de contenedores Linux.

## Paquete mínimo

Cada carpeta `workers/<nombre>/` debe declarar `@workers/<nombre>` y los scripts
`build`, `lint`, `test` y `start`. El entrypoint vive en `src/index.ts` y debe
terminar con código cero en éxito y distinto de cero en error.

## Entrada y salida

El worker recibe `ORGANIZACION_ID`, `SISTEMA_EXTERNO`, `CONEXION_ID` y los
parámetros propios del conector. `EJECUCION_ID` se agrega cuando el flow lo
necesita para idempotencia.

Nunca recibe una credencial en la línea de comandos ni en la imagen. El acceso
se resuelve durante el runtime con el mecanismo de Vault existente.

Si la credencial es inválida, stderr solo contiene
`CREDENCIAL_INVALIDA:<conexion_id>`. Los demás errores se sanitizan y no deben
incluir tokens, cookies, archivos ni secretos.

## Normalización de datos

Todo valor numérico o de fecha que un worker extrae de un sistema externo se
convierte a su tipo real antes de guardarlo (`numeric` para montos, parseando
el formato local del sistema de origen a un número; `date`/`timestamptz` para
fechas) — nunca queda como texto crudo tal como vino del scraping o de la
respuesta de una API, salvo en un campo `datos_originales` dedicado a
conservar la fuente sin tocar. Un monto guardado como texto ("1.234,56") no se
puede sumar, filtrar ni cruzar contra otra tabla; guardado como número sí —
esta regla existe para que los datos que trae un worker se puedan reportar y
cruzar más adelante, no solo mostrarse tal cual.

## Códigos de salida y reintentos

| Código | Significado | ¿El flow reintenta? |
|---|---|---|
| `0` | Éxito. | — |
| `78` | Falla **no reintentable** (`EX_CONFIG` de `sysexits.h`). | No. |
| Otro distinto de cero | Falla técnica, potencialmente transitoria. | Sí, hasta 3 intentos. |

Con `78`, la última línea de stderr que empieza con un motivo en mayúsculas
es `<MOTIVO>:<id>`. Motivos no reintentables:

| Motivo | Cuándo |
|---|---|
| `CREDENCIAL_INVALIDA:<conexion_id>` | El sistema externo rechazó la credencial. Reintentar puede bloquear la cuenta o, en sistemas de sesión única, expulsar la sesión anterior y activar el anti-bot. |
| `EJECUCION_NO_EN_CURSO:<ejecucion_id>` | La ejecución recibida ya está cerrada (`exitosa`, `fallida`, `timeout`) o venció su `tiempo_max_seg`. Ver abajo. |
| `YA_EN_CURSO:<conexion_id>` | Otra ejecución de la misma capacidad sigue activa. |
| `CAPACIDAD_NO_HABILITADA:<conexion_id>` | La capacidad o la conexión no están habilitadas para ejecutar. |
| `CONFIGURACION_INVALIDA:<conexion_id>` | Falta o es inválida una variable de entrada del worker. |

Un motivo desconocido con `78` igual corta los reintentos y se informa como
`NO_REINTENTABLE`. Las plantillas de Kestra también tratan como no
reintentable cualquier stderr con `CREDENCIAL_INVALIDA:` aunque el código no
sea `78`, para cubrir workers anteriores a este contrato; un worker nuevo usa
`78` siempre.

En el flow, `despacho_ssh` conserva el código técnico para su `retry`; ante
una falla no reintentable termina en `0` con el output `no_reintentable` y la
única tarea posterior, `resolver_resultado_despacho`
(`private.resolver_resultado_despacho`), falla con `<MOTIVO>:<conexion_id>`
sin reintento. El handler de errores la clasifica igual que antes (credencial
o técnica) y la conexión no se marca activa. Un flow con outbox (spec 019)
resuelve esa orden con `agotar`, nunca con `liberar`: liberar volvería a
despachar el worker.

## Ejecución en curso antes de actuar

Cuando el worker recibe `EJECUCION_ID` (disparo manual u outbox), antes de
abrir un navegador, iniciar sesión o contactar al sistema externo llama a
`private.ejecucion_worker_en_curso(<ejecucion_id>)` con su propio rol
`worker_*`. Si devuelve `false`, no hace nada más: emite el evento
`{"etapa":"inicio","estado":"fallida",...}`, escribe
`EJECUCION_NO_EN_CURSO:<ejecucion_id>` en stderr y sale con `78`. No cierra la
ejecución (ya está cerrada o la cerrará el timeout perezoso). Así un
reintento del despacho posterior a un cierre no repite el login. Si la
consulta misma falla (base caída, red), es una falla técnica: el worker sale
con otro código distinto de cero y el flow la reintenta; nunca la trata como
`EJECUCION_NO_EN_CURSO`.

La función es de solo lectura, rechaza (`NO_AUTORIZADO`) a cualquier llamante
que no sea un worker y las ejecuciones de otra organización, y devuelve
`false` para una ejecución `en_curso` cuyo `tiempo_max_seg` ya venció. Un
worker que se autoregistra con `iniciar_ejecucion_worker` (disparo
programado) ya parte de una ejecución vigente.

## Red y runtime

La red es deny-by-default. Cada worker documenta los dominios de Supabase, Vault
y del proveedor externo que necesita; cualquier destino adicional debe fallar.
El lanzador aplica usuario no root, límites de CPU/memoria, timeout, filesystem
temporal y capabilities mínimas.

## Publicación

El pipeline descubre workers válidos, construye desde la raíz del monorepo y
publica una imagen por integración. Kestra consume el digest exacto, nunca un
tag mutable como referencia persistida.

## Runtime endurecido

Kestra debe usar `--read-only`, `/tmp` efímero, `--cap-drop=ALL`,
`no-new-privileges`, límites CPU/memoria y la red `worker-deny-by-default`;
nunca monta el socket Docker.

## Observabilidad y evidencia visual

Contrato genérico para workers que automatizan un navegador (u otro proceso
con etapas); lo introdujo la spec
`20260925-133820-observabilidad-workers-navegador`. No define etapas de
negocio: cada producto nombra las suyas.

### Eventos por etapa

Cada cambio de etapa se emite en stdout como una línea JSON:

```json
{"etapa":"sesion","estado":"completada","timestamp":"2026-09-25T13:38:20.000Z","ejecucion":"<id>","mensaje":"Sesión iniciada"}
```

| Campo | Regla |
|---|---|
| `etapa` | `^[a-z][a-z0-9_-]{0,39}$`; nombre libre del producto. `evidencia` está reservada para fallos de captura. |
| `estado` | `iniciada`, `completada`, `fallida` u `omitida`. |
| `timestamp` | ISO-8601 en UTC con `Z`. |
| `ejecucion` | `EJECUCION_ID` si el flow lo envía; si no, `KESTRA_EJECUCION_ID`. |
| `mensaje` | Opcional, hasta 500 caracteres, sanitizado. |

Un producto puede agregar campos propios al evento (por ejemplo, cómo se
resolvió una sesión) si respetan la sanitización; la plataforma no los
interpreta.

Kestra conserva esas líneas en los logs de la tarea de despacho y las
plantillas publican esos logs como output (`publicar_logs`). La última etapa
`completada` antes de una `fallida` es la última etapa completada. Una línea
que no respeta el formato queda como log común; no rompe la ejecución.

### Sanitización

Ningún evento, log, nombre de archivo ni captura puede contener credenciales,
tokens, cookies, contenido de `localStorage`/`sessionStorage`, encabezados de
autenticación ni URLs con secretos. stderr sigue reservado a errores
sanitizados (`CREDENCIAL_INVALIDA:<conexion_id>` u otro motivo sin secretos);
cualquier escritura en stderr marca la tarea con advertencia.

### Evidencia visual

- `EVIDENCIA_VISUAL` (`false` por defecto) la configura la plataforma por
  entorno en Kestra; el input `evidencia_visual` de las plantillas la
  reemplaza para una ejecución puntual. El despacho la transmite al worker.
- Con evidencia habilitada, el despacho monta una carpeta por ejecución y
  organización en `/evidencia` y envía `EVIDENCIA_DIR=/evidencia`: es la
  única escritura adicional al rootfs de solo lectura. Sin `EVIDENCIA_DIR` o
  con `EVIDENCIA_VISUAL=false`, el worker no captura.
- Se capturan solo hitos (por ejemplo, tras iniciar sesión, antes de una
  descarga o al fallar), nunca por interacción ni por registro procesado, y
  como máximo 50 por despacho. Nombre: `<AAAAMMDDTHHMMSSmmmZ>-<etapa>.png`.
- Las capturas no se toman con campos de credencial visibles y nunca
  contienen ni reemplazan datos de negocio: archivos descargados, datos
  importados y auditoría siguen su propio camino.
- Si una captura falla, el worker emite
  `{"etapa":"evidencia","estado":"fallida",...}` y sigue con el mismo
  resultado de negocio.
- La plataforma publica las capturas como outputs de la ejecución
  (`publicar_evidencia`), las borra del host y las purga al superar
  `EVIDENCIA_RETENCION_DIAS` (30 por defecto) con el flow
  `limpieza-evidencia`. El worker no lee esa variable ni borra evidencia.
