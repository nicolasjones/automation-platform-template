import { describe, expect, it } from 'vitest'
import { validarAislamientoOrganizacion } from './contextoOrganizacion.js'

describe('validarAislamientoOrganizacion', () => {
  it('organización coincide: no lanza', () => {
    expect(() =>
      validarAislamientoOrganizacion({ organizacionId: 'org-1', dato: 'x' }, 'organizacionId', { organizacionId: 'org-1' }),
    ).not.toThrow()
  })

  it('organización distinta en el nivel raíz: lanza', () => {
    expect(() =>
      validarAislamientoOrganizacion({ organizacionId: 'org-2' }, 'organizacionId', { organizacionId: 'org-1' }),
    ).toThrow('ORGANIZACION_IA_NO_AUTORIZADA')
  })

  it('organización distinta anidada dentro de un array: lanza', () => {
    expect(() =>
      validarAislamientoOrganizacion({ lista: [{ organizacionId: 'org-2' }] }, 'organizacionId', { organizacionId: 'org-1' }),
    ).toThrow('ORGANIZACION_IA_NO_AUTORIZADA')
  })

  it('organización distinta anidada dentro de un objeto: lanza', () => {
    expect(() =>
      validarAislamientoOrganizacion({ anidado: { profundo: { organizacionId: 'org-2' } } }, 'organizacionId', { organizacionId: 'org-1' }),
    ).toThrow('ORGANIZACION_IA_NO_AUTORIZADA')
  })

  it('sin clave de aislamiento declarada: cualquier dato pasa sin chequeo', () => {
    expect(() =>
      validarAislamientoOrganizacion({ organizacionId: 'org-2' }, null, { organizacionId: 'org-1' }),
    ).not.toThrow()
    expect(() =>
      validarAislamientoOrganizacion({ organizacionId: 'org-2' }, undefined, { organizacionId: 'org-1' }),
    ).not.toThrow()
  })

  it('clave declarada ausente en los datos de entrada: no lanza', () => {
    expect(() =>
      validarAislamientoOrganizacion({ otroDato: 'x' }, 'organizacionId', { organizacionId: 'org-1' }),
    ).not.toThrow()
  })

  it('un campo que coincide con la clave y con valor de otra organización se rechaza sin importar qué otros campos acompañen', () => {
    expect(() =>
      validarAislamientoOrganizacion(
        { organizacionId: 'org-2', nombre: 'reporte', filtros: { desde: '2026-01-01' } },
        'organizacionId',
        { organizacionId: 'org-1' },
      ),
    ).toThrow('ORGANIZACION_IA_NO_AUTORIZADA')
  })

  it('organización efectiva null con dato que referencia una organización concreta: lanza', () => {
    expect(() =>
      validarAislamientoOrganizacion({ organizacionId: 'org-1' }, 'organizacionId', { organizacionId: null }),
    ).toThrow('ORGANIZACION_IA_NO_AUTORIZADA')
  })
})
