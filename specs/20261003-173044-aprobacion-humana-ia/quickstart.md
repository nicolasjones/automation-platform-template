# Quickstart: aprobación humana

```sh
pnpm install
pnpm --filter @platform/ia test
```

## Escenario 1 — requiere aprobación, queda en espera

`completarInteraccion(interaccionInvocando, { requiereAprobacionHumana: true })` → estado `esperando_aprobacion`.

## Escenario 2 — no requiere aprobación, compatibilidad total

`completarInteraccion(interaccionInvocando)` → estado `completada`, igual que hoy.

## Escenario 3 — aprobar

`aprobarInteraccion(interaccionEsperandoAprobacion)` → estado `completada`.

## Escenario 4 — rechazar

`rechazarInteraccion(interaccionEsperandoAprobacion)` → estado `rechazada`.

## Escenario 5 — transición inválida

`aprobarInteraccion(interaccionYaCompletada)` → lanza `TRANSICION_IA_INVALIDA`.

## Fuera de alcance

Sin tabla, RPC ni pantalla de Refine — ver research.md, Decisión 3.
