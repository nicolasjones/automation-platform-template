import { describe, expect, it, vi } from 'vitest'
import type { PerfilModelo } from '../types.js'
import type { FetchInvocacion } from './index.js'
import { invocarProveedorIa } from './index.js'

function perfil(proveedorCodigo: string, modeloId: string): PerfilModelo {
  return { id: 'perfil-fixture', proveedorCodigo, modeloId }
}

function respuesta(json: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => json }
}

describe('invocarProveedorIa', () => {
  it('anthropic: POST a /messages con x-api-key y anthropic-version', async () => {
    const fetchInvocacion: FetchInvocacion = vi.fn().mockResolvedValue(respuesta({ texto: 'ok' }))
    await invocarProveedorIa(perfil('anthropic', 'claude-fixture'), 'clave-fixture', { mensaje: 'hola' }, fetchInvocacion)

    expect(fetchInvocacion).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'clave-fixture', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ mensaje: 'hola' }),
    })
  })

  it('gemini: el modelo va en la URL, header x-goog-api-key', async () => {
    const fetchInvocacion: FetchInvocacion = vi.fn().mockResolvedValue(respuesta({ texto: 'ok' }))
    await invocarProveedorIa(perfil('google', 'gemini-fixture'), 'clave-fixture', { contents: [] }, fetchInvocacion)

    expect(fetchInvocacion).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-fixture:generateContent',
      { method: 'POST', headers: { 'x-goog-api-key': 'clave-fixture' }, body: JSON.stringify({ contents: [] }) },
    )
  })

  it('openai: Authorization Bearer', async () => {
    const fetchInvocacion: FetchInvocacion = vi.fn().mockResolvedValue(respuesta({ texto: 'ok' }))
    await invocarProveedorIa(perfil('openai', 'gpt-fixture'), 'clave-fixture', { mensajes: [] }, fetchInvocacion)

    expect(fetchInvocacion).toHaveBeenCalledWith('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer clave-fixture' },
      body: JSON.stringify({ mensajes: [] }),
    })
  })

  it('respuesta no exitosa lanza INVOCACION_PROVEEDOR_IA_FALLO_<status>', async () => {
    const fetchInvocacion: FetchInvocacion = vi.fn().mockResolvedValue(respuesta({ error: 'mal' }, false, 429))

    await expect(invocarProveedorIa(perfil('openai', 'gpt-fixture'), 'clave-fixture', {}, fetchInvocacion))
      .rejects.toThrow('INVOCACION_PROVEEDOR_IA_FALLO_429')
  })

  it('respuesta exitosa devuelve el json crudo sin transformar', async () => {
    const crudo = { forma: 'lo-que-sea-que-devuelva-el-proveedor' }
    const fetchInvocacion: FetchInvocacion = vi.fn().mockResolvedValue(respuesta(crudo))

    await expect(invocarProveedorIa(perfil('openai', 'gpt-fixture'), 'clave-fixture', {}, fetchInvocacion))
      .resolves.toEqual(crudo)
  })

  it('proveedor sin endpoint de invocación soportado (baidu) propaga el error del catálogo', async () => {
    const fetchInvocacion: FetchInvocacion = vi.fn()

    await expect(invocarProveedorIa(perfil('baidu-ernie', 'ernie-fixture'), 'clave-fixture', {}, fetchInvocacion))
      .rejects.toThrow('PROVEEDOR_IA_SIN_ENDPOINT_INVOCACION')
    expect(fetchInvocacion).not.toHaveBeenCalled()
  })
})
