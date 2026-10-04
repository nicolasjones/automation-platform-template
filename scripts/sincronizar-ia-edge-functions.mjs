#!/usr/bin/env node
// Deno (el runtime de las Edge Functions) no resuelve imports NodeNext con
// extensión .js que en realidad apuntan a un .ts (packages/ia/src/*.ts usa
// esa convención) ni specifiers de npm sin el prefijo "npm:". Esta copia
// mecánica es el workaround: mismo contenido que packages/ia/src, con
// .js -> .ts en los imports relativos y 'ajv' -> 'npm:ajv@8'. Correr este
// script después de cualquier cambio en packages/ia/src/ que afecte a una
// Edge Function consumidora y commitear el resultado junto con el cambio
// de origen.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const origen = join(raiz, 'packages/ia/src')
const destino = join(raiz, 'supabase/functions/_shared/ia')

function copiarDirectorio(origenDir, destinoDir) {
  mkdirSync(destinoDir, { recursive: true })
  for (const entrada of readdirSync(origenDir, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      copiarDirectorio(join(origenDir, entrada.name), join(destinoDir, entrada.name))
      continue
    }
    if (!entrada.name.endsWith('.ts') || entrada.name.endsWith('.test.ts')) continue
    let contenido = readFileSync(join(origenDir, entrada.name), 'utf8')
    contenido = contenido.replace(/from '([^']*)\.js'/g, "from '$1.ts'")
    contenido = contenido.replace(/from 'ajv'/g, "from 'npm:ajv@8'")
    writeFileSync(join(destinoDir, entrada.name), contenido)
  }
}

copiarDirectorio(origen, destino)
console.log(`Sincronizado packages/ia/src -> ${destino}`)
