// Contrato: ver spec del mecanismo de búsqueda documental genérica en
// este template (sección "Contrato de búsqueda").
//
// Embebe la pregunta, busca fragmentos relevantes (solo de versiones
// activas, solo de la organización del usuario — vía RLS, nunca
// service-role) y genera una respuesta citando los documentos de origen.
// Si nada supera el umbral, responde que no encontró información sin
// llamar al proveedor de generación.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { prepararInvocacion, sanitizarDato, invocarProveedorIa, type ContratoConsumidor, type PerfilModelo } from '../_shared/ia/index.ts'
import { generarEmbedding } from '../_shared/embeddings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const CONSUMIDOR_CODIGO = 'rag-busqueda-documental'
const UMBRAL_SIMILITUD = 0.5
const K_FRAGMENTOS = 6

const CONTRATO: ContratoConsumidor = {
  codigo: CONSUMIDOR_CODIGO,
  version: 1,
  esquemaEntrada: { type: 'object', properties: { pregunta: { type: 'string' } }, required: ['pregunta'] },
  esquemaSalida: { type: 'object', properties: { respuesta: { type: 'string' } }, required: ['respuesta'] },
  datosPermitidos: ['pregunta', 'organizacion_id'],
  limiteIntentos: 1,
  limiteSegundos: 60,
  claveAislamientoOrganizacion: 'organizacion_id',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Método no soportado, usar POST.' }, 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return jsonResponse({ error: 'No autorizado' }, 403)

  const { data: callerData, error: callerError } = await admin.auth.getUser(jwt)
  if (callerError || !callerData?.user) return jsonResponse({ error: 'No autorizado' }, 403)

  let body: { pregunta?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Cuerpo inválido: se esperaba JSON.' }, 400)
  }
  if (!body.pregunta) return jsonResponse({ error: 'Falta "pregunta".' }, 400)

  const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })

  const { data: politicaFilas, error: politicaError } = await admin.rpc('resolver_politica_ia', { p_codigo: CONSUMIDOR_CODIGO })
  const politica = politicaFilas?.[0]
  if (politicaError || !politica) {
    return jsonResponse({ error: 'Búsqueda documental no está configurada todavía: falta una política aprobada para "rag-busqueda-documental". Un superadmin debe crearla en /ia/contratos y /ia/politicas.' }, 503)
  }

  let entradaSanitizada: Record<string, unknown>
  try {
    entradaSanitizada = prepararInvocacion(
      CONTRATO,
      {
        id: politica.politica_id,
        contratoId: politica.contrato_id,
        perfilPrincipalId: politica.perfil_principal_id,
        estado: 'aprobada',
        limiteIntentos: politica.limite_intentos,
        limiteSegundos: politica.limite_segundos,
        perfilFallbackId: politica.perfil_fallback_id,
      },
      { pregunta: body.pregunta },
      // 0, no 1: intentos ya consumidos antes de esta llamada (mismo bug
      // real encontrado y corregido en chat-companion-mechanism).
      0,
      new Date(),
    )
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'ENTRADA_IA_INVALIDA' }, 400)
  }

  const { data: credencialFilas, error: credencialError } = await admin.rpc('obtener_clave_perfil_ia', { p_perfil_id: politica.perfil_principal_id })
  const credencial = credencialFilas?.[0]
  if (credencialError || !credencial) return jsonResponse({ error: 'No se pudo resolver la credencial del proveedor de IA.' }, 500)

  if (credencial.proveedor_codigo !== 'openai') {
    return jsonResponse({ error: `Búsqueda documental todavía no soporta el proveedor "${credencial.proveedor_codigo}" — solo OpenAI por ahora.` }, 501)
  }

  let embeddingPregunta: number[]
  try {
    embeddingPregunta = await generarEmbedding(String(entradaSanitizada.pregunta), credencial.clave)
  } catch {
    return jsonResponse({ error: 'No pude procesar la pregunta, probá de nuevo.' }, 502)
  }

  const { data: fragmentos, error: busquedaError } = await asUser.rpc('buscar_fragmentos', {
    p_embedding: `[${embeddingPregunta.join(',')}]`,
    p_umbral: UMBRAL_SIMILITUD,
    p_k: K_FRAGMENTOS,
  })
  if (busquedaError) return jsonResponse({ error: 'No pude buscar en los documentos.' }, 500)

  // Sin fragmentos por encima del umbral, no se llama al proveedor de
  // generación — se responde directo que no hay información.
  if (!fragmentos || fragmentos.length === 0) {
    return jsonResponse({ respuesta: 'No encontré información relevante en los documentos para responder eso.', documentos_citados: [] }, 200)
  }

  const { data: versionesPorFragmento } = await asUser
    .from('versiones_documento')
    .select('id, documento_id')
    .in('id', [...new Set(fragmentos.map((f: { version_id: string }) => f.version_id))])

  const documentoPorVersion = new Map((versionesPorFragmento ?? []).map((v: { id: string; documento_id: string }) => [v.id, v.documento_id]))
  const documentosCitados = [...new Set(fragmentos.map((f: { version_id: string }) => documentoPorVersion.get(f.version_id)).filter(Boolean))] as string[]

  const contexto = fragmentos.map((f: { texto: string }) => sanitizarDato({ texto: f.texto }, CONTRATO.datosPermitidos).texto).join('\n\n---\n\n')

  const perfil: PerfilModelo = { id: politica.perfil_principal_id, proveedorCodigo: credencial.proveedor_codigo, modeloId: credencial.modelo_id }

  let textoFinal: string
  try {
    const respuesta = await invocarProveedorIa(
      perfil,
      credencial.clave,
      {
        model: perfil.modeloId,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: 'Respondé la pregunta del usuario usando únicamente el contexto provisto. Si el contexto no alcanza, decí que no encontraste la información.' },
          { role: 'user', content: `Contexto:\n${contexto}\n\nPregunta: ${entradaSanitizada.pregunta}` },
        ],
      },
      (url, init) => fetch(url, init),
    ) as { choices: Array<{ message: { content: string } }> }
    textoFinal = respuesta.choices?.[0]?.message?.content ?? 'No pude generar una respuesta.'
  } catch {
    return jsonResponse({ error: 'No pude obtener una respuesta del proveedor de IA, probá de nuevo.' }, 502)
  }

  return jsonResponse({ respuesta: textoFinal, documentos_citados: documentosCitados }, 200)
})
