import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';

const script = path.resolve('scripts/validar-migraciones-aditivas.mjs');

async function withMigrations(files, callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'migraciones-'));
  try {
    for (const [name, content] of Object.entries(files)) await writeFile(path.join(dir, name), content);
    await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(dir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, '--dir', dir], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('acepta una migración aditiva sin advertencia', async () => {
  await withMigrations({ '001.sql': 'create table demo (id uuid primary key);' }, async (dir) => {
    const result = await run(dir);
    assert.equal(result.code, 0);
  });
});

test('rechaza una migración destructiva sin camino de reversión documentado', async () => {
  await withMigrations({ '001.sql': 'alter table demo drop column obsoleta;' }, async (dir) => {
    const result = await run(dir);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /001\.sql/);
  });
});

test('acepta una migración destructiva que documenta su Reversión', async () => {
  await withMigrations({ '001.sql': '-- Reversión: recrear la columna desde el backup previo\nalter table demo drop column obsoleta;' }, async (dir) => {
    const result = await run(dir);
    assert.equal(result.code, 0);
  });
});

test('no confunde un DROP dentro de un comentario (instrucción de reversión) con SQL ejecutable', async () => {
  await withMigrations({ '001.sql': '-- Reversión: en orden inverso a como se crea:\n--   drop table demo;\ncreate table demo (id uuid primary key);' }, async (dir) => {
    const result = await run(dir);
    assert.equal(result.code, 0);
  });
});

test('no confunde ALTER TABLE ... DROP CONSTRAINT con una migración destructiva (regresión real, ver 20261003183000_esperando_aprobacion_ia.sql)', async () => {
  await withMigrations({ '001.sql': "alter table demo drop constraint demo_check; alter table demo add constraint demo_check check (true);" }, async (dir) => {
    const result = await run(dir);
    assert.equal(result.code, 0, result.stderr);
  });
});
