import { argumentValue, requireEnvironment, redactError } from './operaciones.mjs';

const args = process.argv.slice(2);
const workflow = argumentValue(args, '--workflow');
if (!workflow) throw new Error('Uso: pnpm verificar:staging-exitoso -- --workflow <archivo.yml> --head-sha <sha> [--branch main]');

const headSha = argumentValue(args, '--head-sha');
if (!headSha) throw new Error('Falta --head-sha.');

const branch = argumentValue(args, '--branch', 'main');

const token = requireEnvironment('GITHUB_TOKEN');
const repository = requireEnvironment('GITHUB_REPOSITORY');
const apiUrl = process.env.GITHUB_API_URL?.trim() || 'https://api.github.com';

// Gate stg→prd (bug gate-migraciones-stg-prd): production no debe poder
// aplicarse sobre un commit cuyo job staging nunca corrió exitosamente para
// ese mismo head_sha. Se verifica contra la API de runs de GitHub en vez de
// requerir `needs: staging` (imposible entre disparadores distintos: push
// vs workflow_dispatch) o required reviewers (feature de plan pago en repos
// privados — ver research.md §6, Revisión 2).
const runsUrl = `${apiUrl}/repos/${repository}/actions/workflows/${workflow}/runs?branch=${encodeURIComponent(branch)}&event=push&status=success&per_page=100`;

try {
  const response = await fetch(runsUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    throw new Error(`La API de GitHub respondió ${response.status} al listar runs de ${workflow}.`);
  }

  const body = await response.json();
  const runs = Array.isArray(body.workflow_runs) ? body.workflow_runs : [];
  const exitoso = runs.some((run) => run.head_sha === headSha && run.conclusion === 'success');

  if (!exitoso) {
    console.error(
      `::error::staging nunca corrió exitosamente para el commit ${headSha} en ${workflow} — no se puede promover a producción. Volvé a correr staging (push a main) o esperá a que termine antes de disparar production.`,
    );
    process.exit(1);
  }

  console.log(`staging corrió exitosamente para ${headSha} en ${workflow}. Promoción a producción autorizada.`);
} catch (error) {
  throw new Error(redactError(error));
}
