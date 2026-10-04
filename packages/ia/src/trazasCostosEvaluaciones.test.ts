import { describe, expect, it } from 'vitest'
import { calcularCostoEstimado, ejecutarCasosEvaluacion } from './trazasCostosEvaluaciones.js'

describe('calcularCostoEstimado', () => {
  it('calcula el costo con tokens de entrada y salida conocidos', () => {
    expect(calcularCostoEstimado({ tokensEntrada: 1000, tokensSalida: 500 }, { costoPorMilTokensEntrada: 0.01, costoPorMilTokensSalida: 0.03 })).toBeCloseTo(0.025)
  })

  it('cero tokens de un tipo no contribuye al costo', () => {
    expect(calcularCostoEstimado({ tokensEntrada: 0, tokensSalida: 2000 }, { costoPorMilTokensEntrada: 0.01, costoPorMilTokensSalida: 0.03 })).toBeCloseTo(0.06)
    expect(calcularCostoEstimado({ tokensEntrada: 2000, tokensSalida: 0 }, { costoPorMilTokensEntrada: 0.01, costoPorMilTokensSalida: 0.03 })).toBeCloseTo(0.02)
  })
})

describe('ejecutarCasosEvaluacion', () => {
  it('reporta aprobado y rechazado correctamente para cada caso', async () => {
    const casos = [
      { nombre: 'caso-ok', entrada: 'a', salidaEsperada: 'A' },
      { nombre: 'caso-mal', entrada: 'b', salidaEsperada: 'B' },
    ]
    const ejecutar = async (entrada: string) => (entrada === 'a' ? 'A' : 'distinto')

    const resultados = await ejecutarCasosEvaluacion(casos, ejecutar)

    expect(resultados).toEqual([
      { nombre: 'caso-ok', aprobado: true, salidaObtenida: 'A', salidaEsperada: 'A' },
      { nombre: 'caso-mal', aprobado: false, salidaObtenida: 'distinto', salidaEsperada: 'B' },
    ])
  })

  it('usa el comparador personalizado cuando se lo pasa', async () => {
    const casos = [{ nombre: 'caso', entrada: 'x', salidaEsperada: { valor: 1, ruido: 'a' } }]
    const ejecutar = async () => ({ valor: 1, ruido: 'b' })
    const compararSoloValor = (esperado: { valor: number }, obtenido: { valor: number }) => esperado.valor === obtenido.valor

    const resultados = await ejecutarCasosEvaluacion(casos, ejecutar, compararSoloValor)

    expect(resultados[0]?.aprobado).toBe(true)
  })

  it('sin comparador personalizado, el mismo caso se rechaza por igualdad estructural', async () => {
    const casos = [{ nombre: 'caso', entrada: 'x', salidaEsperada: { valor: 1, ruido: 'a' } }]
    const ejecutar = async () => ({ valor: 1, ruido: 'b' })

    const resultados = await ejecutarCasosEvaluacion(casos, ejecutar)

    expect(resultados[0]?.aprobado).toBe(false)
  })

  it('una excepción en un caso lo marca rechazado sin detener el resto', async () => {
    const casos = [
      { nombre: 'caso-rompe', entrada: 'x', salidaEsperada: 'algo' },
      { nombre: 'caso-ok', entrada: 'y', salidaEsperada: 'bien' },
    ]
    const ejecutar = async (entrada: string) => {
      if (entrada === 'x') throw new Error('boom')
      return 'bien'
    }

    const resultados = await ejecutarCasosEvaluacion(casos, ejecutar)

    expect(resultados[0]).toEqual({ nombre: 'caso-rompe', aprobado: false, salidaObtenida: null, salidaEsperada: 'algo' })
    expect(resultados[1]).toEqual({ nombre: 'caso-ok', aprobado: true, salidaObtenida: 'bien', salidaEsperada: 'bien' })
  })

  it('una lista de casos vacía devuelve un reporte vacío sin error', async () => {
    const resultados = await ejecutarCasosEvaluacion([], async () => 'nunca llamado')
    expect(resultados).toEqual([])
  })
})
