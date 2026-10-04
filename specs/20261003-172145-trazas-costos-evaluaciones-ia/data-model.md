# Data Model: costo estimado y arnés de evaluación para IA

Sin tablas (ver research.md, Decisión 1). Tipos nuevos, todos en memoria.

## Tarifa

```ts
type TarifaIa = { costoPorMilTokensEntrada: number; costoPorMilTokensSalida: number }
```

## calcularCostoEstimado

```ts
function calcularCostoEstimado(
  uso: { tokensEntrada: number; tokensSalida: number },
  tarifa: TarifaIa,
): number
```

`(tokensEntrada / 1000) * costoPorMilTokensEntrada + (tokensSalida / 1000) * costoPorMilTokensSalida`.

## CasoEvaluacion / ResultadoEvaluacion

```ts
type CasoEvaluacion<E, S> = { nombre: string; entrada: E; salidaEsperada: S }
type ResultadoEvaluacion<S> = { nombre: string; aprobado: boolean; salidaObtenida: S | null; salidaEsperada: S }
```

`salidaObtenida` es `null` cuando la función ejecutora lanzó una excepción para ese caso (FR-004) — se conserva `salidaEsperada` para poder mostrar qué se esperaba aunque no haya resultado real que comparar.

## ejecutarCasosEvaluacion

```ts
function ejecutarCasosEvaluacion<E, S>(
  casos: readonly CasoEvaluacion<E, S>[],
  ejecutar: (entrada: E) => Promise<S>,
  comparar?: (esperado: S, obtenido: S) => boolean,
): Promise<ResultadoEvaluacion<S>[]>
```

Corre cada caso de forma independiente (research.md, Decisión 3); sin `comparar`, usa igualdad por serialización (Decisión 2).
