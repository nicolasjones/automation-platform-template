import fs from 'node:fs';
import process from 'node:process';

const reportPath = process.argv[2];
const exceptionsPath = process.argv[3];
if (!reportPath) {
  throw new Error('Uso: node scripts/validar-scan-worker.mjs <reporte.json>');
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const exceptions = exceptionsPath
  ? JSON.parse(fs.readFileSync(exceptionsPath, 'utf8')).exceptions ?? []
  : [];
// --format json ya no existe en docker scout (reemplazado por --format
// gitlab) — el reporte GitLab trae severity en "Title Case"
// ("Critical"/"High"), no en mayúsculas ni minúsculas sueltas; se compara
// sin distinguir mayúsculas para no depender de la convención exacta de
// cada versión del CLI.
const blocked = new Set(['CRITICAL', 'HIGH']);
const findings = [];

function collect(value) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.severity === 'string' && blocked.has(value.severity.toUpperCase())) findings.push(value);
  for (const child of Object.values(value)) collect(child);
}

collect(report);
const now = Date.now();
const unresolved = findings.filter((finding) => {
  // El reporte GitLab trae un `id` interno (hash) además del CVE real —
  // priorizar el identificador humano/estable para que las excepciones se
  // puedan referenciar por CVE, no por un hash que cambia entre corridas.
  const id = finding.cve ?? finding.CVE ?? finding.vulnerabilityId ?? finding.id;
  return !exceptions.some((exception) =>
    exception.id === id &&
    exception.approved_by &&
    exception.reference &&
    exception.justification &&
    Date.parse(exception.expires_at) > now,
  );
});

if (unresolved.length) {
  process.stderr.write(`El reporte contiene ${findings.length} vulnerabilidad(es) crítica(s)/alta(s).\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Scan sin vulnerabilidades críticas o altas.\n');
}
