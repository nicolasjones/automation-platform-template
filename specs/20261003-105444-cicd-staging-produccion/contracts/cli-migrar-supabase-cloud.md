# Contrato CLI: `scripts/migrar-supabase-cloud.mjs`

## Invocación

```bash
node scripts/migrar-supabase-cloud.mjs --entorno staging|production
# o: pnpm db:migrar:cloud -- staging|production
```

## Entradas

| Fuente | Nombre | Requerido | Descripción |
|---|---|---|---|
| Variable de entorno | `SUPABASE_DB_URL` | Sí | Cadena de conexión Postgres del proyecto cloud del entorno (secret del GitHub Environment correspondiente) |
| Argumento posicional / `--entorno` | `staging` \| `production` | Sí | Solo valida que el valor sea uno de los dos; no cambia el comportamiento del script (la diferencia la da qué secret resolvió el Environment) |

## Comportamiento

1. Valida que `--entorno` sea `staging` o `production`; cualquier otro valor es error antes de tocar la red (mismo patrón que `deploy-vps.mjs` línea 7).
2. Valida que `SUPABASE_DB_URL` esté definida (reutiliza `requireEnvironment` de `scripts/operaciones.mjs`); si falta, falla con un mensaje que nombra la variable, nunca con un error ambiguo de conexión.
3. Ejecuta `supabase db push --db-url "$SUPABASE_DB_URL"` vía `operaciones.mjs#run()`.
4. Si no hay migraciones nuevas que aplicar, el comando subyacente de Supabase CLI termina en éxito sin error (comportamiento nativo de `db push`) — el script no necesita lógica propia para este caso.
5. Cualquier error del CLI de Supabase se redacta con `redactError` antes de propagarse (ya cubre `KESTRA_*`; se agrega `SUPABASE_DB_URL` a la lista de valores a redactar).

## Salida

- Éxito: código de salida 0, log de `supabase db push` visible en el job (no es `quiet`, igual que `deploy-vps.mjs`).
- Error: excepción con mensaje redactado, código de salida distinto de 0 — el job de GitHub Actions lo reporta como fallido.

## Fuera de alcance de este contrato

- No hace `supabase link` ni persiste ningún estado de "proyecto vinculado" entre corridas.
- No crea el proyecto Supabase cloud — asume que ya existe y que `SUPABASE_DB_URL` ya apunta a él (ver `spec.md` → Assumptions).
