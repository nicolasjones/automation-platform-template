import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';

const script = path.resolve('scripts/deploy-vps.mjs');

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('acepta el entorno con el separador "--" que pnpm reenvía sin eliminar (regresión real, T025)', async () => {
  const result = await run(['--', 'staging']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /No existe \.env\.staging/);
  assert.doesNotMatch(result.stderr, /Uso:/);
});

test('acepta el entorno sin el separador "--"', async () => {
  const result = await run(['staging']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /No existe \.env\.staging/);
});

test('rechaza un entorno inválido incluso detrás de "--"', async () => {
  const result = await run(['--', 'qa']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Uso:/);
});

test('rechaza cuando no hay ningún entorno', async () => {
  const result = await run([]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Uso:/);
});
