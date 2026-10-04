import { spawn } from 'node:child_process';

export function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable de entorno requerida ${name}.`);
  return value;
}

export function redactError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return [process.env.KESTRA_BASIC_AUTH_PASSWORD, process.env.KESTRA_WEBHOOK_KEY, process.env.IA_PROVEEDOR_CLAVE, process.env.SUPABASE_DB_URL, process.env.SUPERSET_PASSWORD]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .reduce((redacted, value) => redacted.replaceAll(value, '[REDACTADO]'), message);
}

export async function run(command, args, options = {}) {
  const { input, env, quiet = false } = options;
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...env },
      stdio: input === undefined && !quiet ? 'inherit' : ['pipe', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'],
      windowsHide: true,
    });
    let stderr = '';
    if (input !== undefined) child.stdin.end(input);
    if (quiet) child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminó con código ${code ?? signal ?? 'desconocido'}${stderr ? ': ' + redactError(new Error(stderr)) : ''}`));
    });
  });
}

export function argumentValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Falta el valor de ${name}.`);
  return value;
}
