import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))

test('supabase/functions/_shared/ia está sincronizado con packages/ia/src (correr pnpm ia:sincronizar-edge-functions)', () => {
  execFileSync('node', [join(raiz, 'scripts/sincronizar-ia-edge-functions.mjs')])
  execFileSync('git', ['diff', '--exit-code', '--quiet', '--', 'supabase/functions/_shared/ia'], { cwd: raiz })
})
