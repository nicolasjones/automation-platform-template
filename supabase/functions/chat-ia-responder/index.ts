// Recibe un mensaje de usuario, resuelve la política aprobada del
// consumidor 'chat-ia-leer' (gobernanza real: si no hay una política
// `aprobada` con su contrato `aprobado`, falla cerrado con un error claro
// — no inventa ni aprueba nada, eso es un gate humano vía /ia/politicas).
// Ejecuta un ciclo de tool-calling — Anthropic (Messages API) u OpenAI
// (Chat Completions API), según el adaptador de la política aprobada;
// cualquier otro adaptador falla con un error claro (501), nunca asume un
// formato no verificado. Si el modelo pide la herramienta `leer`, se
// resuelve contra fuentes_chat_ia/capacidades_chat_ia con la sesión del
// propio usuario (nunca service-role) antes de ejecutar cualquier
// consulta — el aislamiento de organización vive en esa consulta (RLS),
// no en el prompt. El catálogo de fuentes legibles (con sus columnas) se
// descubre en cada invocación y se inyecta en la descripción del tool y en
// la instrucción de sistema (catalogo.ts); los criterios de rango, orden,
// límite y agregación se validan contra esas columnas antes de consultar
// (consulta.ts). Ver docs/chat-companion-lectura.md.
import { createClient } from 'npm:@supabase/supabase-js@2'
// Ruta relativa, no 'npm:@platform/ia': @platform/ia es "private": true,
// nunca se publicó a npm — el specifier npm: nunca iba a resolver en
// ningún entorno, no solo en desarrollo local. Deno compila TS nativo,
// así que importar el archivo fuente directo funciona sin build
// intermedio.
import { prepararInvocacion, sanitizarDato, invocarProveedorIa, type ContratoConsumidor, type PerfilModelo } from '../_shared/ia/index.ts'
import { construirDescripcionLeer, construirSystemPrompt, mensajeSinRespuesta, type FuenteChat } from './catalogo.ts'
import { planificarConsulta, type EntradaLeer } from './consulta.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const CONSUMIDOR_CODIGO = 'chat-ia-leer'

const CONTRATO: ContratoConsumidor = {
  codigo: CONSUMIDOR_CODIGO,
  version: 1,
  esquemaEntrada: { type: 'object', properties: { mensaje: { type: 'string' } }, required: ['mensaje'] },
  esquemaSalida: { type: 'object', properties: { respuesta: { type: 'string' } }, required: ['respuesta'] },
  datosPermitidos: ['mensaje', 'organizacion_id'],
  limiteIntentos: 1,
  limiteSegundos: 60,
  claveAislamientoOrganizacion: 'organizacion_id',
}

// La descripción de esta herramienta se reemplaza en cada invocación por el
// catálogo de vistas legibles del usuario (catalogo.ts) — sin eso el modelo no
// tiene de dónde sacar un nombre de vista y lo inventa.
const HERRAMIENTA_LEER = {
  name: 'leer',
  description: 'Lee datos de una funcionalidad habilitada de la organización del usuario.',
  input_schema: {
    type: 'object',
    properties: {
      vista: { type: 'string', description: 'Nombre exacto de la vista registrada a consultar.' },
      filtros: { type: 'object', description: 'Pares columna/valor para filtrar por igualdad. Usá solo columnas que figuren en la lista de columnas de esa vista.' },
      rango: { type: 'object', description: 'Rango por columna: {"columna": {"desde": "...", "hasta": "..."}} (mayor o igual a "desde", menor o igual a "hasta"). Se puede omitir uno de los dos extremos.' },
      orden: { type: 'object', description: 'Orden de las filas: {"columna": "fecha", "direccion": "asc"|"desc"}.' },
      limite: { type: 'number', description: 'Máximo de filas a devolver. Por defecto 50; tope 1000.' },
      agregar: { type: 'object', description: 'Totales en vez de filas: {"alias": {"columna": "debe", "operacion": "suma"|"cantidad"|"promedio"|"minimo"|"maximo"}}. Usalo para sumas, conteos y promedios: no traigas las filas para sumarlas vos.' },
    },
    required: ['vista'],
  },
}

const HERRAMIENTA_EJECUTAR = {
  name: 'ejecutar',
  description: 'Propone ejecutar una acción sobre una funcionalidad ejecutable de la organización. NO la ejecuta todavía — queda pendiente de confirmación explícita del usuario en la UI.',
  input_schema: {
    type: 'object',
    properties: {
      rpc: { type: 'string', description: 'Nombre de la acción registrada a ejecutar.' },
      parametros: { type: 'object', description: 'Parámetros con nombre para la acción.' },
      descripcion: { type: 'string', description: 'Descripción breve, en lenguaje natural, de qué se va a ejecutar — se le muestra al usuario para confirmar.' },
    },
    required: ['rpc', 'descripcion'],
  },
}

type BloqueAnthropic =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

// Mismo par de herramientas, formato de tool distinto por API — Anthropic
// (Messages API) usa name/description/input_schema planos; OpenAI (Chat
// Completions API) envuelve eso en {type:'function', function:{...,
// parameters}}. Derivar la forma de OpenAI de la misma fuente evita
// mantener dos definiciones del esquema por separado.
function herramientaOpenAI(h: typeof HERRAMIENTA_LEER) {
  return { type: 'function' as const, function: { name: h.name, description: h.description, parameters: h.input_schema } }
}

type ToolCallOpenAI = { id: string; type: 'function'; function: { name: string; arguments: string } }
type MensajeOpenAI =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCallOpenAI[] }
  | { role: 'tool'; tool_call_id: string; content: string }

// La instrucción de sistema se arma en cada invocación con el catálogo de
// fuentes legibles (catalogo.ts): sin eso el modelo no tiene por qué preferir
// "leer"/"ejecutar" sobre responder de memoria, ni sabe que debe decir que no
// tiene acceso en vez de inventar. El producto derivado puede reemplazar el
// prompt base con la variable CHAT_COMPANION_SYSTEM_PROMPT; el mecanismo no
// depende de su contenido.

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

  let body: { conversacion_id?: string; mensaje?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Cuerpo inválido: se esperaba JSON.' }, 400)
  }
  if (!body.mensaje) return jsonResponse({ error: 'Falta "mensaje".' }, 400)

  // Nunca service-role para datos de negocio — toda lectura/escritura corre
  // con el RLS del propio usuario.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })

  // Gobernanza real, vía las funciones ya existentes de governed-ai-core
  // (private.resolver_politica_ia / obtener_clave_perfil_ia) — otorgadas
  // acá a service_role (ver comentario en la migración de esta spec):
  // el chat companion es una funcionalidad centralizada, no un worker de
  // cliente, así que usa el mismo nivel de confianza que cualquier Edge
  // Function de este proyecto, nunca el del navegador.
  const { data: politicaFilas, error: politicaError } = await admin.rpc('resolver_politica_ia', { p_codigo: CONSUMIDOR_CODIGO })
  const politica = politicaFilas?.[0]
  if (politicaError || !politica) {
    return jsonResponse(
      { error: 'El chat no está configurado todavía: falta una política aprobada para "chat-ia-leer". Un superadmin debe crearla en /ia/contratos y /ia/politicas.' },
      503,
    )
  }

  // Conversación: crea una nueva si no vino conversacion_id, o reusa la
  // existente (la RLS de conversaciones_chat_ia ya exige que sea del
  // propio usuario — una conversacion_id ajena simplemente no matchea).
  let conversacionId = body.conversacion_id
  if (!conversacionId) {
    const { data: nueva, error: nuevaError } = await asUser
      .from('conversaciones_chat_ia')
      .insert({ usuario_id: callerData.user.id })
      .select('id')
      .single()
    if (nuevaError || !nueva) return jsonResponse({ error: 'No se pudo crear la conversación.' }, 500)
    conversacionId = nueva.id
  }

  await asUser.from('mensajes_chat_ia').insert({ conversacion_id: conversacionId, origen: 'usuario', contenido: body.mensaje })

  async function responderError(mensaje: string, status: number) {
    await asUser.from('mensajes_chat_ia').insert({ conversacion_id: conversacionId, origen: 'chat', contenido: mensaje, estado: 'fallida' })
    return jsonResponse({ conversacion_id: conversacionId, error: mensaje }, status)
  }

  // prepararInvocacion valida presupuesto/esquema/aislamiento y sanitiza
  // antes de que nada salga hacia el proveedor — mismo camino que
  // cualquier otro consumidor de packages/ia, sin reimplementar esa lógica.
  let entradaSanitizada: Record<string, unknown>
  try {
    entradaSanitizada = prepararInvocacion(
      CONTRATO,
      {
        // id/contratoId/perfilPrincipalId: validarPoliticaActiva los
        // exige (sin ellos trata la política como inactiva, no solo
        // mirando el estado).
        id: politica.politica_id,
        contratoId: politica.contrato_id,
        perfilPrincipalId: politica.perfil_principal_id,
        estado: 'aprobada',
        limiteIntentos: politica.limite_intentos,
        limiteSegundos: politica.limite_segundos,
        perfilFallbackId: politica.perfil_fallback_id,
      },
      { mensaje: body.mensaje },
      // 0, no 1: intentos ya consumidos antes de esta llamada (ver
      // packages/ia-navegacion/src/intentarRecuperarPaso.ts, el único otro
      // consumidor real — interaccion.intentos arranca en 0). Con 1 acá,
      // 1 >= limiteIntentos(1) siempre tira LIMITE_INTENTOS_IA.
      0,
      new Date(),
    )
  } catch (error) {
    return await responderError(error instanceof Error ? error.message : 'ENTRADA_IA_INVALIDA', 400)
  }

  const { data: credencialFilas, error: credencialError } = await admin.rpc('obtener_clave_perfil_ia', { p_perfil_id: politica.perfil_principal_id })
  const credencial = credencialFilas?.[0]
  if (credencialError || !credencial) return await responderError('No se pudo resolver la credencial del proveedor de IA.', 500)

  // Anthropic y OpenAI implementados — el adaptador real a usar lo decide
  // la política que un superadmin apruebe; cualquier otro falla con un
  // error claro en vez de armar un cuerpo de request con el formato
  // equivocado (nunca asumir un formato no verificado).
  if (credencial.adaptador !== 'anthropic' && credencial.adaptador !== 'openai') {
    return await responderError(`El chat todavía no soporta el adaptador "${credencial.adaptador}" — solo Anthropic y OpenAI por ahora.`, 501)
  }

  const perfil: PerfilModelo = { id: politica.perfil_principal_id, proveedorCodigo: credencial.proveedor_codigo, modeloId: credencial.modelo_id }

  // Descubrimiento de fuentes (FR-001..FR-004): qué puede leer ESTE usuario se
  // resuelve en la capa de datos, con su propia sesión (chat_fuentes_disponibles
  // recorta por puede_chat_leer_funcionalidad y devuelve las columnas de cada
  // vista). Nunca decide el modelo ni el prompt: si una fuente no está acá, no
  // existe para el chat.
  let fuentes: FuenteChat[] = []
  try {
    const { data, error } = await asUser.rpc('chat_fuentes_disponibles')
    if (error) console.error('chat-ia-responder: no se pudo listar fuentes', error.message)
    else fuentes = (data ?? []) as FuenteChat[]
  } catch (error) {
    console.error('chat-ia-responder: no se pudo listar fuentes', error)
  }

  // La herramienta "leer" lleva el catálogo de vistas legibles con sus columnas
  // (así el modelo usa el nombre exacto de la vista y sabe qué puede filtrar).
  const herramientaLeer = { ...HERRAMIENTA_LEER, description: construirDescripcionLeer(fuentes) }
  const systemPrompt = construirSystemPrompt(fuentes, Deno.env.get('CHAT_COMPANION_SYSTEM_PROMPT') ?? undefined)

  async function leer(vista: string, entrada: EntradaLeer) {
    const { data: fuente } = await asUser.from('fuentes_chat_ia').select('feature_id').eq('vista', vista).maybeSingle()
    if (!fuente) return { error: 'FUENTE_NO_DISPONIBLE' }

    const { data: puedeLeer } = await asUser.rpc('puede_chat_leer_funcionalidad', { p_feature_id: fuente.feature_id })
    if (!puedeLeer) return { error: 'FUENTE_NO_DISPONIBLE' }

    // Las columnas ya vinieron del descubrimiento: con ellas el plan descarta
    // un criterio sobre una columna inventada ANTES de golpear la base (era el
    // origen de ERROR_AL_LEER en el producto de origen).
    const columnas = fuentes.find((f) => f.vista === vista)?.columnas ?? []
    const plan = planificarConsulta(vista, entrada, columnas)

    // PostgREST toma el schema por header, no en la ruta: asUser.from('dominio.x')
    // busca la tabla "dominio.x" en public y da 404 (PGRST205).
    const cliente = plan.esquema === 'public' ? asUser : asUser.schema(plan.esquema)

    function consultar(conCriterios: boolean) {
      let query = cliente.from(plan.tabla).select(plan.seleccion)
      if (conCriterios) {
        for (const filtro of plan.igualdad) query = query.eq(filtro.columna, filtro.valor)
        for (const criterio of plan.rango) {
          if (criterio.desde !== undefined) query = query.gte(criterio.columna, criterio.desde)
          if (criterio.hasta !== undefined) query = query.lte(criterio.columna, criterio.hasta)
        }
      }
      // Con agregados la respuesta es una sola fila de totales: ni orden ni tope.
      if (plan.agregados.length > 0) return query
      if (plan.orden) query = query.order(plan.orden.columna, { ascending: plan.orden.direccion === 'asc' })
      return query.limit(plan.limite)
    }

    let { data, error } = await consultar(true)
    // Red de seguridad (FR-010): un criterio con columna válida pero valor no
    // convertible igual hace fallar la consulta (400). Se reintenta sin
    // criterios en vez de perder la respuesta — el RLS ya acotó los datos a la
    // organización, y el modelo declara en su respuesta que el criterio no se
    // pudo aplicar.
    let descartados = [...plan.descartados]
    if (error && (plan.igualdad.length > 0 || plan.rango.length > 0)) {
      const reintento = await consultar(false)
      if (!reintento.error) {
        data = reintento.data
        error = null
        descartados.push('los filtros/rangos no se pudieron aplicar y se devolvieron los datos sin acotar')
      } else {
        error = reintento.error
      }
    }
    if (error) return { error: 'ERROR_AL_LEER' }

    // CONTRATO.datosPermitidos es el allowlist de la ENTRADA (mensaje del
    // usuario) — no aplica acá. sanitizarDato(data, CONTRATO.datosPermitidos)
    // borraría casi todas las columnas de cualquier vista real (solo dejaría
    // pasar las que coincidieran por nombre con 'mensaje'/'organizacion_id').
    // El límite de seguridad real de qué datos puede ver el chat ya lo decide
    // el superadmin al registrar la vista en fuentes_chat_ia — no hace falta
    // un segundo allowlist por fila encima de eso.
    const extra = descartados.length > 0 ? { criteriosDescartados: descartados } : {}
    if (plan.agregados.length > 0) return { agregados: data, ...extra }
    return { filas: data, ...extra }
  }

  // Propone la acción — nunca la ejecuta acá. Ejecutar de verdad es
  // private.ejecutar_accion_chat_ia, llamada solo tras la confirmación
  // explícita del usuario en la UI.
  async function proponerEjecucion(rpc: string, parametros: Record<string, unknown>, descripcion: string) {
    const { data: accion } = await asUser.from('acciones_chat_ia').select('feature_id').eq('rpc', rpc).maybeSingle()
    if (!accion) return { propuesta: false, motivo: 'ACCION_NO_DISPONIBLE' }

    const { data: puedeEjecutar } = await asUser.rpc('puede_chat_ejecutar_funcionalidad', { p_feature_id: accion.feature_id })
    if (!puedeEjecutar) return { propuesta: false, motivo: 'ACCION_NO_DISPONIBLE' }

    await asUser.from('mensajes_chat_ia').insert({
      conversacion_id: conversacionId,
      origen: 'chat',
      contenido: descripcion,
      estado: 'propuesta',
      accion_feature_id: accion.feature_id,
      accion_rpc: rpc,
      accion_parametros: parametros,
    })
    return { propuesta: true }
  }

  // Compartido entre los dos adaptadores: ejecuta la herramienta pedida y
  // devuelve qué hacer — terminar la respuesta acá (propuesta creada o
  // acción rechazada) o seguir el ciclo con el resultado de "leer".
  type ResultadoHerramienta =
    | { tipo: 'propuesta' }
    | { tipo: 'rechazo'; mensaje: string }
    | { tipo: 'resultado'; valor: unknown }

  async function manejarHerramienta(name: string, input: Record<string, unknown>): Promise<ResultadoHerramienta> {
    if (name === 'ejecutar') {
      const i = input as { rpc?: string; parametros?: Record<string, unknown>; descripcion?: string }
      const resultado = i.rpc && i.descripcion
        ? await proponerEjecucion(i.rpc, i.parametros ?? {}, i.descripcion)
        : { propuesta: false }
      if (resultado.propuesta) return { tipo: 'propuesta' }
      return { tipo: 'rechazo', mensaje: 'Esa acción no está disponible para tu organización.' }
    }
    if (name === 'leer') {
      const i = input as EntradaLeer
      const resultado = i.vista ? await leer(String(i.vista), i) : { error: 'FUENTE_NO_DISPONIBLE' }
      return { tipo: 'resultado', valor: resultado }
    }
    return { tipo: 'resultado', valor: { error: 'HERRAMIENTA_DESCONOCIDA' } }
  }

  // ========================================================================
  // Ciclo Anthropic (Messages API)
  // ========================================================================
  async function cicloAnthropic(): Promise<Response> {
    const mensajes: Array<{ role: 'user' | 'assistant'; content: string | BloqueAnthropic[] }> = [
      { role: 'user', content: String(entradaSanitizada.mensaje) },
    ]

    async function llamar() {
      return await invocarProveedorIa(
        perfil,
        credencial.clave,
        { model: perfil.modeloId, max_tokens: 1024, system: systemPrompt, tools: [herramientaLeer, HERRAMIENTA_EJECUTAR], messages: mensajes },
        (url, init) => fetch(url, init),
      ) as { content: BloqueAnthropic[]; stop_reason: string }
    }

    let respuesta: { content: BloqueAnthropic[]; stop_reason: string }
    try {
      respuesta = await llamar()
    } catch (error) {
      console.error('chat-ia-responder: fallo al invocar proveedor', error)
      return await responderError('No pude obtener una respuesta del proveedor de IA, probá de nuevo.', 502)
    }

    // Un único ciclo de tool-calling (alcance de este mecanismo).
    if (respuesta.stop_reason === 'tool_use') {
      const bloqueTool = respuesta.content.find((b): b is Extract<BloqueAnthropic, { type: 'tool_use' }> => b.type === 'tool_use')
      if (bloqueTool) {
        const resultado = await manejarHerramienta(bloqueTool.name, bloqueTool.input)

        if (resultado.tipo === 'propuesta') return jsonResponse({ conversacion_id: conversacionId, propuesta: true }, 200)
        if (resultado.tipo === 'rechazo') {
          await asUser.from('mensajes_chat_ia').insert({ conversacion_id: conversacionId, origen: 'chat', contenido: resultado.mensaje })
          return jsonResponse({ conversacion_id: conversacionId, respuesta: resultado.mensaje }, 200)
        }

        mensajes.push({ role: 'assistant', content: respuesta.content })
        mensajes.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: bloqueTool.id, content: JSON.stringify(resultado.valor) }] })

        try {
          respuesta = await llamar()
        } catch (error) {
          console.error('chat-ia-responder: fallo al invocar proveedor', error)
          return await responderError('No pude obtener una respuesta del proveedor de IA, probá de nuevo.', 502)
        }
      }
    }

    const textoFinal = respuesta.content.find((b): b is Extract<BloqueAnthropic, { type: 'text' }> => b.type === 'text')?.text
      ?? mensajeSinRespuesta(fuentes)
    await asUser.from('mensajes_chat_ia').insert({ conversacion_id: conversacionId, origen: 'chat', contenido: textoFinal })
    return jsonResponse({ conversacion_id: conversacionId, respuesta: textoFinal }, 200)
  }

  // ========================================================================
  // Ciclo OpenAI (Chat Completions API) — formato de tool-calling distinto:
  // tools envueltas en {type:'function', function:{...}}, la respuesta trae
  // choices[0].message.tool_calls en vez de bloques content, y el
  // resultado de una herramienta vuelve como mensaje {role:'tool',
  // tool_call_id, content} en vez de un bloque tool_result.
  // ========================================================================
  async function cicloOpenAI(): Promise<Response> {
    const mensajes: MensajeOpenAI[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(entradaSanitizada.mensaje) },
    ]

    async function llamar() {
      return await invocarProveedorIa(
        perfil,
        credencial.clave,
        { model: perfil.modeloId, tools: [herramientaOpenAI(herramientaLeer), herramientaOpenAI(HERRAMIENTA_EJECUTAR)], messages: mensajes },
        (url, init) => fetch(url, init),
      ) as { choices: Array<{ message: { content: string | null; tool_calls?: ToolCallOpenAI[] }; finish_reason: string }> }
    }

    let respuesta: { choices: Array<{ message: { content: string | null; tool_calls?: ToolCallOpenAI[] }; finish_reason: string }> }
    try {
      respuesta = await llamar()
    } catch (error) {
      console.error('chat-ia-responder: fallo al invocar proveedor', error)
      return await responderError('No pude obtener una respuesta del proveedor de IA, probá de nuevo.', 502)
    }

    let mensajeRespuesta = respuesta.choices[0]?.message

    if (mensajeRespuesta?.tool_calls && mensajeRespuesta.tool_calls.length > 0) {
      const toolCall = mensajeRespuesta.tool_calls[0]
      let input: Record<string, unknown>
      try {
        input = JSON.parse(toolCall.function.arguments)
      } catch {
        input = {}
      }

      const resultado = await manejarHerramienta(toolCall.function.name, input)

      if (resultado.tipo === 'propuesta') return jsonResponse({ conversacion_id: conversacionId, propuesta: true }, 200)
      if (resultado.tipo === 'rechazo') {
        await asUser.from('mensajes_chat_ia').insert({ conversacion_id: conversacionId, origen: 'chat', contenido: resultado.mensaje })
        return jsonResponse({ conversacion_id: conversacionId, respuesta: resultado.mensaje }, 200)
      }

      mensajes.push({ role: 'assistant', content: mensajeRespuesta.content, tool_calls: mensajeRespuesta.tool_calls })
      mensajes.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(resultado.valor) })

      try {
        respuesta = await llamar()
      } catch (error) {
        console.error('chat-ia-responder: fallo al invocar proveedor', error)
        return await responderError('No pude obtener una respuesta del proveedor de IA, probá de nuevo.', 502)
      }
      mensajeRespuesta = respuesta.choices[0]?.message
    }

    const textoFinal = mensajeRespuesta?.content ?? mensajeSinRespuesta(fuentes)
    await asUser.from('mensajes_chat_ia').insert({ conversacion_id: conversacionId, origen: 'chat', contenido: textoFinal })
    return jsonResponse({ conversacion_id: conversacionId, respuesta: textoFinal }, 200)
  }

  return credencial.adaptador === 'openai' ? await cicloOpenAI() : await cicloAnthropic()
})
