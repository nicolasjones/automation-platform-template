import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './operaciones.mjs';

// pnpm (confirmado en 11.19.0 y 12.3.4) no elimina el separador "--" al
// reenviar argumentos a un script ("pnpm deploy:vps -- staging" invoca
// `node scripts/deploy-vps.mjs -- staging`, con "--" como argv real) — a
// diferencia de la convención documentada de npm/pnpm run. Se filtra
// cualquier "--" literal en vez de asumir una posición fija, para que
// funcione igual con o sin él.
const environment = process.argv.slice(2).filter((value) => value !== '--')[0];
if (!['staging', 'production'].includes(environment)) throw new Error('Uso: pnpm deploy:vps -- staging|production');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, `.env.${environment}`);
try { await access(envFile); } catch { throw new Error(`No existe .env.${environment} en el VPS.`); }

for (const product of ['kestra', 'superset', 'playwright', 'nango']) {
  const composeBase = `infra/${product}/compose.yaml`;
  const composeVps = `infra/${product}/compose.vps.yaml`;
  const args = ['compose', '--project-name', `platform-${environment}-${product}`, '--env-file', envFile, '-f', composeBase, '-f', composeVps];
  await run('docker', [...args, 'config', '--quiet'], { cwd: root });
  // --ignore-buildable salta los servicios con build: (p. ej. superset-init) que no
  // tienen de dónde bajarse; build los compila a partir de su Dockerfile. Separado
  // de up --build (como usa dev:superset) para que el log distinga cuál paso falló.
  await run('docker', [...args, 'pull', '--ignore-buildable'], { cwd: root });
  await run('docker', [...args, 'build'], { cwd: root });
  await run('docker', [...args, 'up', '-d', '--remove-orphans'], { cwd: root });
  await run('docker', [...args, 'ps'], { cwd: root });
}
