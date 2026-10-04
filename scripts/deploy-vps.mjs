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

// Playwright NO entra en este loop: a diferencia de Kestra/Superset/Nango,
// no es un producto de plataforma compartido — cada cliente corre su propia
// instancia dedicada (decisión ya tomada y documentada en el producto
// derivado; `docs/architecture.md` ya dejaba esto como pregunta abierta:
// "la IP del VPS... queda por resolver cuando se escriba el primer flow
// real que lo use"). Tratarlo como compartido en este mecanismo genérico
// hizo que el deploy a producción chocara en T025 con
// "Bind for 127.0.0.1:3103 failed: port is already allocated" contra una
// instancia dedicada real ya corriendo en el mismo VPS.
for (const product of ['kestra', 'superset', 'nango']) {
  const productDir = path.join(root, 'infra', product);
  const composeBase = `infra/${product}/compose.yaml`;
  const composeVps = `infra/${product}/compose.vps.yaml`;
  // --project-directory fija explícitamente dónde resuelven las rutas
  // relativas dentro de cada compose.yaml (p. ej. "./superset_config.py").
  // Sin esto, qué directorio ancla esas rutas depende de la versión de
  // Docker Compose (algunas usan el directorio del primer -f, otras el cwd
  // del proceso) — distinto entre Compose v5.4.0 (local) y la versión del
  // runner self-hosted causó un IsADirectoryError real en superset-init
  // (Docker crea un directorio vacío cuando el bind mount apunta a un
  // archivo que no existe en la ruta resuelta). Detectado en T025.
  const args = ['compose', '--project-name', `platform-${environment}-${product}`, '--project-directory', productDir, '--env-file', envFile, '-f', composeBase, '-f', composeVps];
  await run('docker', [...args, 'config', '--quiet'], { cwd: root });
  // --ignore-buildable salta los servicios con build: (p. ej. superset-init) que no
  // tienen de dónde bajarse; build los compila a partir de su Dockerfile. Separado
  // de up --build (como usa dev:superset) para que el log distinga cuál paso falló.
  await run('docker', [...args, 'pull', '--ignore-buildable'], { cwd: root });
  await run('docker', [...args, 'build'], { cwd: root });
  await run('docker', [...args, 'up', '-d', '--remove-orphans'], { cwd: root });
  await run('docker', [...args, 'ps'], { cwd: root });
}
