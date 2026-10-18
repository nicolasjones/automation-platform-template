# CI self-hosted y almacenamiento

Los jobs principales usan runners self-hosted. No se configura `cache: pnpm`
en `actions/setup-node`: las cachés de dependencias se almacenan en GitHub
aunque el job se ejecute en infraestructura propia.

En su lugar, todas las réplicas del runner usan un store de pnpm persistente
en un volumen Docker local (`platform-runner-pnpm-store` por defecto),
compartible con los runners de otros productos de la misma máquina. Una
dependencia se descarga una vez por máquina y sobrevive a la recreación de
los contenedores. Operación, seguridad del acceso concurrente y limpieza:
`docs/deployment.md` (sección "Réplicas, memoria, red y store de pnpm del
runner").

## Stack de base de datos del CI y puerto publicado

El job `database` se conecta al stack aislado del CI por el puerto publicado
en el host (`SUPABASE_DB_PORT`, `20000 + p % 10000`), no por la red de
contenedores. Ese stack **se reutiliza entre corridas**, así que su contenedor
`supabase_db_ci-<repo>` puede llevar días arriba: cuando el reenvío de puertos
de Docker Desktop queda muerto, toda conexión a `host.docker.internal:25434`
se cierra al instante y `pnpm db:reset:ci` falla con
`psql: error: connection to server at "host.docker.internal" ... server closed
the connection unexpectedly` — antes de aplicar ninguna migración, así que el
fallo no es del cambio que se está probando.

Diagnóstico y arreglo (reproducible: `docker exec supabase_db_ci-<repo> psql
"postgresql://postgres:postgres@host.docker.internal:<puerto>/postgres" -c
"select 1"` falla igual, mientras que el mismo `psql` por el socket interno
funciona):

```bash
docker restart supabase_db_ci-<repo>   # vuelve a enlazar el puerto publicado
```

Después del `restart` hay que reintentar el job (`gh run rerun --failed`); el
`db:reset:ci` de la corrida deja la base limpia de nuevo.
