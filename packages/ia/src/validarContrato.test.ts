import { describe, expect, it } from 'vitest'
import { redactarSecretos, sanitizarDato, validarPresupuesto, validarSalida } from './index.js'

describe('núcleo IA gobernada', () => {
  it('elimina datos no permitidos y secretos del contexto', () => {
    expect(sanitizarDato({ titulo: 'ok', token: 'no', detalle: 'permitido', cookie: 'no' }, ['titulo', 'detalle', 'token', 'cookie']))
      .toEqual({ titulo: 'ok', detalle: 'permitido' })
  })

  it('redacta secretos literales antes de persistir errores', () => {
    expect(redactarSecretos('falló con clave-privada', ['clave-privada'])).toBe('falló con [REDACTADO]')
  })

  it('rechaza presupuestos agotados y respuestas no objeto', () => {
    expect(() => validarPresupuesto(2, 2, new Date(), 90)).toThrow('LIMITE_INTENTOS_IA')
    expect(() => validarPresupuesto(0, 2, new Date(Date.now() - 91_000), 90)).toThrow('LIMITE_TIEMPO_IA')
    expect(() => validarSalida('respuesta')).toThrow('RESPUESTA_IA_INVALIDA')
  })

  it('valida la salida contra un esquemaSalida real cuando se lo pasa', () => {
    const esquemaSalida = { type: 'object', required: ['resultado'], properties: { resultado: { type: 'string' } } }
    expect(() => validarSalida({ resultado: 'ok' }, esquemaSalida)).not.toThrow()
    expect(() => validarSalida({ otraCosa: 1 }, esquemaSalida)).toThrow('RESPUESTA_IA_FUERA_DE_ESQUEMA')
  })

  it('sin esquemaSalida, solo valida que sea un objeto (compatibilidad)', () => {
    expect(() => validarSalida({ cualquiera: 'dato' })).not.toThrow()
  })
})
