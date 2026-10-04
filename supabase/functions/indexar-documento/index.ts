// Contrato: specs/.../contracts/indexacion-documento.md (ver spec del
// mecanismo de búsqueda documental genérica en este template).
//
// Recibe un version_id ya creado (estado 'procesando', archivo ya subido a
// Storage por el frontend vía asUser). Descarga el objeto, extrae texto,
// fragmenta, genera los embeddings en un único batch (OpenAI —
// invocarProveedorIa no soporta embeddings) y activa la versión solo si
// todos los fragmentos se indexaron con éxito — nunca hay una ventana sin
// ninguna versión usable.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { prepararInvocacion, sanitizarDato, type ContratoConsumidor } from '../_shared/ia/index.ts'
import { generarEmbeddings } from '../_shared/embeddings.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const CONSUMIDOR_CODIGO = 'rag-busqueda-documental'
const TAMANO_FRAGMENTO = 1200
const SOLAPAMIENTO = 200

const CONTRATO: ContratoConsumidor = {
  codigo: CONSUMIDOR_CODIGO,
  version: 1,
  esquemaEntrada: { type: 'object', properties: { texto: { type: 'string' } }, required: ['texto'] },
  esquemaSalida: { type: 'object', properties: { embedding: { type: 'array' } }, required: ['embedding'] },
  datosPermitidos: ['texto', 'organizacion_id'],
  limiteIntentos: 1,
  limiteSegundos: 60,
  claveAislamientoOrganizacion: 'organizacion_id',
}

function fragmentarTexto(texto: string): string[] {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  if (!limpio) return []
  const fragmentos: string[] = []
  let inicio = 0
  while (inicio < limpio.length) {
    const fin = Math.min(inicio + TAMANO_FRAGMENTO, limpio.length)
    const fragmento = limpio.slice(inicio, fin).trim()
    if (fragmento) fragmentos.push(fragmento)
    if (fin >= limpio.length) break
    inicio = fin - SOLAPAMIENTO
  }
  return fragmentos
}

async function extraerTexto(bytes: Uint8Array, nombre: string): Promise<string | null> {
  const ext = nombre.toLowerCase().split('.').pop()
  try {
    if (ext === 'txt') return new TextDecoder('utf-8').decode(bytes)
    if (ext === 'pdf') {
      const { default: pdfParse } = await import('npm:pdf-parse@1.1.1')
      const resultado = await pdfParse(bytes)
      return resultado.text || null
    }
    if (ext === 'docx') {
      const mammoth = await import('npm:mammoth@1.8.0')
      const resultado = await mammoth.extractRawText({ buffer: bytes })
      return resultado.value || null
    }
  } catch {
    return null
  }
  return null
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

  let body: { version_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Cuerpo inválido: se esperaba JSON.' }, 400)
  }
  if (!body.version_id) return jsonResponse({ error: 'Falta "version_id".' }, 400)

  // Nunca service-role para datos de negocio (Principio I) — la versión
  // debe pertenecer a la organización del usuario, el RLS de
  // versiones_documento ya lo garantiza acá.
  const asUser = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })

  const { data: version, error: versionError } = await asUser
    .from('versiones_documento')
    .select('id, documento_id, storage_path, estado, documentos(nombre, organizacion_id)')
    .eq('id', body.version_id)
    .maybeSingle()

  if (versionError || !version) return jsonResponse({ error: 'Versión no encontrada.' }, 404)
  if (version.estado !== 'procesando') return jsonResponse({ error: 'Esta versión ya fue procesada.' }, 409)

  async function marcarFallida(motivo: string) {
    await asUser.from('versiones_documento').update({ estado: 'fallida', motivo_error: motivo }).eq('id', body.version_id)
    return jsonResponse({ error: motivo }, 422)
  }

  const { data: archivo, error: descargaError } = await asUser.storage.from('documentos-rag').download(version.storage_path)
  if (descargaError || !archivo) return await marcarFallida('No se pudo descargar el archivo subido.')

  const bytes = new Uint8Array(await archivo.arrayBuffer())
  // deno-lint-ignore no-explicit-any
  const nombreDocumento = (version as any).documentos?.nombre as string
  const texto = await extraerTexto(bytes, nombreDocumento)
  if (!texto || !texto.trim()) {
    return await marcarFallida('No pudimos extraer texto de este documento — formato no soportado o sin contenido legible.')
  }

  const fragmentos = fragmentarTexto(texto)
  if (fragmentos.length === 0) return await marcarFallida('El documento no tiene contenido para indexar.')

  // Gobernanza real: sin política aprobada para 'rag-busqueda-documental',
  // falla cerrado — gate humano vía /ia/contratos y /ia/politicas.
  const { data: politicaFilas, error: politicaError } = await admin.rpc('resolver_politica_ia', { p_codigo: CONSUMIDOR_CODIGO })
  const politica = politicaFilas?.[0]
  if (politicaError || !politica) {
    return await marcarFallida('Búsqueda documental no está configurada todavía: falta una política aprobada para "rag-busqueda-documental". Un superadmin debe crearla en /ia/contratos y /ia/politicas.')
  }

  const { data: credencialFilas, error: credencialError } = await admin.rpc('obtener_clave_perfil_ia', { p_perfil_id: politica.perfil_principal_id })
  const credencial = credencialFilas?.[0]
  if (credencialError || !credencial) return await marcarFallida('No se pudo resolver la credencial del proveedor de IA.')

  // Solo OpenAI soporta embeddings acá — si la política aprobada usa otro
  // proveedor, falla con un error claro en vez de adivinar un endpoint
  // equivocado.
  if (credencial.proveedor_codigo !== 'openai') {
    return await marcarFallida(`Búsqueda documental todavía no soporta el proveedor "${credencial.proveedor_codigo}" para embeddings — solo OpenAI por ahora.`)
  }

  try {
    prepararInvocacion(
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
      { texto: fragmentos[0] },
      // 0, no 1: intentos ya consumidos antes de esta llamada (mismo bug
      // real encontrado y corregido en chat-companion-mechanism — con 1,
      // 1 >= limiteIntentos(1) siempre tira LIMITE_INTENTOS_IA).
      0,
      new Date(),
    )
  } catch (error) {
    return await marcarFallida(error instanceof Error ? error.message : 'ENTRADA_IA_INVALIDA')
  }

  // deno-lint-ignore no-explicit-any
  const organizacionId = (version as any).documentos?.organizacion_id as string
  const fragmentosSaneados = fragmentos.map((f) => sanitizarDato({ texto: f }, CONTRATO.datosPermitidos).texto as string)

  let embeddings: number[][]
  try {
    // Un único llamado batch para todos los fragmentos (la API de OpenAI
    // acepta un array en "input") — más rápido y más barato que una
    // llamada por fragmento, y un solo punto de fallo en vez de N.
    embeddings = await generarEmbeddings(fragmentosSaneados, credencial.clave)
  } catch {
    return await marcarFallida('No pude generar los embeddings de este documento, probá de nuevo.')
  }

  const filasFragmentos = fragmentos.map((texto, i) => ({
    version_id: body.version_id as string,
    organizacion_id: organizacionId,
    texto,
    embedding: embeddings[i],
    orden: i,
  }))

  const { error: insertError } = await asUser.from('fragmentos_indexados').insert(
    filasFragmentos.map((f) => ({ ...f, embedding: `[${f.embedding.join(',')}]` })),
  )
  if (insertError) return await marcarFallida('No se pudieron guardar los fragmentos indexados.')

  // Activación atómica (RPC private.activar_version_documento, una sola
  // transacción): reemplaza la versión activa anterior y activa esta —
  // nunca hay una ventana sin ninguna versión usable.
  const { error: activarError } = await asUser.rpc('activar_version_documento', { p_version_id: body.version_id })
  if (activarError) return await marcarFallida('No se pudo activar la nueva versión.')

  return jsonResponse({ version_id: body.version_id, fragmentos: filasFragmentos.length }, 200)
})
