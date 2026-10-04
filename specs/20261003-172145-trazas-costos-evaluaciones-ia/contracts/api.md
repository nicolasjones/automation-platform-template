# Contrato: API pública nueva

Dos funciones independientes, sin relación con `prepararInvocacion` ni con ninguna otra función existente — no hay orden de llamada que respetar, no hay compatibilidad que preservar porque no reemplazan nada.

```ts
function calcularCostoEstimado(uso: { tokensEntrada: number; tokensSalida: number }, tarifa: TarifaIa): number

function ejecutarCasosEvaluacion<E, S>(
  casos: readonly CasoEvaluacion<E, S>[],
  ejecutar: (entrada: E) => Promise<S>,
  comparar?: (esperado: S, obtenido: S) => boolean,
): Promise<ResultadoEvaluacion<S>[]>
```

Uso típico (fuera de esta entrega, a modo de ejemplo — no se implementa acá): un consumidor que ya tiene su propia tarifa y ya extrajo tokens de la respuesta de su proveedor llama `calcularCostoEstimado` y guarda el resultado en el `detalle` del evento de interacción que ya registra. Un consumidor que quiere validar que un cambio de modelo no rompió casos conocidos define una lista de `CasoEvaluacion` y los corre con `ejecutarCasosEvaluacion`, usando como `ejecutar` su propia función que invoca al proveedor.
