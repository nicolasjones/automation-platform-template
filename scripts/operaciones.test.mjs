import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { argumentValue, redactError, requireEnvironment, run } from './operaciones.mjs';

test('argumentValue exige el valor de un flag', () => {
  assert.equal(argumentValue(['--entorno', 'staging'], '--entorno'), 'staging');
  assert.throws(() => argumentValue(['--entorno'], '--entorno'), /Falta el valor/);
});

test('requireEnvironment no acepta valores vacíos', () => {
  const previous = process.env.TOOLING_TEST_REQUIRED;
  delete process.env.TOOLING_TEST_REQUIRED;
  assert.throws(() => requireEnvironment('TOOLING_TEST_REQUIRED'), /requerida/);
  process.env.TOOLING_TEST_REQUIRED = 'valor';
  assert.equal(requireEnvironment('TOOLING_TEST_REQUIRED'), 'valor');
  if (previous === undefined) delete process.env.TOOLING_TEST_REQUIRED; else process.env.TOOLING_TEST_REQUIRED = previous;
});

test('redactError elimina secretos presentes y no altera mensajes sin secreto', () => {
  const previous = process.env.KESTRA_BASIC_AUTH_PASSWORD;
  process.env.KESTRA_BASIC_AUTH_PASSWORD = 'secreto-de-prueba';
  assert.equal(redactError(new Error('falló secreto-de-prueba')), 'falló [REDACTADO]');
  assert.equal(redactError(new Error('falló sin datos sensibles')), 'falló sin datos sensibles');
  if (previous === undefined) delete process.env.KESTRA_BASIC_AUTH_PASSWORD; else process.env.KESTRA_BASIC_AUTH_PASSWORD = previous;
});

test('redactError también elimina SUPABASE_DB_URL', () => {
  const previous = process.env.SUPABASE_DB_URL;
  process.env.SUPABASE_DB_URL = 'postgres://usuario:secreto-de-prueba@host/db';
  assert.equal(redactError(new Error('falló postgres://usuario:secreto-de-prueba@host/db')), 'falló [REDACTADO]');
  if (previous === undefined) delete process.env.SUPABASE_DB_URL; else process.env.SUPABASE_DB_URL = previous;
});

test('run conserva el código de salida y redacta stderr', async () => {
  const previous = process.env.KESTRA_BASIC_AUTH_PASSWORD;
  process.env.KESTRA_BASIC_AUTH_PASSWORD = 'secreto-de-prueba';
  const node = process.execPath;
  await assert.rejects(
    run(node, ['-e', "console.error('secreto-de-prueba'); process.exit(23)"], { quiet: true }),
    (error) => error.message.includes('23') && error.message.includes('[REDACTADO]') && !error.message.includes('secreto-de-prueba'),
  );
  if (previous === undefined) delete process.env.KESTRA_BASIC_AUTH_PASSWORD; else process.env.KESTRA_BASIC_AUTH_PASSWORD = previous;
});
