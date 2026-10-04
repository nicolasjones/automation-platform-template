import { Ajv } from 'ajv'

const ajv = new Ajv({ allErrors: false, strict: false })

export function validarPresupuesto(intentos: number, limiteIntentos: number, iniciadoEn: Date, limiteSegundos: number): void {
  if (intentos >= limiteIntentos) throw new Error('LIMITE_INTENTOS_IA')
  if (Date.now() - iniciadoEn.getTime() >= limiteSegundos * 1000) throw new Error('LIMITE_TIEMPO_IA')
}

export function validarContraEsquema(valor: unknown, esquema: object, codigoError: string): void {
  const validar = ajv.compile(esquema)
  if (!validar(valor)) throw new Error(codigoError)
}

export function validarSalida(valor: unknown, esquemaSalida: object = {}): asserts valor is Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('RESPUESTA_IA_INVALIDA')
  validarContraEsquema(valor, esquemaSalida, 'RESPUESTA_IA_FUERA_DE_ESQUEMA')
}
