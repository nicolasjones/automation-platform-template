# Quickstart: Guarda de versiones únicas de migraciones

## Guarda sola

```bash
pnpm migrations:check
# Versiones de supabase/migrations/ únicas.

node --test scripts/verificar-versiones-migraciones.test.mjs
# 4 pass
```

## Caso de falla (en una rama descartable)

```bash
cp supabase/migrations/20260930140000_mapeo_identificadores_clientes.sql \
   supabase/migrations/20260930140000_copia.sql
pnpm migrations:check   # código 1, "versión 20260930140000 duplicada: ..."
pnpm db:reset:ci        # código 1 con el mismo mensaje, sin tocar la base
rm supabase/migrations/20260930140000_copia.sql
```

Para el reset, correrlo solo contra el stack del CI (`pnpm db:ci:preparar`
antes). La guarda corre antes de `verificarDestinoCiActual()`, así que con un
duplicado ni siquiera llega a conectarse.

## CI

Abrir un PR de prueba con el duplicado: el job `application` falla en
`pnpm migrations:check`. Cerrar el PR sin mergear.
