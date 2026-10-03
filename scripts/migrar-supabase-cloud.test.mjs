import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';

const script = path.resolve('scripts/migrar-supabase-cloud.mjs');

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SUPABASE_DB_URL: '', ...env },
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('rechaza un --entorno inválido antes de tocar la red', async () => {
  const result = await run(['--entorno', 'qa']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /staging\|production/);
});

test('rechaza cuando falta --entorno', async () => {
  const result = await run([]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /staging\|production/);
});

test('rechaza cuando falta SUPABASE_DB_URL', async () => {
  const result = await run(['--entorno', 'staging']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /SUPABASE_DB_URL/);
});
