export type TarifaIa = { costoPorMilTokensEntrada: number; costoPorMilTokensSalida: number }

export function calcularCostoEstimado(uso: { tokensEntrada: number; tokensSalida: number }, tarifa: TarifaIa): number {
  return (uso.tokensEntrada / 1000) * tarifa.costoPorMilTokensEntrada + (uso.tokensSalida / 1000) * tarifa.costoPorMilTokensSalida
}

export type CasoEvaluacion<E, S> = { nombre: string; entrada: E; salidaEsperada: S }
export type ResultadoEvaluacion<S> = { nombre: string; aprobado: boolean; salidaObtenida: S | null; salidaEsperada: S }

function igualesPorSerializacion(esperado: unknown, obtenido: unknown): boolean {
  return JSON.stringify(esperado) === JSON.stringify(obtenido)
}

export async function ejecutarCasosEvaluacion<E, S>(
  casos: readonly CasoEvaluacion<E, S>[],
  ejecutar: (entrada: E) => Promise<S>,
  comparar: (esperado: S, obtenido: S) => boolean = igualesPorSerializacion,
): Promise<ResultadoEvaluacion<S>[]> {
  const resultados: ResultadoEvaluacion<S>[] = []
  for (const caso of casos) {
    try {
      const salidaObtenida = await ejecutar(caso.entrada)
      resultados.push({ nombre: caso.nombre, aprobado: comparar(caso.salidaEsperada, salidaObtenida), salidaObtenida, salidaEsperada: caso.salidaEsperada })
    } catch {
      resultados.push({ nombre: caso.nombre, aprobado: false, salidaObtenida: null, salidaEsperada: caso.salidaEsperada })
    }
  }
  return resultados
}
