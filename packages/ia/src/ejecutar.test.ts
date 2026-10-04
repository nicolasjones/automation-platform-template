import { describe, expect, it } from 'vitest'
import { perfilParaFalloTecnico, prepararInvocacion, validarPoliticaActiva, type ContratoConsumidor, type PoliticaActiva } from './index.js'

const contrato: ContratoConsumidor = { codigo: 'fixture', version: 1, esquemaEntrada: {}, esquemaSalida: {}, datosPermitidos: ['texto'], limiteIntentos: 2, limiteSegundos: 90 }
const politica: PoliticaActiva = { id: 'politica', contratoId: 'contrato', perfilPrincipalId: 'principal', perfilFallbackId: 'fallback-otro-proveedor', limiteIntentos: 2, limiteSegundos: 90, estado: 'aprobada' }

describe('ejecución gobernada', () => {
  it('valida política activa y prepara sólo los datos permitidos', () => {
    expect(prepararInvocacion(contrato, politica, { texto: 'permitido', token: 'no' }, 0, new Date())).toEqual({ texto: 'permitido' })
  })
  it('acepta fallback del mismo u otro proveedor únicamente ante fallo técnico previo', () => {
    expect(perfilParaFalloTecnico(politica, 'tecnico')).toBe('fallback-otro-proveedor')
    expect(perfilParaFalloTecnico(politica, 'timeout')).toBe('fallback-otro-proveedor')
    expect(perfilParaFalloTecnico(politica, 'contrato')).toBeNull()
    expect(perfilParaFalloTecnico(politica, 'verificador')).toBeNull()
  })
  it('rechaza límites fuera de la política global', () => {
    expect(() => validarPoliticaActiva({ ...politica, limiteIntentos: 3 })).toThrow('LIMITE_INTENTOS_IA_INVALIDO')
    expect(() => validarPoliticaActiva({ ...politica, limiteSegundos: 91 })).toThrow('LIMITE_TIEMPO_IA_INVALIDO')
  })
  it('sin contextoOrganizacion ni claveAislamientoOrganizacion, el comportamiento es idéntico al de antes (compatibilidad)', () => {
    expect(prepararInvocacion(contrato, politica, { texto: 'permitido', token: 'no' }, 0, new Date())).toEqual({ texto: 'permitido' })
  })
  it('con claveAislamientoOrganizacion declarada, rechaza datos de otra organización antes de sanitizar', () => {
    const contratoConOrganizacion: ContratoConsumidor = { ...contrato, datosPermitidos: ['texto', 'organizacionId'], claveAislamientoOrganizacion: 'organizacionId' }
    expect(() =>
      prepararInvocacion(contratoConOrganizacion, politica, { texto: 'x', organizacionId: 'org-2' }, 0, new Date(), { organizacionId: 'org-1' }),
    ).toThrow('ORGANIZACION_IA_NO_AUTORIZADA')
  })
  it('con claveAislamientoOrganizacion declarada y organización coincidente, prepara con normalidad', () => {
    const contratoConOrganizacion: ContratoConsumidor = { ...contrato, datosPermitidos: ['texto', 'organizacionId'], claveAislamientoOrganizacion: 'organizacionId' }
    expect(
      prepararInvocacion(contratoConOrganizacion, politica, { texto: 'x', organizacionId: 'org-1' }, 0, new Date(), { organizacionId: 'org-1' }),
    ).toEqual({ texto: 'x', organizacionId: 'org-1' })
  })
  it('entrada que cumple un esquemaEntrada real prepara con normalidad', () => {
    const contratoConEsquema: ContratoConsumidor = { ...contrato, esquemaEntrada: { type: 'object', required: ['texto'], properties: { texto: { type: 'string' } } } }
    expect(prepararInvocacion(contratoConEsquema, politica, { texto: 'ok' }, 0, new Date())).toEqual({ texto: 'ok' })
  })
  it('entrada que no cumple un esquemaEntrada real se rechaza antes de sanitizar', () => {
    const contratoConEsquema: ContratoConsumidor = { ...contrato, esquemaEntrada: { type: 'object', required: ['texto'], properties: { texto: { type: 'string' } } } }
    expect(() => prepararInvocacion(contratoConEsquema, politica, { texto: 123 }, 0, new Date())).toThrow('ENTRADA_IA_FUERA_DE_ESQUEMA')
  })
  it('esquemaEntrada {} no rechaza ningún dato (compatibilidad)', () => {
    expect(prepararInvocacion(contrato, politica, { texto: 'cualquiera' }, 0, new Date())).toEqual({ texto: 'cualquiera' })
  })
  it('con clavesNoConfiables declaradas, envuelve esa clave con el delimitador de marcado y deja las demás igual', () => {
    const contratoConNoConfiable: ContratoConsumidor = { ...contrato, datosPermitidos: ['texto', 'paginaExterna'], clavesNoConfiables: ['paginaExterna'] }
    const resultado = prepararInvocacion(contratoConNoConfiable, politica, { texto: 'propio', paginaExterna: 'contenido de la página' }, 0, new Date())

    expect(resultado.texto).toBe('propio')
    expect(resultado.paginaExterna).toContain('contenido de la página')
    expect(resultado.paginaExterna).toMatch(/<datos-no-confiables nonce="/)
  })
  it('con clavesNoConfiables declaradas pero valor no-string, lo deja sin modificar', () => {
    const contratoConContador: ContratoConsumidor = { ...contrato, datosPermitidos: ['texto', 'intentosPrevios'], clavesNoConfiables: ['intentosPrevios'] }
    const resultado = prepararInvocacion(contratoConContador, politica, { texto: 'propio', intentosPrevios: 3 }, 0, new Date())

    expect(resultado.intentosPrevios).toBe(3)
  })
  it('con clavesNoConfiables declaradas pero ausente de la entrada, no rompe nada (Edge Case)', () => {
    const contratoConClaveAusente: ContratoConsumidor = { ...contrato, clavesNoConfiables: ['claveQueNoViene'] }
    expect(prepararInvocacion(contratoConClaveAusente, politica, { texto: 'propio' }, 0, new Date())).toEqual({ texto: 'propio' })
  })
  it('sin clavesNoConfiables declaradas, el resultado es idéntico al comportamiento actual (compatibilidad)', () => {
    expect(prepararInvocacion(contrato, politica, { texto: 'permitido', token: 'no' }, 0, new Date())).toEqual({ texto: 'permitido' })
  })
})
