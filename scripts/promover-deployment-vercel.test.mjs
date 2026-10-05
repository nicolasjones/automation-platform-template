import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';

const script = path.resolve('scripts/promover-deployment-vercel.mjs');

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VERCEL_TOKEN: '', VERCEL_PROJECT_ID: '', VERCEL_API_URL: '', ...env },
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function withFakeVercelApi(handler, server) {
  const srv = server ?? http.createServer(handler);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();
  try {
    return await handler(`http://127.0.0.1:${port}`, srv);
  } finally {
    await new Promise((resolve) => srv.close(resolve));
  }
}

test('rechaza sin --branch antes de tocar la red', async () => {
  const result = await run([]);
  assert.notEqual(result.code, 0);
});

test('rechaza sin VERCEL_TOKEN antes de tocar la red', async () => {
  const result = await run(['--branch', 'production']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERCEL_TOKEN/);
});

test('rechaza sin VERCEL_PROJECT_ID antes de tocar la red', async () => {
  const result = await run(['--branch', 'production'], { VERCEL_TOKEN: 'token-de-prueba' });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERCEL_PROJECT_ID/);
});

test('promueve el deployment READY más reciente de la rama', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url.startsWith('/v6/deployments')) {
      res.end(JSON.stringify({ deployments: [{ uid: 'dpl_1', readyState: 'READY' }] }));
    } else if (req.method === 'POST' && req.url.startsWith('/v10/projects/')) {
      assert.match(req.url, /\/promote\/dpl_1$/);
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await withFakeVercelApi(async (apiUrl) => {
    const result = await run(
      ['--branch', 'production'],
      { VERCEL_TOKEN: 'token-de-prueba', VERCEL_PROJECT_ID: 'prj_123', VERCEL_API_URL: apiUrl },
    );
    assert.equal(result.code, 0);
    assert.match(result.stdout, /promovido a producción/);
  }, server);
});

test('reintenta hasta que el deployment esté READY y después promueve', async () => {
  let intentos = 0;
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url.startsWith('/v6/deployments')) {
      intentos += 1;
      const readyState = intentos < 2 ? 'BUILDING' : 'READY';
      res.end(JSON.stringify({ deployments: [{ uid: 'dpl_2', readyState }] }));
    } else if (req.method === 'POST' && req.url.startsWith('/v10/projects/')) {
      res.end(JSON.stringify({ ok: true }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await withFakeVercelApi(async (apiUrl) => {
    const result = await run(
      ['--branch', 'production', '--timeout-ms', '10000', '--poll-interval-ms', '50'],
      { VERCEL_TOKEN: 'token-de-prueba', VERCEL_PROJECT_ID: 'prj_123', VERCEL_API_URL: apiUrl },
    );
    assert.equal(result.code, 0);
    assert.ok(intentos >= 2);
  }, server);
});

test('falla si el deployment más reciente terminó en ERROR', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && req.url.startsWith('/v6/deployments')) {
      res.end(JSON.stringify({ deployments: [{ uid: 'dpl_3', readyState: 'ERROR' }] }));
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await withFakeVercelApi(async (apiUrl) => {
    const result = await run(
      ['--branch', 'production'],
      { VERCEL_TOKEN: 'token-de-prueba', VERCEL_PROJECT_ID: 'prj_123', VERCEL_API_URL: apiUrl },
    );
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /ERROR/);
  }, server);
});
