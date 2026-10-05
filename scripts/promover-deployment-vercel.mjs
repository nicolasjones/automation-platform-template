import { argumentValue, requireEnvironment, redactError } from './operaciones.mjs';

const args = process.argv.slice(2);
const branch = argumentValue(args, '--branch');
if (!branch) throw new Error('Uso: pnpm vercel:promover -- --branch <rama> [--timeout-ms <ms>]');

const timeoutMs = Number(argumentValue(args, '--timeout-ms', '300000'));
const pollIntervalMs = Number(argumentValue(args, '--poll-interval-ms', '5000'));

const token = requireEnvironment('VERCEL_TOKEN');
const projectId = requireEnvironment('VERCEL_PROJECT_ID');
const apiUrl = process.env.VERCEL_API_URL?.trim() || 'https://api.vercel.com';

// Promoción de Refine (spec 20261005-140934-promover-todo-produccion): en vez
// de depender de la "Production Branch" del proyecto Vercel (sin un campo de
// API confiable para reasignarla — ver research.md §3 revisado), se promueve
// por deployment_id vía POST /v10/projects/{id}/promote/{deploymentId}
// (point-production-traffic-to-a-given-deployment, no rebuildea nada). El
// deployment a promover es el más reciente para la rama dada (producido por
// el push explícito que hace este workflow antes de llamar este script).

async function buscarUltimoDeployment() {
  const url = `${apiUrl}/v6/deployments?projectId=${encodeURIComponent(projectId)}&branch=${encodeURIComponent(branch)}&limit=1`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`La API de Vercel respondió ${response.status} al listar deployments de la rama ${branch}.`);
  const body = await response.json();
  return Array.isArray(body.deployments) ? body.deployments[0] : undefined;
}

async function esperarDeploymentListo() {
  const vencimiento = Date.now() + timeoutMs;
  while (Date.now() < vencimiento) {
    const deployment = await buscarUltimoDeployment();
    if (!deployment) {
      console.log(`Todavía no hay ningún deployment para la rama ${branch}. Reintentando...`);
    } else if (deployment.readyState === 'READY') {
      return deployment;
    } else if (deployment.readyState === 'ERROR' || deployment.readyState === 'CANCELED') {
      throw new Error(`El deployment más reciente de la rama ${branch} (${deployment.uid}) terminó en estado ${deployment.readyState} — no se puede promover.`);
    } else {
      console.log(`Deployment ${deployment.uid} todavía en ${deployment.readyState}. Esperando...`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Ningún deployment de la rama ${branch} llegó a READY dentro de ${timeoutMs}ms.`);
}

try {
  const deployment = await esperarDeploymentListo();
  const promoteUrl = `${apiUrl}/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deployment.uid)}`;
  const response = await fetch(promoteUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const detalle = await response.text();
    throw new Error(`La API de Vercel respondió ${response.status} al promover el deployment ${deployment.uid}: ${detalle}`);
  }
  console.log(`Deployment ${deployment.uid} (rama ${branch}) promovido a producción.`);
} catch (error) {
  throw new Error(redactError(error));
}
