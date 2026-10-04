import { describe, expect, it } from 'vitest'
import { endpointInvocacion, proveedorDelCatalogo } from './catalogo.js'

describe('endpointInvocacion', () => {
  it('openai: reemplaza /models por /chat/completions', () => {
    expect(endpointInvocacion(proveedorDelCatalogo('openai'), 'gpt-fixture')).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('openai-compatible: respeta el host propio de cada proveedor, no uno fijo', () => {
    expect(endpointInvocacion(proveedorDelCatalogo('xai'), 'modelo-fixture')).toBe('https://api.x.ai/v1/chat/completions')
    expect(endpointInvocacion(proveedorDelCatalogo('deepseek'), 'modelo-fixture')).toBe('https://api.deepseek.com/chat/completions')
  })

  it('anthropic: reemplaza /models por /messages', () => {
    expect(endpointInvocacion(proveedorDelCatalogo('anthropic'), 'claude-fixture')).toBe('https://api.anthropic.com/v1/messages')
  })

  it('gemini: el modelo va en el path, con :generateContent', () => {
    expect(endpointInvocacion(proveedorDelCatalogo('google'), 'gemini-fixture')).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture:generateContent')
  })

  it('baidu: sin endpoint de invocación soportado todavía', () => {
    expect(() => endpointInvocacion(proveedorDelCatalogo('baidu-ernie'), 'ernie-fixture')).toThrow('PROVEEDOR_IA_SIN_ENDPOINT_INVOCACION')
  })
})
