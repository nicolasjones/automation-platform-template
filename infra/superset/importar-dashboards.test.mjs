import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';

const script = path.resolve('infra/superset/importar-dashboards.mjs');

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SUPERSET_URL: '', SUPERSET_USERNAME: '', SUPERSET_PASSWORD: '', ...env },
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('rechaza un --entorno inválido antes de tocar el filesystem o la red', async () => {
  const result = await run(['--source', 'cualquier-ruta.zip', '--entorno', 'qa']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /staging\|production/);
});

test('rechaza un --source inexistente antes de autenticar contra Superset', async () => {
  const result = await run(['--source', path.join('infra', 'superset', 'no-existe.zip'), '--entorno', 'staging']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /No se pudo leer el paquete/);
});

test('rechaza cuando falta SUPERSET_URL/USERNAME/PASSWORD', async () => {
  const result = await run(['--source', script, '--entorno', 'staging']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /SUPERSET_URL|SUPERSET_USERNAME|SUPERSET_PASSWORD/);
});
