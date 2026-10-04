# Quickstart: costo estimado y arnés de evaluación

```sh
pnpm install
pnpm --filter @platform/ia test
```

## Escenario 1 — costo estimado

`calcularCostoEstimado({ tokensEntrada: 1000, tokensSalida: 500 }, { costoPorMilTokensEntrada: 0.01, costoPorMilTokensSalida: 0.03 })` → `0.01 + 0.015 = 0.025`.

## Escenario 2 — evaluación con un caso aprobado y uno rechazado

Dos casos; la función ejecutora devuelve la salida esperada para el primero y otra cosa para el segundo → el reporte marca el primero aprobado y el segundo rechazado, con ambas salidas visibles.

## Escenario 3 — comparador personalizado

Mismo caso rechazado por igualdad estructural, pero con un comparador que ignora un campo irrelevante → el reporte lo marca aprobado.

## Escenario 4 — excepción en un caso no detiene el arnés

Un caso cuya función ejecutora lanza → se reporta rechazado, `salidaObtenida: null`, y el resto de los casos se evalúan igual.

## Fuera de alcance

No hay escenario de persistencia ni de descubrimiento de tarifas — ver `research.md`, Decisión 1.
