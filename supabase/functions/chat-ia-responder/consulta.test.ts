// Tests de la lógica pura del armado de la consulta de lectura del chat
// companion (spec 20261018-104239-chat-lectura-filtros). Corren con
// `node --test` sobre consulta.ts (sin Deno):
//
//   node --test supabase/functions/chat-ia-responder/consulta.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  LIMITE_MAXIMO,
  LIMITE_POR_DEFECTO,
  dividirVista,
  normalizarLimite,
  planificarConsulta,
  sanearAlias,
} from './consulta.ts'

const COLUMNAS = ['fecha', 'empresa', 'origen', 'debe', 'haber']

test('dividirVista resuelve public cuando la vista no trae esquema', () => {
  assert.deepEqual(dividirVista('clientes'), { esquema: 'public', tabla: 'clientes' })
})

test('dividirVista separa esquema y tabla (FR-005)', () => {
  assert.deepEqual(dividirVista('dominio.libro_mayor'), { esquema: 'dominio', tabla: 'libro_mayor' })
})

test('sanearAlias deja un identificador simple y no vacío', () => {
  assert.equal(sanearAlias('Total Debe'), 'total_debe')
  assert.equal(sanearAlias('2026'), 'a_2026')
  assert.equal(sanearAlias('!!!'), 'a_agregado')
})

test('un caso limpio no descarta nada', () => {
  const plan = planificarConsulta('dominio.libro_mayor', {
    filtros: { empresa: 'acme' },
    rango: { fecha: { desde: '2026-07-01', hasta: '2026-07-31' } },
    orden: { columna: 'fecha', direccion: 'desc' },
    limite: 20,
  }, COLUMNAS)

  assert.equal(plan.esquema, 'dominio')
  assert.equal(plan.tabla, 'libro_mayor')
  assert.deepEqual(plan.igualdad, [{ columna: 'empresa', valor: 'acme' }])
  assert.deepEqual(plan.rango, [{ columna: 'fecha', desde: '2026-07-01', hasta: '2026-07-31' }])
  assert.deepEqual(plan.orden, { columna: 'fecha', direccion: 'desc' })
  assert.equal(plan.limite, 20)
  assert.equal(plan.seleccion, '*')
  assert.deepEqual(plan.descartados, [])
})

test('un filtro por una columna inexistente se descarta, no rompe la consulta (FR-010)', () => {
  const plan = planificarConsulta('public.fuente', { filtros: { inventada: 'x', empresa: 'acme' } }, COLUMNAS)
  assert.deepEqual(plan.igualdad, [{ columna: 'empresa', valor: 'acme' }])
  assert.equal(plan.descartados.length, 1)
  assert.match(plan.descartados[0], /inventada/)
})

test('los valores de igualdad se normalizan a texto', () => {
  const plan = planificarConsulta('public.fuente', { filtros: { debe: 100.5, activo: true } }, [...COLUMNAS, 'activo'])
  assert.deepEqual(plan.igualdad, [{ columna: 'debe', valor: '100.5' }, { columna: 'activo', valor: 'true' }])
})

test('un filtro con valor booleano anidado se descarta con motivo', () => {
  const plan = planificarConsulta('public.fuente', { filtros: { empresa: { nombre: 'acme' } } }, COLUMNAS)
  assert.deepEqual(plan.igualdad, [])
  assert.match(plan.descartados[0], /no es un texto ni un número/)
})

test('filtros que no son objeto se descartan con motivo', () => {
  const plan = planificarConsulta('public.fuente', { filtros: 'empresa=acme' }, COLUMNAS)
  assert.deepEqual(plan.igualdad, [])
  assert.match(plan.descartados[0], /objeto de columna\/valor/)
})

test('el rango acepta un solo extremo (FR-006)', () => {
  const plan = planificarConsulta('public.fuente', { rango: { fecha: { desde: '2026-01-01' } } }, COLUMNAS)
  assert.deepEqual(plan.rango, [{ columna: 'fecha', desde: '2026-01-01' }])
  assert.deepEqual(plan.descartados, [])
})

test('el rango sin ningún extremo se descarta', () => {
  const plan = planificarConsulta('public.fuente', { rango: { fecha: {} } }, COLUMNAS)
  assert.deepEqual(plan.rango, [])
  assert.match(plan.descartados[0], /ni "desde" ni "hasta"/)
})

test('el rango por una columna inexistente se descarta', () => {
  const plan = planificarConsulta('public.fuente', { rango: { inventada: { desde: '1' } } }, COLUMNAS)
  assert.deepEqual(plan.rango, [])
  assert.match(plan.descartados[0], /inventada/)
})

test('el orden ascendente es el default', () => {
  const plan = planificarConsulta('public.fuente', { orden: { columna: 'fecha' } }, COLUMNAS)
  assert.deepEqual(plan.orden, { columna: 'fecha', direccion: 'asc' })
})

test('una dirección de orden desconocida se normaliza y se informa', () => {
  const plan = planificarConsulta('public.fuente', { orden: { columna: 'fecha', direccion: 'aleatorio' } }, COLUMNAS)
  assert.deepEqual(plan.orden, { columna: 'fecha', direccion: 'asc' })
  assert.match(plan.descartados[0], /dirección de orden desconocida/)
})

test('el orden por una columna inexistente se descarta (no ordena)', () => {
  const plan = planificarConsulta('public.fuente', { orden: { columna: 'inventada', direccion: 'desc' } }, COLUMNAS)
  assert.equal(plan.orden, null)
  assert.match(plan.descartados[0], /inventada/)
})

test('el límite por defecto es 50', () => {
  assert.equal(planificarConsulta('public.fuente', {}, COLUMNAS).limite, LIMITE_POR_DEFECTO)
})

test('un límite desmesurado se acota al tope', () => {
  const descartados: string[] = []
  assert.equal(normalizarLimite(99999, descartados), LIMITE_MAXIMO)
  assert.match(descartados[0], /tope/)
})

test('un límite inválido cae al default y se informa', () => {
  for (const valor of [0, -5, 1.5, '', 'muchas', null]) {
    const descartados: string[] = []
    assert.equal(normalizarLimite(valor, descartados), LIMITE_POR_DEFECTO)
  }
  const descartados: string[] = []
  normalizarLimite(-1, descartados)
  assert.match(descartados[0], /límite inválido/)
})

test('un límite en texto numérico se acepta', () => {
  const descartados: string[] = []
  assert.equal(normalizarLimite('25', descartados), 25)
  assert.deepEqual(descartados, [])
})

test('los agregados arman la expresión de select de PostgREST (FR-009)', () => {
  const plan = planificarConsulta('dominio.libro_mayor', {
    filtros: { empresa: 'acme' },
    rango: { fecha: { desde: '2026-07-01', hasta: '2026-07-31' } },
    agregar: {
      total_debe: { columna: 'debe', operacion: 'suma' },
      movimientos: { columna: 'fecha', operacion: 'cantidad' },
    },
  }, COLUMNAS)

  assert.equal(plan.seleccion, 'total_debe:debe.sum(),movimientos:fecha.count()')
  assert.deepEqual(plan.agregados, [
    { alias: 'total_debe', columna: 'debe', operacion: 'suma' },
    { alias: 'movimientos', columna: 'fecha', operacion: 'cantidad' },
  ])
  assert.deepEqual(plan.descartados, [])
})

test('con agregados no aplican orden ni límite', () => {
  const plan = planificarConsulta('public.fuente', {
    orden: { columna: 'fecha', direccion: 'desc' },
    limite: 10,
    agregar: { total: { columna: 'debe', operacion: 'suma' } },
  }, COLUMNAS)
  assert.equal(plan.orden, null)
  assert.equal(plan.agregados.length, 1)
})

test('las operaciones de agregado aceptan sinónimos en inglés y castellano', () => {
  const plan = planificarConsulta('public.fuente', {
    agregar: {
      a: { columna: 'debe', operacion: 'sum' },
      b: { columna: 'debe', operacion: 'promedio' },
      c: { columna: 'debe', operacion: 'MAX' },
      d: { columna: 'debe', operacion: 'min' },
    },
  }, COLUMNAS)
  assert.deepEqual(plan.agregados.map((a) => a.operacion), ['suma', 'promedio', 'maximo', 'minimo'])
  assert.equal(plan.seleccion, 'a:debe.sum(),b:debe.avg(),c:debe.max(),d:debe.min()')
})

test('una operación no soportada descarta ese agregado', () => {
  const plan = planificarConsulta('public.fuente', {
    agregar: { raro: { columna: 'debe', operacion: 'mediana' } },
  }, COLUMNAS)
  assert.deepEqual(plan.agregados, [])
  assert.equal(plan.seleccion, '*')
  assert.match(plan.descartados[0], /no soportada/)
})

test('un agregado sobre una columna inexistente se descarta', () => {
  const plan = planificarConsulta('public.fuente', {
    agregar: { total: { columna: 'inventada', operacion: 'suma' } },
  }, COLUMNAS)
  assert.deepEqual(plan.agregados, [])
  assert.match(plan.descartados[0], /inventada/)
})

test('un alias inválido se sanea y un alias repetido no colisiona', () => {
  const plan = planificarConsulta('public.fuente', {
    agregar: {
      'Total Debe': { columna: 'debe', operacion: 'suma' },
      total_debe: { columna: 'haber', operacion: 'suma' },
    },
  }, COLUMNAS)
  assert.deepEqual(plan.agregados.map((a) => a.alias), ['total_debe', 'total_debe_2'])
})

test('agregar que no es objeto se descarta con motivo', () => {
  const plan = planificarConsulta('public.fuente', { agregar: 'suma de debe' }, COLUMNAS)
  assert.deepEqual(plan.agregados, [])
  assert.match(plan.descartados[0], /alias -> \{columna, operacion\}/)
})

test('sin columnas conocidas (vista inexistente) todo criterio se descarta', () => {
  const plan = planificarConsulta('public.fuente_inexistente', {
    filtros: { empresa: 'acme' },
    rango: { fecha: { desde: '2026-01-01' } },
    agregar: { total: { columna: 'debe', operacion: 'suma' } },
  }, [])
  assert.deepEqual(plan.igualdad, [])
  assert.deepEqual(plan.rango, [])
  assert.deepEqual(plan.agregados, [])
  assert.equal(plan.seleccion, '*')
  assert.equal(plan.descartados.length, 3)
})
