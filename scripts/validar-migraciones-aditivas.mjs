import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { argumentValue } from './operaciones.mjs';

// FR-012 (spec 20261003-105444-cicd-staging-produccion): rechaza antes de
// producción cualquier migración destructiva (DROP TABLE/COLUMN, ALTER
// TABLE ... DROP, TRUNCATE) que no documente su camino de reversión. Sigue
// la convención ya vigente en supabase/migrations/ (ver p. ej.
// 20260914150000_orquestacion_multi_organizacion.sql): un comentario de
// encabezado con la palabra "Reversión" seguido de los pasos para
// deshacerla — no un marcador nuevo inventado por este script. Las
// instrucciones de reversión viven típicamente como DROP comentados
// (`--   drop table ...;`), por eso el chequeo de "es destructiva" ignora
// las líneas de comentario: solo mira SQL que realmente se ejecutaría.

const args = process.argv.slice(2);
const dir = argumentValue(args, '--dir', 'supabase/migrations');

const DESTRUCTIVE = /\bDROP\s+(TABLE|COLUMN)\b|\bALTER\s+TABLE\b[^;]*\bDROP\b|\bTRUNCATE\b/i;
const MARKER = /revers/i;

function sinComentarios(sql) {
  return sql.replace(/--.*$/gm, '');
}

const files = (await readdir(dir)).filter((file) => file.endsWith('.sql'));
const sinReversion = [];
for (const file of files) {
  const content = await readFile(path.join(dir, file), 'utf8');
  if (DESTRUCTIVE.test(sinComentarios(content)) && !MARKER.test(content)) sinReversion.push(file);
}

if (sinReversion.length > 0) {
  throw new Error(`Migraciones destructivas sin camino de reversión documentado (agregar un comentario con "Reversión" y los pasos para deshacerla, en el propio archivo): ${sinReversion.join(', ')}`);
}
console.log(`${files.length} migraciones verificadas en ${dir}: ninguna destructiva sin camino de reversión documentado.`);
