# Quickstart: validar esquemas reales de entrada/salida

```sh
pnpm install
pnpm --filter @platform/ia test
```

## Escenario 1 — entrada cumple el esquema

Contrato con `esquemaEntrada: { type: 'object', required: ['texto'], properties: { texto: { type: 'string' } } }`, `entrada = { texto: 'ok' }` → `prepararInvocacion` no lanza.

## Escenario 2 — entrada no cumple el esquema

Mismo contrato, `entrada = { texto: 123 }` (tipo equivocado) → lanza `ENTRADA_IA_FUERA_DE_ESQUEMA`, antes de sanitizar.

## Escenario 3 — salida no cumple el esquema

`esquemaSalida: { type: 'object', required: ['resultado'] }`, `validarSalida({ otraCosa: 1 }, esquemaSalida)` → lanza `RESPUESTA_IA_FUERA_DE_ESQUEMA`.

## Escenario 4 — compatibilidad con `{}` y sin segundo argumento

`esquemaEntrada: {}` acepta cualquier dato; `validarSalida(valor)` sin segundo argumento sigue comportándose igual que hoy.

## Fuera de alcance

No se toca `ai-navigation-fallback` — se confirma con su propia suite (17/17) sin modificarla.
