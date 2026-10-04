import { describe, expect, it } from 'vitest'
import { aprobarInteraccion, completarInteraccion, iniciarInteraccion, iniciarInvocacion, rechazarInteraccion, registrarFallo, type PoliticaActiva } from './index.js'

const politica: PoliticaActiva = { id: 'p', contratoId: 'c', perfilPrincipalId: 'principal', perfilFallbackId: 'fallback', limiteIntentos: 2, limiteSegundos: 90, estado: 'aprobada' }
describe('interacciones IA', () => {
  it('usa fallback una vez frente a timeout y conserva el presupuesto total', () => {
    const invocando = iniciarInvocacion(iniciarInvocacion(iniciarInteraccion(), politica), politica)
    const conFallback = registrarFallo(invocando, politica, 'timeout')
    expect(conFallback).toMatchObject({ estado: 'invocando', intentos: 2, perfilEfectivoId: 'fallback' })
    expect(registrarFallo(conFallback, politica, 'tecnico').estado).toBe('revision_humana')
  })
  it('no usa fallback después de rechazo de contrato o verificador', () => {
    const invocando = iniciarInvocacion(iniciarInvocacion(iniciarInteraccion(), politica), politica)
    expect(registrarFallo(invocando, politica, 'contrato').estado).toBe('rechazada')
    expect(registrarFallo(invocando, politica, 'verificador').estado).toBe('rechazada')
  })
  it('registra la secuencia validada antes de completar', () => {
    const completada = completarInteraccion(iniciarInvocacion(iniciarInvocacion(iniciarInteraccion(), politica), politica))
    expect(completada.eventos.map((evento) => evento.estado)).toEqual(['preparando', 'invocando', 'respuesta_validada', 'completada'])
  })
  it('sin requerir aprobación, completarInteraccion se comporta igual que antes (compatibilidad)', () => {
    const invocando = iniciarInvocacion(iniciarInvocacion(iniciarInteraccion(), politica), politica)
    expect(completarInteraccion(invocando).estado).toBe('completada')
  })
  it('requiere aprobación: completarInteraccion queda en esperando_aprobacion', () => {
    const invocando = iniciarInvocacion(iniciarInvocacion(iniciarInteraccion(), politica), politica)
    const enEspera = completarInteraccion(invocando, { requiereAprobacionHumana: true })
    expect(enEspera.estado).toBe('esperando_aprobacion')
    expect(enEspera.eventos.map((evento) => evento.estado)).toEqual(['preparando', 'invocando', 'respuesta_validada', 'esperando_aprobacion'])
  })
  it('aprobar una interacción en espera la completa', () => {
    const invocando = iniciarInvocacion(iniciarInvocacion(iniciarInteraccion(), politica), politica)
    const enEspera = completarInteraccion(invocando, { requiereAprobacionHumana: true })
    expect(aprobarInteraccion(enEspera, { aprobadoPor: 'superadmin-fixture' }).estado).toBe('completada')
  })
  it('rechazar una interacción en espera la rechaza', () => {
    const invocando = iniciarInvocacion(iniciarInvocacion(iniciarInteraccion(), politica), politica)
    const enEspera = completarInteraccion(invocando, { requiereAprobacionHumana: true })
    expect(rechazarInteraccion(enEspera, { motivo: 'no corresponde' }).estado).toBe('rechazada')
  })
  it('aprobar o rechazar desde cualquier otro estado lanza TRANSICION_IA_INVALIDA', () => {
    const invocando = iniciarInvocacion(iniciarInvocacion(iniciarInteraccion(), politica), politica)
    const completada = completarInteraccion(invocando)
    expect(() => aprobarInteraccion(completada)).toThrow('TRANSICION_IA_INVALIDA')
    expect(() => rechazarInteraccion(completada)).toThrow('TRANSICION_IA_INVALIDA')
    expect(() => aprobarInteraccion(invocando)).toThrow('TRANSICION_IA_INVALIDA')
  })
})
