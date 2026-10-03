import { argumentValue, redactError, requireEnvironment, run } from './operaciones.mjs';

const args = process.argv.slice(2);
const entorno = argumentValue(args, '--entorno');
if (!['staging', 'production'].includes(entorno)) throw new Error('Uso: pnpm db:migrar:cloud -- --entorno staging|production');

const dbUrl = requireEnvironment('SUPABASE_DB_URL');

try {
  await run('supabase', ['db', 'push', '--db-url', dbUrl]);
  console.log(`Migraciones aplicadas contra el proyecto Supabase de ${entorno}.`);
} catch (error) {
  throw new Error(redactError(error));
}
