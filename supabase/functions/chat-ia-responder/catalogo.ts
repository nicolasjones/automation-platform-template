// Lógica pura del descubrimiento de fuentes del chat companion
// (spec 20261018-104239-chat-lectura-filtros). Se separa de index.ts (que
// depende de Deno) para poder testearla con `node --test`.
//
// No toca la base: recibe la lista ya recortada por permiso
// (public.chat_fuentes_disponibles, con las columnas de cada vista) y solo
// arma el texto que se le inyecta al modelo — la descripción de la herramienta
// `leer` y la instrucción de sistema. El recorte real de acceso vive en la
// capa de datos, nunca en el prompt.

export type FuenteChat = {
  vista: string
  descripcion: string | null
  feature_id: string
  columnas: string[]
}

// Prompt base por defecto del mecanismo: genérico, sin identidad de producto
// (el producto derivado lo reemplaza con CHAT_COMPANION_SYSTEM_PROMPT o
// pasando su propio promptBase a construirSystemPrompt).
export const PROMPT_BASE_POR_DEFECTO =
  'Sos un asistente conversacional con acceso a los datos habilitados de esta organización.'

// Lista legible `- <vista>: <descripcion> — columnas: a, b`. Las columnas son
// metadata de una vista que el usuario ya puede leer: saberlas es lo que
// evita que el modelo invente nombres de columna al filtrar.
export function listarFuentes(fuentes: FuenteChat[]): string {
  return fuentes
    .map((f) => {
      const descripcion = f.descripcion && f.descripcion.trim() !== '' ? f.descripcion : 'sin descripción'
      const columnas = (f.columnas ?? []).length > 0 ? ` — columnas: ${f.columnas.join(', ')}` : ''
      return `- ${f.vista}: ${descripcion}${columnas}`
    })
    .join('\n')
}

// Descripción de la herramienta `leer`, con el catálogo de vistas legibles y
// sus columnas. El modelo debe usar exactamente el nombre de vista listado.
export function construirDescripcionLeer(fuentes: FuenteChat[]): string {
  const base = 'Lee datos de una funcionalidad habilitada de la organización del usuario.'
  if (fuentes.length === 0) {
    return `${base} No hay fuentes consultables para esta organización.`
  }
  return `${base} Vistas disponibles (usá EXACTAMENTE uno de estos nombres en "vista"):\n${listarFuentes(fuentes)}`
}

// Instrucción de sistema: rol, herramientas, formato, reglas de negación, cómo
// usar los filtros/rangos/agregaciones y el catálogo. Sin esto el modelo no
// sabe qué puede consultar, ni que debe negar en vez de inventar, ni que un
// total se pide con "agregar" en vez de trayendo todas las filas.
export function construirSystemPrompt(fuentes: FuenteChat[], promptBase = PROMPT_BASE_POR_DEFECTO): string {
  const catalogo = fuentes.length === 0
    ? 'No hay fuentes de datos consultables para esta organización. Si te piden un dato, respondé que no tenés acceso (nunca inventes un dato).'
    : `Fuentes de datos disponibles (son las únicas que podés consultar con "leer"; usá el nombre exacto de la vista):\n${listarFuentes(fuentes)}`

  return [
    promptBase,
    'Respondé únicamente con datos obtenidos a través de las herramientas "leer" (consultar datos) y "ejecutar" (proponer una acción; nunca la ejecutes vos mismo).',
    catalogo,
    'Tenés acceso a TODAS las fuentes listadas arriba. Nunca digas que no tenés acceso a una de ellas: si el dato pedido puede salir de una, usá "leer" con esa vista antes de responder.',
    'Si el dato pedido NO está en ninguna fuente, decí claramente qué sí podés consultar (tu lista de fuentes, en lenguaje claro) y ofrecé lo más cercano. No respondas un "no tengo acceso" genérico.',
    'Si el usuario pregunta qué podés hacer o con qué contás, enumerá las fuentes disponibles de arriba, en lenguaje claro (no los nombres técnicos de las vistas).',
    'Para "leer" usá en "filtros" solo columnas que figuren en la lista de columnas de esa vista (no las inventes). Los rangos de fechas o importes van en "rango"; el orden y la cantidad de filas en "orden" y "limite".',
    'Para totales, sumas, promedios, máximos o conteos usá "agregar": nunca traigas todas las filas para sumarlas vos.',
    'Reglas de negación: si la fuente no está en la lista, o "leer" devuelve FUENTE_NO_DISPONIBLE, decí explícitamente que no tenés acceso a esos datos. Si "leer" devuelve filas vacías, decí que no hay resultados para ese criterio (es distinto de no tener acceso). Si "leer" devuelve ERROR_AL_LEER, decí que no pudiste consultar los datos.',
    'Nunca inventes un dato ni asumas que una funcionalidad está disponible: solo podés leer las fuentes listadas arriba.',
    'Formateá la respuesta en Markdown (títulos, listas o tablas cuando corresponda), no como texto crudo.',
  ].join('\n')
}

// Mensaje de reemplazo cuando el modelo no devuelve texto (se quedó sin armar
// respuesta). Mejor que un "no encontré" seco: enumera lo que sí puede
// consultar, en vez de dejar al usuario sin salida.
export function mensajeSinRespuesta(fuentes: FuenteChat[]): string {
  if (fuentes.length === 0) {
    return 'No hay fuentes de datos consultables para esta organización todavía.'
  }
  return `No pude armar una respuesta con lo que tengo. Puedo consultar estas fuentes:\n${listarFuentes(fuentes)}`
}
