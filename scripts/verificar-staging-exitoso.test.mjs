import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';

const script = path.resolve('scripts/verificar-staging-exitoso.mjs');

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GITHUB_TOKEN: '', GITHUB_REPOSITORY: '', GITHUB_API_URL: '', ...env },
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function withFakeGitHubApi(workflowRuns, handler) {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ workflow_runs: workflowRuns }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await handler(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('rechaza sin --workflow antes de tocar la red', async () => {
  const result = await run(['--head-sha', 'abc123']);
  assert.notEqual(result.code, 0);
});

test('rechaza sin --head-sha antes de tocar la red', async () => {
  const result = await run(['--workflow', 'migraciones-cloud.yml']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /--head-sha/);
});

test('rechaza sin GITHUB_TOKEN antes de tocar la red', async () => {
  const result = await run(['--workflow', 'migraciones-cloud.yml', '--head-sha', 'abc123']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /GITHUB_TOKEN/);
});

test('aprueba cuando staging corrió exitosamente para el mismo head_sha', async () => {
  await withFakeGitHubApi(
    [{ head_sha: 'abc123', conclusion: 'success' }, { head_sha: 'otro', conclusion: 'success' }],
    async (apiUrl) => {
      const result = await run(
        ['--workflow', 'migraciones-cloud.yml', '--head-sha', 'abc123'],
        { GITHUB_TOKEN: 'token-de-prueba', GITHUB_REPOSITORY: 'org/repo', GITHUB_API_URL: apiUrl },
      );
      assert.equal(result.code, 0);
      assert.match(result.stdout, /autorizada/);
    },
  );
});

test('rechaza cuando staging nunca corrió exitosamente para ese head_sha', async () => {
  await withFakeGitHubApi(
    [{ head_sha: 'otro-commit', conclusion: 'success' }],
    async (apiUrl) => {
      const result = await run(
        ['--workflow', 'migraciones-cloud.yml', '--head-sha', 'abc123'],
        { GITHUB_TOKEN: 'token-de-prueba', GITHUB_REPOSITORY: 'org/repo', GITHUB_API_URL: apiUrl },
      );
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /no se puede promover a producción/);
    },
  );
});

test('rechaza cuando no hay ningún run exitoso de staging', async () => {
  await withFakeGitHubApi([], async (apiUrl) => {
    const result = await run(
      ['--workflow', 'migraciones-cloud.yml', '--head-sha', 'abc123'],
      { GITHUB_TOKEN: 'token-de-prueba', GITHUB_REPOSITORY: 'org/repo', GITHUB_API_URL: apiUrl },
    );
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /no se puede promover a producción/);
  });
});
