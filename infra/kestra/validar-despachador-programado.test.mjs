// Contrato estático del flow despachador-programado (spec
// disparo-programado-ciclo-ejecuciones, FR-007): tiene que ser genérico,
// sin ninguna condición específica de un sistema -- a diferencia de
// plantilla-generico.yml/plantilla-dedicado.yml, que reciben
// sistema_externo/imagen como input y hacen SSH+docker, este flow nunca
// abre una sesión contra ningún sistema externo.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const FLOW = 'infra/kestra/flows/despachador-programado.yml';

// Las aserciones chequean estructura YAML real (ids, sql, type), no la prosa
// de los comentarios -- varios comentarios de este mismo archivo mencionan a
// propósito "sistema_externo" o "'programada'" para explicar el diseño.
const sinComentarios = (content) => content
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n');

test('despachador-programado no recibe sistema_externo ni imagen como input', async () => {
  const content = sinComentarios(await readFile(FLOW, 'utf8'));
  assert.doesNotMatch(content, /sistema_externo/, 'no debe conocer ningún sistema externo');
  assert.doesNotMatch(content, /\binputs\.imagen\b/, 'no debe conocer ninguna imagen de worker');
});

test('despachador-programado no abre SSH ni docker (eso lo hacen los flows de producto vía outbox)', async () => {
  const content = sinComentarios(await readFile(FLOW, 'utf8'));
  assert.doesNotMatch(content, /io\.kestra\.plugin\.fs\.ssh\./, 'no debe tener tareas SSH');
  assert.doesNotMatch(content, /docker (run|pull|image)/, 'no debe invocar docker directamente');
});

test('despachador-programado tiene un trigger Schedule, no un disparo manual únicamente', async () => {
  const content = sinComentarios(await readFile(FLOW, 'utf8'));
  assert.match(content, /type: io\.kestra\.plugin\.core\.trigger\.Schedule/, 'falta el trigger Schedule');
});

test('despachador-programado delega en iniciar_ejecucion_worker con origen programada, nunca con un disparo paralelo', async () => {
  const content = sinComentarios(await readFile(FLOW, 'utf8'));
  assert.match(content, /iniciar_ejecucion_worker\(.*'programada'\)/, 'debe llamar a iniciar_ejecucion_worker con origen programada');
  assert.doesNotMatch(content, /despachos_ejecucion/, 'no debe insertar directo en el outbox: ese efecto ya lo hace iniciar_ejecucion_worker');
});

test('despachador-programado chequea conexion_en_curso antes de disparar cada capacidad debida', async () => {
  const content = sinComentarios(await readFile(FLOW, 'utf8'));
  assert.match(content, /private\.conexion_en_curso/, 'falta el chequeo de concurrencia por conexión');
  const indexChequeo = content.indexOf('conexion_en_curso');
  const indexDisparo = content.indexOf("'programada'");
  assert.ok(indexChequeo !== -1 && indexDisparo !== -1 && indexChequeo < indexDisparo, 'el chequeo debe ocurrir antes de disparar, no después');
});
