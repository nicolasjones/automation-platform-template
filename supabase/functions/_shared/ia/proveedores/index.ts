import type { PerfilModelo } from '../types.ts'
import { endpointInvocacion, proveedorDelCatalogo, type AdaptadorProveedor } from './catalogo.ts'

export type ModeloDescubierto = {
  modeloId: string
  capacidades: Record<string, unknown>
}

export type RespuestaHttp = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type FetchModelos = (url: string, init: { headers: Record<string, string> }) => Promise<RespuestaHttp>

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RESPUESTA_MODELOS_IA_INVALIDA')
  return value as Record<string, unknown>
}

function lista(valor: unknown): Record<string, unknown>[] {
  if (!Array.isArray(valor)) throw new Error('RESPUESTA_MODELOS_IA_INVALIDA')
  return valor.map(asRecord)
}

function normalizar(adaptador: AdaptadorProveedor, cuerpo: unknown): ModeloDescubierto[] {
  const data = asRecord(cuerpo)
  const items = adaptador === 'gemini' ? lista(data.models) : lista(data.data ?? data.models)
  return items.map((item) => {
    const bruto = typeof item.id === 'string' ? item.id : item.name
    if (typeof bruto !== 'string' || bruto.length === 0) throw new Error('RESPUESTA_MODELOS_IA_INVALIDA')
    const modeloId = adaptador === 'gemini' ? bruto.replace(/^models\//, '') : bruto
    const capacidades = adaptador === 'gemini'
      ? { acciones: Array.isArray(item.supportedGenerationMethods) ? item.supportedGenerationMethods : [] }
      : {}
    return { modeloId, capacidades }
  })
}

// Content-Type explícito en los tres casos (ver PR #12, mismo fix —
// mergear ese PR primero evita este cambio duplicado acá).
function encabezados(adaptador: AdaptadorProveedor, clave: string): Record<string, string> {
  if (adaptador === 'anthropic') return { 'x-api-key': clave, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' }
  if (adaptador === 'gemini') return { 'x-goog-api-key': clave, 'Content-Type': 'application/json' }
  return { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' }
}

export async function descubrirModelos(
  codigoProveedor: string,
  clave: string,
  fetchModelos: FetchModelos,
): Promise<ModeloDescubierto[]> {
  const proveedor = proveedorDelCatalogo(codigoProveedor)
  const response = await fetchModelos(proveedor.endpointModelos, { headers: encabezados(proveedor.adaptador, clave) })
  if (!response.ok) throw new Error(`DESCUBRIMIENTO_MODELOS_IA_FALLO_${response.status}`)
  return normalizar(proveedor.adaptador, await response.json())
}

export type FetchInvocacion = (url: string, init: { method: 'POST'; headers: Record<string, string>; body: string }) => Promise<RespuestaHttp>

// Transporte puro: no interpreta ni valida el cuerpo de la petición ni de la
// respuesta — eso queda a cargo del consumidor, cada proveedor espera y
// devuelve una forma distinta y packages/ia no se acopla a ninguna.
export async function invocarProveedorIa(
  perfil: PerfilModelo,
  clave: string,
  cuerpo: unknown,
  fetchInvocacion: FetchInvocacion,
): Promise<unknown> {
  const proveedor = proveedorDelCatalogo(perfil.proveedorCodigo)
  const url = endpointInvocacion(proveedor, perfil.modeloId)
  const response = await fetchInvocacion(url, {
    method: 'POST',
    headers: encabezados(proveedor.adaptador, clave),
    body: JSON.stringify(cuerpo),
  })
  if (!response.ok) throw new Error(`INVOCACION_PROVEEDOR_IA_FALLO_${response.status}`)
  return response.json()
}
