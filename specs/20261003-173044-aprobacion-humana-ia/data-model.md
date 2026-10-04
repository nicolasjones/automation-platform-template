# Data Model: aprobación humana antes de completar una interacción

## `EstadoInteraccion` (extendido)

Gana un valor nuevo: `'esperando_aprobacion'`.

## `completarInteraccion` (extendida)

```ts
function completarInteraccion(
  interaccion: InteraccionEnCurso,
  opciones?: { requiereAprobacionHumana?: boolean },
): InteraccionEnCurso
```

- Sin `opciones` o con `requiereAprobacionHumana` ausente/`false`: comportamiento idéntico al actual (`invocando` → `respuesta_validada` → `completada`).
- Con `requiereAprobacionHumana: true`: `invocando` → `respuesta_validada` → `esperando_aprobacion`.

## Funciones nuevas

```ts
function aprobarInteraccion(interaccion: InteraccionEnCurso, detalle?: Record<string, unknown>): InteraccionEnCurso
function rechazarInteraccion(interaccion: InteraccionEnCurso, detalle?: Record<string, unknown>): InteraccionEnCurso
```

Ambas exigen `interaccion.estado === 'esperando_aprobacion'`; si no, lanzan `TRANSICION_IA_INVALIDA` (mismo error que ya usa el resto de la máquina de estados para transiciones inválidas). `aprobarInteraccion` transiciona a `completada`; `rechazarInteraccion`, a `rechazada`. El `detalle` opcional (p. ej. quién aprobó) se registra en el evento, igual que el resto de las transiciones — `packages/ia` no exige ninguna forma particular.
