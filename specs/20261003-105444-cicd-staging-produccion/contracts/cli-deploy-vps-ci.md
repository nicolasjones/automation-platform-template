# Contrato: `scripts/deploy-vps.mjs` invocado desde CI

Este contrato documenta el **uso desde el workflow de GitHub Actions**, no un cambio de firma del script (ver decisión en `research.md` §1-2: cero reescritura del script).

## Lo que hace el workflow antes de invocar el script (nuevo)

1. Decodifica el secret `VPS_SSH_PRIVATE_KEY` del Environment activo (Base64) a un archivo temporal dentro del workspace del job, con permisos `600`.
2. Exporta `DOCKER_HOST=ssh://<usuario>@<host>` (usuario/host del VPS de ese entorno, también como secret o variable del Environment) y `GIT_SSH_COMMAND`/`SSH_AUTH_SOCK` según corresponda para que `ssh`/`docker` usen esa clave sin prompt interactivo.
3. Sintetiza `.env.<entorno>` en el workspace del job a partir de los demás secrets del Environment (credenciales de Kestra, Superset, Nango que hoy vivían en el `.env.<entorno>` del VPS).
4. Invoca `pnpm deploy:vps -- <entorno>` sin cambios respecto al uso manual de hoy.
5. Al terminar el job (éxito o error), el workspace se descarta — el archivo `.env.<entorno>` sintetizado y la clave SSH decodificada nunca persisten más allá de esa corrida.

## Invariantes que el script ya cumple y este contrato no toca

- `scripts/deploy-vps.mjs` sigue exigiendo que `--env-file` exista y sea legible (línea 10) — eso ahora lo garantiza el paso 3 arriba, no un archivo persistente del VPS.
- `docker compose ... pull --ignore-buildable / build / up -d --remove-orphans` por producto (`kestra`, `superset`, `playwright`, `nango`) sin cambios.

## Requisito de imagen del runner (nuevo)

`infra/runner/Dockerfile` debe incluir un cliente SSH (`openssh-client`) — hoy solo instala `docker-ce-cli`, `docker-compose-plugin` y `nodejs`. Sin esto, `DOCKER_HOST=ssh://...` falla al no encontrar el binario `ssh`.

## Edge cases

- Clave SSH ausente o mal formada en el secret: el paso de decodificación falla antes de llegar a `docker`, con un error que identifica el secret, no una conexión Docker ambigua.
- Host del VPS inalcanzable: `docker compose ... config --quiet` (primer comando que ya corre `deploy-vps.mjs`) falla rápido, antes de intentar `pull`/`build`/`up`.
