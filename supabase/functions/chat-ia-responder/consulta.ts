// Lógica pura del armado de la consulta de lectura del chat companion (spec
// 20261018-104239-chat-lectura-filtros, FR-006..FR-010). Igual que catalogo.ts
// se separa de index.ts (que depende de Deno) para poder testearla con
// `node --test`.
//
// Qué hace: recibe la entrada cruda del modelo y las columnas conocidas de la
// vista (las que devuelve el descubrimiento, leídas de information_schema) y
// devuelve el plan de consulta ya validado — nunca deja pasar una columna
// inexistente hacia la base, que era el origen del error que se perdía toda la
// consulta en el producto de origen.
//
// Qué NO hace: no toca la base ni PostgREST. El plan es un objeto plano.

export type OperacionAgregado = 'suma' | 'cantidad' | 'promedio' | 'minimo' | 'maximo'

export type EntradaLeer = {
  vista?: unknown
  filtros?: unknown
  rango?: unknown
  orden?: unknown
  limite?: unknown
  agregar?: unknown
}

export type CriterioRango = { columna: string; desde?: string; hasta?: string }

export type Agregado = { alias: string; columna: string; operacion: OperacionAgregado }

export type PlanConsulta = {
  esquema: string
  tabla: string
  // Expresión del parámetro `select` de PostgREST: '*' o los agregados.
  seleccion: string
  igualdad: Array<{ columna: string; valor: string }>
  rango: CriterioRango[]
  orden: { columna: string; direccion: 'asc' | 'desc' } | null
  limite: number
  agregados: Agregado[]
  // Criterios que no pasaron la validación, con el motivo — el modelo los
  // declara en su respuesta en vez de responder con datos de más como si
  // nada hubiera pasado.
  descartados: string[]
}

export const LIMITE_POR_DEFECTO = 50
export const LIMITE_MAXIMO = 1000

// Sinónimos en castellano e inglés: el modelo no tiene por qué acertar la
// palabra exacta, y la operación la resuelve PostgREST igual.
const OPERACIONES: Record<string, OperacionAgregado> = {
  suma: 'suma',
  sum: 'suma',
  total: 'suma',
  cantidad: 'cantidad',
  count: 'cantidad',
  conteo: 'cantidad',
  promedio: 'promedio',
  average: 'promedio',
  avg: 'promedio',
  minimo: 'minimo',
  mínimo: 'minimo',
  min: 'minimo',
  maximo: 'maximo',
  máximo: 'maximo',
  max: 'maximo',
}

const FUNCION_POR_OPERACION: Record<OperacionAgregado, string> = {
  suma: 'sum',
  cantidad: 'count',
  promedio: 'avg',
  minimo: 'min',
  maximo: 'max',
}

// "tabla" o "esquema.tabla" — PostgREST toma el schema por header, no en la
// ruta: pedir `dominio.x` como tabla de public da 404 (PGRST205).
export function dividirVista(vista: string): { esquema: string; tabla: string } {
  const separador = vista.indexOf('.')
  if (separador <= 0) return { esquema: 'public', tabla: vista }
  return { esquema: vista.slice(0, separador), tabla: vista.slice(separador + 1) }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function aTexto(valor: unknown): string | null {
  if (typeof valor === 'string') return valor
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor)
  if (typeof valor === 'boolean') return String(valor)
  return null
}

// PostgREST arma el alias del agregado en el JSON de salida: solo acepta
// identificadores simples, así que un alias raro se sanea en vez de romper la
// consulta.
export function sanearAlias(alias: string): string {
  const limpio = alias.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '')
  if (limpio === '') return 'a_agregado'
  return /^[a-z_]/.test(limpio) ? limpio : `a_${limpio}`
}

export function normalizarLimite(valor: unknown, descartados: string[]): number {
  if (valor === undefined || valor === null) return LIMITE_POR_DEFECTO

  const numero = typeof valor === 'number'
    ? valor
    : typeof valor === 'string' && valor.trim() !== ''
      ? Number(valor)
      : Number.NaN

  if (!Number.isInteger(numero) || numero <= 0) {
    descartados.push(`límite inválido (${String(valor)}): se devolvieron hasta ${LIMITE_POR_DEFECTO} filas`)
    return LIMITE_POR_DEFECTO
  }
  if (numero > LIMITE_MAXIMO) {
    descartados.push(`límite mayor al tope ${LIMITE_MAXIMO}: se devolvieron hasta ${LIMITE_MAXIMO} filas`)
    return LIMITE_MAXIMO
  }
  return numero
}

export function planificarConsulta(vista: string, entrada: EntradaLeer, columnas: string[]): PlanConsulta {
  const descartados: string[] = []
  const conocidas = new Set(columnas)
  const { esquema, tabla } = dividirVista(vista)

  // ---- Igualdad -----------------------------------------------------------
  const igualdad: Array<{ columna: string; valor: string }> = []
  if (esObjeto(entrada.filtros)) {
    for (const [columna, valor] of Object.entries(entrada.filtros)) {
      if (!conocidas.has(columna)) {
        descartados.push(`filtro por "${columna}": no es una columna de esta vista`)
        continue
      }
      const texto = aTexto(valor)
      if (texto === null) {
        descartados.push(`filtro por "${columna}": el valor no es un texto ni un número`)
        continue
      }
      igualdad.push({ columna, valor: texto })
    }
  } else if (entrada.filtros !== undefined && entrada.filtros !== null) {
    descartados.push('filtros: se esperaba un objeto de columna/valor')
  }

  // ---- Rango (>= desde, <= hasta) ----------------------------------------
  const rango: CriterioRango[] = []
  if (esObjeto(entrada.rango)) {
    for (const [columna, extremos] of Object.entries(entrada.rango)) {
      if (!conocidas.has(columna)) {
        descartados.push(`rango por "${columna}": no es una columna de esta vista`)
        continue
      }
      if (!esObjeto(extremos)) {
        descartados.push(`rango por "${columna}": se esperaba {"desde", "hasta"}`)
        continue
      }
      const desde = aTexto(extremos.desde)
      const hasta = aTexto(extremos.hasta)
      if (desde === null && hasta === null) {
        descartados.push(`rango por "${columna}": no vino ni "desde" ni "hasta"`)
        continue
      }
      const criterio: CriterioRango = { columna }
      if (desde !== null) criterio.desde = desde
      if (hasta !== null) criterio.hasta = hasta
      rango.push(criterio)
    }
  } else if (entrada.rango !== undefined && entrada.rango !== null) {
    descartados.push('rango: se esperaba un objeto por columna')
  }

  // ---- Orden --------------------------------------------------------------
  let orden: PlanConsulta['orden'] = null
  if (esObjeto(entrada.orden)) {
    const columna = aTexto(entrada.orden.columna)
    if (columna === null || !conocidas.has(columna)) {
      descartados.push(`orden por "${columna ?? '?'}": no es una columna de esta vista`)
    } else {
      const direccion = aTexto(entrada.orden.direccion)
      if (direccion !== null && direccion !== 'asc' && direccion !== 'desc') {
        descartados.push(`dirección de orden desconocida ("${direccion}"): se ordenó ascendente`)
      }
      orden = { columna, direccion: direccion === 'desc' ? 'desc' : 'asc' }
    }
  } else if (entrada.orden !== undefined && entrada.orden !== null) {
    descartados.push('orden: se esperaba {"columna", "direccion"}')
  }

  // ---- Límite -------------------------------------------------------------
  const limite = normalizarLimite(entrada.limite, descartados)

  // ---- Agregados ----------------------------------------------------------
  const agregados: Agregado[] = []
  if (esObjeto(entrada.agregar)) {
    const usados = new Set<string>()
    for (const [alias, definicion] of Object.entries(entrada.agregar)) {
      if (!esObjeto(definicion)) {
        descartados.push(`agregado "${alias}": se esperaba {"columna", "operacion"}`)
        continue
      }
      const columna = aTexto(definicion.columna)
      if (columna === null || !conocidas.has(columna)) {
        descartados.push(`agregado "${alias}": "${columna ?? '?'}" no es una columna de esta vista`)
        continue
      }
      const operacion = OPERACIONES[String(definicion.operacion ?? '').trim().toLowerCase()]
      if (operacion === undefined) {
        descartados.push(`agregado "${alias}": operación "${String(definicion.operacion ?? '')}" no soportada`)
        continue
      }
      let aliasLimpio = sanearAlias(alias)
      while (usados.has(aliasLimpio)) aliasLimpio = `${aliasLimpio}_2`
      usados.add(aliasLimpio)
      agregados.push({ alias: aliasLimpio, columna, operacion })
    }
  } else if (entrada.agregar !== undefined && entrada.agregar !== null) {
    descartados.push('agregar: se esperaba un objeto alias -> {columna, operacion}')
  }

  const seleccion = agregados.length > 0
    ? agregados.map((a) => `${a.alias}:${a.columna}.${FUNCION_POR_OPERACION[a.operacion]}()`).join(',')
    : '*'

  return {
    esquema,
    tabla,
    seleccion,
    igualdad,
    rango,
    // Con agregados la respuesta es una sola fila de totales: ordenar y
    // acotar filas no aplica (y PostgREST no ordena por columna agregada).
    orden: agregados.length > 0 ? null : orden,
    limite,
    agregados,
    descartados,
  }
}
