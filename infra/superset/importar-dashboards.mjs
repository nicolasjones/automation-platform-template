import { readFile } from 'node:fs/promises';
import { argumentValue, redactError, requireEnvironment } from '../../scripts/operaciones.mjs';

const args = process.argv.slice(2);
const source = argumentValue(args, '--source');
const entorno = argumentValue(args, '--entorno');
if (!['staging', 'production'].includes(entorno)) throw new Error('Uso: node infra/superset/importar-dashboards.mjs --source <paquete.zip> --entorno staging|production');
if (!source) throw new Error('Falta --source con la ruta al paquete exportado (.zip).');

let paquete;
try {
  paquete = await readFile(source);
} catch {
  throw new Error(`No se pudo leer el paquete en ${source}.`);
}

const baseUrl = requireEnvironment('SUPERSET_URL').replace(/\/$/, '');
const username = requireEnvironment('SUPERSET_USERNAME');
const password = requireEnvironment('SUPERSET_PASSWORD');

try {
  const loginResponse = await fetch(`${baseUrl}/api/v1/security/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password, provider: 'db', refresh: false }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!loginResponse.ok) throw new Error(`Login de Superset devolvió HTTP ${loginResponse.status}.`);
  const { access_token: accessToken } = await loginResponse.json();

  const csrfResponse = await fetch(`${baseUrl}/api/v1/security/csrf_token/`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!csrfResponse.ok) throw new Error(`Obtener el CSRF token de Superset devolvió HTTP ${csrfResponse.status}.`);
  const { result: csrfToken } = await csrfResponse.json();

  const formData = new FormData();
  formData.append('formData', new Blob([paquete]), 'dashboard_export.zip');
  formData.append('overwrite', 'true');

  const importResponse = await fetch(`${baseUrl}/api/v1/dashboard/import/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'x-csrftoken': csrfToken },
    body: formData,
    signal: AbortSignal.timeout(60_000),
  });
  if (!importResponse.ok) throw new Error(`Import de Superset devolvió HTTP ${importResponse.status}.`);
  console.log(`Paquete ${source} importado contra Superset de ${entorno}.`);
} catch (error) {
  throw new Error(redactError(error));
}
