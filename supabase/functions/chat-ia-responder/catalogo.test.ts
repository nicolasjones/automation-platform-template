// Tests de la lógica pura del catálogo de fuentes del chat companion (spec
// 20261018-104239-chat-lectura-filtros). Corren con `node --test` sobre
// catalogo.ts (sin Deno):
//
//   node --test supabase/functions/chat-ia-responder/catalogo.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  PROMPT_BASE_POR_DEFECTO,
  construirDescripcionLeer,
  construirSystemPrompt,
  listarFuentes,
  mensajeSinRespuesta,
  type FuenteChat,
} from './catalogo.ts'

const FUENTES: FuenteChat[] = [
  {
    vista: 'dominio.libro_mayor',
    descripcion: 'Libro Mayor por cuenta.',
    feature_id: 'libro-mayor',
    columnas: ['fecha', 'empresa', 'debe', 'haber'],
  },
  { vista: 'public.clientes', descripcion: 'Cartera de clientes.', feature_id: 'clientes', columnas: ['id', 'cuit'] },
]

test('listarFuentes lista cada vista con su descripción', () => {
  const texto = listarFuentes(FUENTES)
  assert.match(texto, /dominio\.libro_mayor: Libro Mayor por cuenta\./)
  assert.match(texto, /public\.clientes: Cartera de clientes\./)
})

test('listarFuentes incluye las columnas de cada fuente (FR-014)', () => {
  const texto = listarFuentes(FUENTES)
  assert.match(texto, /columnas: fecha, empresa, debe, haber/)
  assert.match(texto, /columnas: id, cuit/)
})

test('listarFuentes usa "sin descripción" cuando falta', () => {
  const texto = listarFuentes([{ vista: 'v', descripcion: null, feature_id: 'f', columnas: ['a'] }])
  assert.match(texto, /- v: sin descripción — columnas: a/)
})

test('listarFuentes omite las columnas cuando no hay (vista inexistente)', () => {
  const texto = listarFuentes([{ vista: 'v', descripcion: 'x', feature_id: 'f', columnas: [] }])
  assert.equal(texto, '- v: x')
})

test('listarFuentes devuelve vacío sin fuentes', () => {
  assert.equal(listarFuentes([]), '')
})

test('construirDescripcionLeer incluye el nombre exacto de la vista y sus columnas', () => {
  const descripcion = construirDescripcionLeer(FUENTES)
  assert.match(descripcion, /dominio\.libro_mayor/)
  assert.match(descripcion, /public\.clientes/)
  assert.match(descripcion, /columnas: fecha, empresa, debe, haber/)
})

test('construirDescripcionLeer dice que no hay fuentes cuando la lista está vacía', () => {
  const descripcion = construirDescripcionLeer([])
  assert.match(descripcion, /No hay fuentes consultables/)
  assert.doesNotMatch(descripcion, /dominio\./)
})

test('construirSystemPrompt arranca con el prompt base del mecanismo', () => {
  assert.ok(construirSystemPrompt(FUENTES).startsWith(PROMPT_BASE_POR_DEFECTO))
})

test('construirSystemPrompt acepta el prompt base del producto (FR-016)', () => {
  const prompt = construirSystemPrompt(FUENTES, 'Sos el asistente de un producto derivado.')
  assert.ok(prompt.startsWith('Sos el asistente de un producto derivado.'))
  assert.match(prompt, /dominio\.libro_mayor/)
})

test('construirSystemPrompt incluye el catálogo de fuentes legibles', () => {
  const prompt = construirSystemPrompt(FUENTES)
  assert.match(prompt, /dominio\.libro_mayor/)
  assert.match(prompt, /public\.clientes/)
})

test('construirSystemPrompt sin fuentes instruye a negar el acceso', () => {
  const prompt = construirSystemPrompt([])
  assert.match(prompt, /No hay fuentes de datos consultables/)
  assert.match(prompt, /no tenés acceso/i)
})

test('construirSystemPrompt distingue sin acceso, sin resultados y error', () => {
  const prompt = construirSystemPrompt(FUENTES)
  assert.match(prompt, /FUENTE_NO_DISPONIBLE/)
  assert.match(prompt, /no hay resultados/i)
  assert.match(prompt, /ERROR_AL_LEER/)
})

test('construirSystemPrompt pide formato Markdown', () => {
  assert.match(construirSystemPrompt(FUENTES), /Markdown/)
})

test('construirSystemPrompt prohíbe negar una fuente listada', () => {
  assert.match(construirSystemPrompt(FUENTES), /Nunca digas que no tenés acceso a una de ellas/i)
})

test('construirSystemPrompt pide enumerar las fuentes si preguntan qué puede hacer', () => {
  assert.match(construirSystemPrompt(FUENTES), /enumerá las fuentes disponibles/i)
})

test('construirSystemPrompt advierte no inventar columnas', () => {
  assert.match(construirSystemPrompt(FUENTES), /no las inventes/i)
})

test('construirSystemPrompt indica rangos, orden y totales (FR-006, FR-009)', () => {
  const prompt = construirSystemPrompt(FUENTES)
  assert.match(prompt, /"rango"/)
  assert.match(prompt, /"orden"/)
  assert.match(prompt, /"limite"/)
  assert.match(prompt, /"agregar"/)
  assert.match(prompt, /nunca traigas todas las filas/i)
})

test('mensajeSinRespuesta enumera las fuentes disponibles', () => {
  const texto = mensajeSinRespuesta(FUENTES)
  assert.match(texto, /dominio\.libro_mayor/)
  assert.match(texto, /public\.clientes/)
})

test('mensajeSinRespuesta sin fuentes no enumera nada', () => {
  assert.match(mensajeSinRespuesta([]), /No hay fuentes de datos consultables/)
})
